// The admin area, part 2, in a real browser against the built web app and
// the real API: rooms (list, filters, pages, the room page with photos
// dropped, ordered and made the cover), coupons (state worked out from the
// data, switch, panel with checks and the "guests will see" line), reviews
// (filters, show/hide), users (server pages, search, locking with a
// reason), the property page and the destinations with their photo credit.
// Every state of each screen, both themes, three widths.
//
// Screenshots are written to test-results/phase-11/app/.
//
// Run with `npm run test:e2e` from the repository root.

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { addAdminSample, addCatalogSample } from "./admin-sample.mjs";
import { startStack } from "./stack.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = path.resolve(HERE, "../../../test-results/phase-11/app");
const requireApi = createRequire(path.resolve(HERE, "../../api/server.js"));
const sharp = requireApi("sharp");

const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 1024, height: 900 };
const PHONE = { width: 390, height: 844 };
const SIZES = [["desktop", DESKTOP], ["tablet", TABLET], ["mobile", PHONE]];
const ADMIN = { email: "admin@example.com", password: "Admin-E2E-12345" };

let stack;
let today;

async function openPage({ viewport = DESKTOP, colorScheme = "light" } = {}) {
  const context = await stack.browser.newContext({ locale: "vi-VN", viewport, colorScheme });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));
  page.on("console", (message) => {
    // Requests a test refuses or breaks on purpose, and the websocket this
    // test server does not carry (socket.io falls back to polling).
    if (message.type() === "error" && !/Failed to load resource|WebSocket|socket\.io/i.test(message.text())) {
      problems.push(`console: ${message.text()}`);
    }
  });
  await page.goto(`${stack.baseUrl}/login`);
  await page.fill("#login-email", ADMIN.email);
  await page.fill("#login-password", ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return { context, page, problems };
}

async function shot(page, name, { full = true } = {}) {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: full });
}

async function sidewaysOverflow(page) {
  return page.evaluate(() => {
    if (document.documentElement.scrollWidth <= window.innerWidth) return [];
    return Array.from(document.querySelectorAll("body *"))
      .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 0.5)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className} +${Math.round(element.getBoundingClientRect().right - window.innerWidth)}px`)
      .slice(0, 8);
  });
}

async function api(page, url, init = {}) {
  const response = await page.request.fetch(`${stack.baseUrl}/api${url}`, init);
  return { status: response.status(), body: await response.json().catch(() => null) };
}

// Holds an API call back so the loading state can be seen.
async function slowly(route) {
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await route.continue().catch(() => {});
}

async function until(check, timeout = 10000) {
  const end = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`timed out: ${check}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

// A photo as a camera would give it: JPEG with an orientation tag.
async function photo(color, { width = 1600, height = 1000 } = {}) {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg({ quality: 80 }).withMetadata({ orientation: 1 }).toBuffer();
}

// Each screen: where it is, what it reads, what shows when it is ready, and
// how its answer is emptied for the "nothing yet" state.
const SCREENS = [
  {
    key: "rooms",
    path: "/admin/rooms",
    request: /\/api\/rooms\?/,
    ready: (phone) => (phone ? "rooms-cards" : "rooms-table"),
    empty: (body) => ({ ...body, data: [], pagination: { ...body.pagination, total: 0, totalPages: 1 } }),
  },
  {
    key: "coupons",
    path: "/admin/coupons",
    request: /\/api\/coupons(\?|$)/,
    ready: (phone) => (phone ? "coupons-cards" : "coupons-table"),
    empty: () => [],
  },
  {
    key: "reviews",
    path: "/admin/reviews",
    request: /\/api\/reviews\?/,
    ready: () => "reviews-list",
    empty: (body) => ({ ...body, data: [], pagination: { ...body.pagination, total: 0, totalPages: 1 }, summary: { total: 0, hidden: 0, five: 0, low: 0, average: null } }),
  },
  {
    key: "users",
    path: "/admin/users",
    request: /\/api\/users\?/,
    ready: (phone) => (phone ? "users-cards" : "users-table"),
    // There is always at least the admin: "nothing here" is a search with no match.
    empty: (body) => ({ ...body, data: [], total: 0, totalPages: 1 }),
  },
  {
    key: "property",
    path: "/admin/property",
    request: /\/api\/settings$/,
    ready: () => "property-preview",
  },
  {
    key: "destinations",
    path: "/admin/destinations",
    request: /\/api\/destinations$/,
    ready: () => "destinations-grid",
    empty: () => [],
  },
];

describe("The admin area, part 2, in the browser", () => {
  before(async () => {
    process.env.SEED_ADMIN_PASSWORD = ADMIN.password;
    stack = await startStack();
    today = requireApi("./src/utils/time").todayInAppTimezone();
    await addAdminSample(stack.pool, { today });
    await addCatalogSample(stack.pool, { today });
    await stack.pool.query("UPDATE rooms SET status = 'maintenance' WHERE id = (SELECT id FROM rooms WHERE id NOT IN (SELECT room_id FROM bookings) ORDER BY id LIMIT 1)");
    // A guest with a booking to come, locked for spam: the reason shows in the list.
    await stack.pool.query("UPDATE users SET is_locked = true, lock_reason = 'spam', locked_at = NOW() WHERE email = 'daniel.kim@example.com'");
  });

  after(async () => {
    await stack?.stop();
  });

  it("shows every screen ready at three widths, light and dark, without sideways scrolling", async () => {
    for (const [size, viewport] of SIZES) {
      for (const colorScheme of ["light", "dark"]) {
        const { context, page, problems } = await openPage({ viewport, colorScheme });
        try {
          for (const screen of SCREENS) {
            await page.goto(`${stack.baseUrl}${screen.path}`);
            await page.getByTestId(screen.ready(size === "mobile")).waitFor();
            await page.waitForTimeout(300);
            assert.deepEqual(await sidewaysOverflow(page), [], `${screen.key} ${size}`);
            await shot(page, `${screen.key}-${size}-${colorScheme}`);
          }
          // The room page, with its photos.
          const room = (await stack.pool.query("SELECT id FROM rooms ORDER BY (image IS NULL), id LIMIT 1")).rows[0];
          await page.goto(`${stack.baseUrl}/admin/rooms/${room.id}`);
          await page.getByTestId("room-form").waitFor();
          assert.deepEqual(await sidewaysOverflow(page), [], `room form ${size}`);
          await shot(page, `room-form-${size}-${colorScheme}`);
          assert.deepEqual(problems, [], `${size} ${colorScheme}`);
        } finally {
          await context.close();
        }
      }
    }
  });

  it("shows loading, error and empty states for every screen", async () => {
    for (const [size, viewport] of [["desktop", DESKTOP], ["mobile", PHONE]]) {
      const { context, page } = await openPage({ viewport });
      try {
        for (const screen of SCREENS) {
          await page.route(screen.request, slowly);
          await page.goto(`${stack.baseUrl}${screen.path}`);
          await page.getByTestId(`${screen.key}-loading`).waitFor();
          await shot(page, `${screen.key}-loading-${size}-light`, { full: false });
          await page.unroute(screen.request);

          await page.route(screen.request, (route) => (route.request().method() === "GET" ? route.fulfill({ status: 503, contentType: "application/json", body: "{}" }) : route.continue()));
          await page.goto(`${stack.baseUrl}${screen.path}`);
          await page.getByTestId(`${screen.key}-error`).waitFor();
          await shot(page, `${screen.key}-error-${size}-light`, { full: false });
          await page.unroute(screen.request);

          if (screen.empty) {
            await page.route(screen.request, async (route) => {
              const real = await route.fetch();
              await route.fulfill({ response: real, json: screen.empty(await real.json()) });
            });
            await page.goto(`${stack.baseUrl}${screen.path}`);
            await page.getByTestId(`${screen.key}-empty`).waitFor();
            await shot(page, `${screen.key}-empty-${size}-light`, { full: false });
            await page.unroute(screen.request);
          }
        }
        // The room page that does not exist, and the one that fails to load.
        await page.goto(`${stack.baseUrl}/admin/rooms/999999`);
        await page.getByText(/Không tìm thấy phòng/).first().waitFor();
        await shot(page, `room-form-notfound-${size}-light`, { full: false });
        await page.route(/\/api\/rooms\/\d+$/, slowly);
        await page.goto(`${stack.baseUrl}/admin/rooms/1`);
        await page.getByTestId("room-editor-loading").waitFor();
        await shot(page, `room-form-loading-${size}-light`, { full: false });
        await page.unroute(/\/api\/rooms\/\d+$/);
      } finally {
        await context.close();
      }
    }
  });

  it("rooms: filters by status and type, pages through, and searches", async () => {
    const { context, page, problems } = await openPage();
    try {
      await page.goto(`${stack.baseUrl}/admin/rooms`);
      await page.getByTestId("rooms-table").waitFor();
      const counts = (await api(page, "/rooms/status-counts")).body;
      assert.equal(counts.all, Number((await stack.pool.query("SELECT COUNT(*) FROM rooms")).rows[0].count));
      assert.match(await page.getByTestId("room-filter-all").innerText(), new RegExp(String(counts.all)));
      assert.equal(await page.getByTestId("room-row").count(), Math.min(10, counts.all));

      await page.getByTestId("room-filter-maintenance").click();
      await page.waitForURL(/status=maintenance/);
      await until(async () => (await page.getByTestId("room-row").count()) === counts.maintenance);
      await shot(page, "rooms-filter-maintenance-desktop-light", { full: false });

      await page.getByTestId("room-filter-all").click();
      await page.getByTestId("rooms-pagination").locator("button.ax-page", { hasText: /^2$/ }).click();
      await page.waitForURL(/page=2/);
      await shot(page, "rooms-page2-desktop-light", { full: false });

      await page.getByRole("searchbox").last().fill("zzzz-khong-co");
      await page.getByTestId("rooms-empty").waitFor();
      await shot(page, "rooms-nomatch-desktop-light", { full: false });
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("rooms: a new room with photos dropped in, shown uploading, then ordered and given a cover", async () => {
    const { context, page, problems } = await openPage();
    try {
      await page.goto(`${stack.baseUrl}/admin/rooms`);
      await page.getByTestId("room-add").click();
      const form = page.getByTestId("room-form");
      await form.waitFor();

      // Nothing typed yet: saving shows what is missing.
      await form.locator("#room-name").fill("x");
      await form.locator("#room-name").fill("");
      await form.locator("#room-location").fill("Sơn Trà, Đà Nẵng");
      await page.getByTestId("room-savebar-save").click();
      await form.locator("#room-name[aria-invalid=true]").waitFor();
      await shot(page, "room-form-errors-desktop-light");

      await form.locator("#room-name").fill("Phòng Ảnh Thử");
      await form.getByTestId("room-type-select").selectOption({ index: 1 });
      await form.locator("#room-price").fill("2100000");
      await form.locator("#room-description").fill("Phòng thử để kiểm tra ảnh.");
      await form.locator("#room-amenity").fill("Bồn tắm");
      await form.locator("#room-amenity").press("Enter");
      const files = await Promise.all(["#8a6d3b", "#2e4a3c", "#24384f"].map((color) => photo(color)));
      await page.getByTestId("room-photo-input").setInputFiles(files.map((buffer, i) => ({ name: `anh-${i + 1}.jpg`, mimeType: "image/jpeg", buffer })));
      assert.equal(await page.getByTestId("room-photo").count(), 3);
      await shot(page, "room-form-new-queued-desktop-light");

      // A wrong file is refused before uploading.
      await page.getByTestId("room-photo-input").setInputFiles([{ name: "ghi-chu.txt", mimeType: "text/plain", buffer: Buffer.from("x") }]);
      await page.getByText(/PNG, JPG hoặc WebP/).first().waitFor();

      // Uploads are slowed so their progress can be seen.
      await page.route(/\/api\/rooms\/\d+\/images$/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        await route.continue();
      });
      await page.getByTestId("room-savebar-save").click();
      await page.getByTestId("toast-success").waitFor({ timeout: 30000 });
      await page.waitForURL(/\/admin\/rooms\/\d+$/);
      await page.unroute(/\/api\/rooms\/\d+\/images$/);
      const id = Number(page.url().split("/").pop());
      const saved = (await stack.pool.query("SELECT image, amenities FROM rooms WHERE id = $1", [id])).rows[0];
      assert.match(saved.image, /\.webp$/);
      assert.deepEqual(saved.amenities, ["Bồn tắm"]);
      const gallery = (await stack.pool.query("SELECT id, image_path FROM room_images WHERE room_id = $1 ORDER BY sort_order", [id])).rows;
      assert.equal(gallery.length, 2);

      // One more, uploaded at once on a saved room, with its progress tile.
      await page.route(/\/api\/rooms\/\d+\/images$/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      });
      await page.getByTestId("room-photo-input").setInputFiles([{ name: "anh-4.jpg", mimeType: "image/jpeg", buffer: await photo("#8f3f2a") }]);
      await page.getByTestId("room-photo-uploading").waitFor();
      await shot(page, "room-form-uploading-desktop-light");
      await page.getByTestId("room-photo-uploading").waitFor({ state: "detached", timeout: 30000 });
      await page.unroute(/\/api\/rooms\/\d+\/images$/);
      assert.equal(await page.getByTestId("room-photo").count(), 4);

      // The last photo becomes the cover; the old cover joins the gallery.
      await page.getByTestId("room-photo").last().hover();
      await page.getByTestId("room-photo").last().getByTestId("photo-make-cover").click();
      await until(async () => (await stack.pool.query("SELECT image FROM rooms WHERE id = $1", [id])).rows[0].image !== saved.image);
      const after = (await stack.pool.query("SELECT image_path FROM room_images WHERE room_id = $1", [id])).rows.map((row) => row.image_path);
      assert.ok(after.includes(saved.image), "the old cover is kept in the gallery");

      // Order by dragging: the first gallery photo goes to the end.
      const before = (await stack.pool.query("SELECT id FROM room_images WHERE room_id = $1 ORDER BY sort_order", [id])).rows.map((row) => row.id);
      await page.getByTestId("room-photo").nth(1).dragTo(page.getByTestId("room-photo").last());
      await until(async () => (await stack.pool.query("SELECT id FROM room_images WHERE room_id = $1 ORDER BY sort_order", [id])).rows[0].id !== before[0]);
      await shot(page, "room-form-photos-desktop-light");

      // The drop zone while a file is held over it.
      await page.getByTestId("room-dropzone").dispatchEvent("dragover", { dataTransfer: await page.evaluateHandle(() => { const data = new DataTransfer(); data.items.add(new File(["x"], "a.jpg", { type: "image/jpeg" })); return data; }) });
      await shot(page, "room-form-drop-desktop-light", { full: false });
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("coupons: state from the data, switch with a question, panel with checks and the guests' line", async () => {
    const { context, page, problems } = await openPage();
    try {
      await page.goto(`${stack.baseUrl}/admin/coupons`);
      await page.getByTestId("coupons-table").waitFor();
      const row = (code) => page.getByTestId("coupon-row").filter({ hasText: code });
      assert.match(await row("TET2027").innerText(), /Đã lên lịch/);
      assert.match(await row("FLASH300K").innerText(), /Hết lượt/);
      assert.match(await row("THU2026").innerText(), /Hết hạn/);
      assert.match(await row("DOITAC").innerText(), /Đã tắt/);
      assert.match(await row("CUOITUAN").innerText(), /Sắp hết lượt/);
      assert.match(await row("HE2026").innerText(), /Đang chạy/);
      assert.match(await row("HE2026").innerText(), /6 \/ 50 lượt/);

      for (const key of ["running", "scheduled", "expired", "usedUp", "off"]) {
        await page.getByTestId(`coupon-filter-${key}`).click();
        await page.waitForTimeout(100);
        await shot(page, `coupons-filter-${key}-desktop-light`, { full: false });
      }
      await page.getByTestId("coupon-filter-all").click();

      // Switching off asks first.
      await row("HE2026").getByTestId("coupon-toggle").click();
      await page.getByRole("alertdialog").waitFor();
      await shot(page, "coupons-confirm-off-desktop-light", { full: false });
      await page.getByTestId("confirm-ok").click();
      await page.getByTestId("toast-success").waitFor();
      assert.equal((await stack.pool.query("SELECT is_active FROM coupons WHERE code = 'HE2026'")).rows[0].is_active, false);
      await row("HE2026").getByTestId("coupon-toggle").click();
      await until(async () => (await stack.pool.query("SELECT is_active FROM coupons WHERE code = 'HE2026'")).rows[0].is_active);

      // A new coupon: checks first, then the line guests will see.
      await page.getByTestId("coupon-add").click();
      const drawer = page.getByTestId("coupon-drawer");
      await drawer.waitFor();
      await page.getByTestId("coupon-save").click();
      await drawer.locator("#coupon-code[aria-invalid=true]").waitFor();
      await drawer.locator("#coupon-code").fill("mua-he");
      assert.equal(await drawer.locator("#coupon-code").inputValue(), "MUA-HE");
      await drawer.locator("#coupon-discount_value").fill("120");
      await drawer.locator("#coupon-starts").fill("2030-06-10");
      await drawer.locator("#coupon-expires").fill("2030-06-01");
      await page.getByTestId("coupon-save").click();
      await drawer.getByText(/không quá 100/).waitFor();
      await drawer.getByText(/sau ngày bắt đầu/).waitFor();
      await shot(page, "coupons-drawer-errors-desktop-light", { full: false });

      await drawer.locator("#coupon-discount_value").fill("15");
      await drawer.locator("#coupon-max_discount_amount").fill("400000");
      await drawer.locator("#coupon-expires").fill("2030-06-30");
      await drawer.locator("#coupon-usage_limit").fill("20");
      const preview = await page.getByTestId("coupon-preview").innerText();
      assert.match(preview, /Khách sẽ thấy/);
      assert.match(preview, /MUA-HE/);
      assert.match(preview, /15%/);
      assert.match(preview, /400\.000/);
      await shot(page, "coupons-drawer-desktop-light", { full: false });
      await page.getByTestId("coupon-save").click();
      await page.getByTestId("toast-success").waitFor();
      const created = (await stack.pool.query("SELECT discount_value, starts_at, expires_at, usage_limit FROM coupons WHERE code = 'MUA-HE'")).rows[0];
      assert.equal(Number(created.discount_value), 15);
      assert.equal(created.usage_limit, 20);
      assert.ok(created.starts_at < created.expires_at);
      assert.match(await row("MUA-HE").innerText(), /Đã lên lịch/);

      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("coupons: the panel and the table on a phone and a tablet", async () => {
    for (const [size, viewport] of [["tablet", TABLET], ["mobile", PHONE]]) {
      for (const colorScheme of ["light", "dark"]) {
        const { context, page } = await openPage({ viewport, colorScheme });
        try {
          await page.goto(`${stack.baseUrl}/admin/coupons`);
          await page.getByTestId(size === "mobile" ? "coupons-cards" : "coupons-table").waitFor();
          await page.getByTestId("coupon-add").click();
          await page.getByTestId("coupon-drawer").waitFor();
          assert.deepEqual(await sidewaysOverflow(page), []);
          await shot(page, `coupons-drawer-${size}-${colorScheme}`, { full: false });
        } finally {
          await context.close();
        }
      }
    }
  });

  it("reviews: filters by stars and hidden, and shows or hides one at once", async () => {
    const { context, page, problems } = await openPage();
    try {
      await page.goto(`${stack.baseUrl}/admin/reviews`);
      await page.getByTestId("reviews-list").waitFor();
      const total = Number((await stack.pool.query("SELECT COUNT(*) FROM room_reviews")).rows[0].count);
      assert.equal(await page.getByTestId("review-row").count(), Math.min(20, total));

      await page.getByTestId("review-filter-low").click();
      await page.waitForURL(/filter=low/);
      const low = Number((await stack.pool.query("SELECT COUNT(*) FROM room_reviews WHERE rating <= 3")).rows[0].count);
      await until(async () => (await page.getByTestId("review-row").count()) === low);
      await shot(page, "reviews-filter-low-desktop-light", { full: false });

      await page.getByTestId("review-filter-hidden").click();
      const hidden = Number((await stack.pool.query("SELECT COUNT(*) FROM room_reviews WHERE is_hidden")).rows[0].count);
      await until(async () => (await page.getByTestId("review-row").count()) === hidden);
      await shot(page, "reviews-filter-hidden-desktop-light", { full: false });

      // Showing a hidden review again.
      const first = page.getByTestId("review-row").first();
      await first.getByTestId("review-toggle").click();
      await page.getByTestId("toast-success").waitFor();
      assert.equal(Number((await stack.pool.query("SELECT COUNT(*) FROM room_reviews WHERE is_hidden")).rows[0].count), hidden - 1);

      await page.getByTestId("review-filter-five").click();
      await page.waitForURL(/filter=five/);
      await page.getByRole("searchbox").last().fill("không có ai như thế");
      await page.getByTestId("reviews-empty").waitFor();
      await shot(page, "reviews-nomatch-desktop-light", { full: false });
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("users: server pages, search, locking with a reason (signed out everywhere), never oneself", async () => {
    const { context, page, problems } = await openPage();
    try {
      await page.goto(`${stack.baseUrl}/admin/users`);
      await page.getByTestId("users-table").waitFor();
      // The admin's own row cannot be locked.
      const own = page.getByTestId("user-row").filter({ hasText: ADMIN.email });
      assert.equal(await own.getByTestId("user-lock").count(), 0);
      const locked = page.getByTestId("user-row").filter({ hasText: "daniel.kim@example.com" });
      assert.match(await locked.innerText(), /Spam/i);

      await page.getByTestId("user-filter-locked").click();
      await until(async () => (await page.getByTestId("user-row").count()) === 1);
      await page.getByTestId("user-filter-all").click();

      await page.getByRole("searchbox").last().fill("thuha");
      await until(async () => (await page.getByTestId("user-row").count()) === 1);
      const target = (await stack.pool.query("SELECT id, token_version FROM users WHERE email = 'thuha@example.com'")).rows[0];
      await page.getByTestId("user-lock").click();
      const dialog = page.getByTestId("lock-dialog");
      await dialog.waitFor();
      await page.getByTestId("lock-confirm").click();
      await dialog.locator("#lock-reason[aria-invalid=true]").waitFor();
      await shot(page, "users-lock-error-desktop-light", { full: false });
      await dialog.locator("#lock-reason").selectOption("abuse");
      await dialog.locator("#lock-note").fill("Gọi điện quấy rối lễ tân nhiều lần.");
      await shot(page, "users-lock-desktop-light", { full: false });
      await page.getByTestId("lock-confirm").click();
      await page.getByTestId("toast-success").waitFor();
      const after = (await stack.pool.query("SELECT is_locked, lock_reason, lock_note, token_version FROM users WHERE id = $1", [target.id])).rows[0];
      assert.equal(after.is_locked, true);
      assert.equal(after.lock_reason, "abuse");
      assert.equal(after.token_version, target.token_version + 1);

      // Unlocking asks first.
      await page.getByTestId("user-unlock").click();
      await page.getByRole("alertdialog").waitFor();
      await page.getByTestId("confirm-ok").click();
      await until(async () => !(await stack.pool.query("SELECT is_locked FROM users WHERE id = $1", [target.id])).rows[0].is_locked);
      assert.equal((await stack.pool.query("SELECT lock_reason FROM users WHERE id = $1", [target.id])).rows[0].lock_reason, null);

      await page.getByRole("searchbox").last().fill("khong-co-ai-ten-nay");
      await page.getByTestId("users-empty").waitFor();
      await shot(page, "users-nomatch-desktop-light", { full: false });

      // The panel to add a user.
      await page.getByTestId("user-add").click();
      await page.getByTestId("user-drawer").waitFor();
      await page.getByTestId("user-save").click();
      await page.locator("#user-name[aria-invalid=true]").waitFor();
      await shot(page, "users-drawer-desktop-light", { full: false });
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("users: the lock dialog on a phone, light and dark", async () => {
    for (const colorScheme of ["light", "dark"]) {
      const { context, page } = await openPage({ viewport: PHONE, colorScheme });
      try {
        await page.goto(`${stack.baseUrl}/admin/users`);
        await page.getByTestId("users-cards").waitFor();
        await page.getByTestId("user-lock").first().click();
        await page.getByTestId("lock-dialog").waitFor();
        assert.deepEqual(await sidewaysOverflow(page), []);
        await shot(page, `users-lock-mobile-${colorScheme}`, { full: false });
      } finally {
        await context.close();
      }
    }
  });

  it("property: tabs saved together, checks before saving, a preview that follows the form", async () => {
    const { context, page, problems } = await openPage();
    try {
      await page.goto(`${stack.baseUrl}/admin/property`);
      await page.getByTestId("property-preview").waitFor();
      await page.locator("#property-heroTitle").fill("Nơi thời gian chậm lại");
      assert.match(await page.getByTestId("property-preview").innerText(), /Nơi thời gian chậm lại/);
      await page.locator("#property-email").fill("datphong@khachsan");
      await page.getByTestId("property-savebar-save").click();
      await page.locator("#property-email[aria-invalid=true]").waitFor();
      assert.match(await page.getByTestId("property-savebar").innerText(), /1 lỗi/);
      await shot(page, "property-errors-desktop-light");

      await page.locator("#property-email").fill("datphong@khachsan.vn");
      await page.locator("#property-phone").fill("+84 236 3888 999");
      await page.getByTestId("property-tab-policy").click();
      await page.getByTestId("property-days-default").click();
      await page.getByRole("button", { name: /^Thêm Số ngày/ }).click();
      await shot(page, "property-policy-desktop-light");
      await page.getByTestId("property-tab-home").click();
      await page.getByTestId("home-amenities").getByRole("button", { name: /Thêm dòng/ }).click();
      await page.getByRole("textbox", { name: /Tên tiện ích, dòng 1/ }).fill("Hồ bơi vô cực");
      await shot(page, "property-home-desktop-light");
      await page.getByTestId("property-savebar-save").click();
      await page.getByTestId("toast-success").waitFor();
      const settings = (await api(page, "/settings")).body.stored;
      assert.equal(settings.heroTitle, "Nơi thời gian chậm lại");
      assert.equal(settings.email, "datphong@khachsan.vn");
      assert.equal(settings.amenities[0].name, "Hồ bơi vô cực");
      assert.equal(typeof settings.freeCancellationDays, "number");
      assert.match(await page.getByTestId("property-savebar").innerText(), /Mọi thay đổi đã được lưu/);

      // The logo is uploaded straight away (re-encoded by the server).
      await page.getByTestId("property-tab-info").click();
      const logo = await sharp({ create: { width: 600, height: 600, channels: 4, background: { r: 46, g: 74, b: 60, alpha: 1 } } }).png().toBuffer();
      await page.getByTestId("logo-input").setInputFiles([{ name: "logo.png", mimeType: "image/png", buffer: logo }]);
      await page.getByTestId("logo-preview").waitFor();
      await shot(page, "property-logo-desktop-light");

      // Mobile preview.
      await page.getByRole("button", { name: "Mobile" }).click();
      await shot(page, "property-preview-mobile-desktop-light");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("destinations: a new photo with its credit, checks on the credit, and the credit on /credits", async () => {
    const { context, page, problems } = await openPage();
    try {
      await page.goto(`${stack.baseUrl}/admin/destinations`);
      await page.getByTestId("destinations-grid").waitFor();
      const card = page.getByTestId("destination-row").first();
      const name = await card.locator("h2").innerText();
      const before = (await stack.pool.query("SELECT image_url FROM destination_images WHERE name = $1", [name])).rows[0];
      await card.getByTestId("destination-edit").click();
      const drawer = page.getByTestId("destination-drawer");
      await drawer.waitFor();
      await shot(page, "destinations-drawer-desktop-light", { full: false });

      await page.getByTestId("destination-image-input").setInputFiles([{ name: "diem-den.jpg", mimeType: "image/jpeg", buffer: await photo("#24384f", { width: 2400, height: 1350 }) }]);
      await drawer.getByText(/Ảnh mới:/).waitFor();
      await drawer.locator("#dest-author").fill("");
      await drawer.locator("#dest-license").fill("CC BY-SA 4.0");
      assert.equal(await drawer.locator("#dest-licenseUrl").inputValue(), "https://creativecommons.org/licenses/by-sa/4.0");
      await drawer.locator("#dest-sourceUrl").fill("commons.wikimedia.org/anh");
      await page.getByTestId("destination-save").click();
      await drawer.locator("#dest-author[aria-invalid=true]").waitFor();
      await drawer.locator("#dest-sourceUrl[aria-invalid=true]").waitFor();
      await shot(page, "destinations-drawer-errors-desktop-light", { full: false });

      await drawer.locator("#dest-author").fill("Nguyễn Thu Trang");
      await drawer.locator("#dest-sourceUrl").fill("https://commons.wikimedia.org/wiki/File:Thu_nghiem.jpg");
      await page.getByTestId("destination-save").click();
      await page.getByTestId("toast-success").waitFor();
      const after = (await stack.pool.query("SELECT image_url, credit_author, credit_license FROM destination_images WHERE name = $1", [name])).rows[0];
      assert.notEqual(after.image_url, before?.image_url);
      assert.match(after.image_url, /\.webp$/);
      assert.equal(after.credit_author, "Nguyễn Thu Trang");
      assert.equal(after.credit_license, "CC BY-SA 4.0");
      assert.match(await page.getByTestId("destination-row").filter({ hasText: name }).innerText(), /Nguyễn Thu Trang · CC BY-SA 4\.0/);
      const credits = (await api(page, "/destinations/credits")).body;
      assert.ok(JSON.stringify(credits).includes("Nguyễn Thu Trang"));

      // A photo with no author: flagged on its card and counted in the header.
      await stack.pool.query("UPDATE destination_images SET credit_author = NULL, credit_license = NULL WHERE name = $1", [name]);
      await page.reload();
      await page.getByTestId("destinations-grid").waitFor();
      assert.match(await page.locator(".ax-head p").innerText(), /1 ảnh thiếu ghi công/);
      await shot(page, "destinations-missing-desktop-light", { full: false });
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("destinations: the panel on a phone and a tablet, light and dark", async () => {
    for (const [size, viewport] of [["tablet", TABLET], ["mobile", PHONE]]) {
      for (const colorScheme of ["light", "dark"]) {
        const { context, page } = await openPage({ viewport, colorScheme });
        try {
          await page.goto(`${stack.baseUrl}/admin/destinations`);
          await page.getByTestId("destination-edit").first().click();
          await page.getByTestId("destination-drawer").waitFor();
          assert.deepEqual(await sidewaysOverflow(page), []);
          await shot(page, `destinations-drawer-${size}-${colorScheme}`, { full: false });
        } finally {
          await context.close();
        }
      }
    }
  });
});
