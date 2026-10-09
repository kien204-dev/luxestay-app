// The room list and the room page in a real browser, against the built web
// app and the real API: filters, paging and the four states of the list;
// the gallery with its full-screen view, amenities, reviews and the states
// of the room page; the demo banner; and the shared toast and delete
// confirmation.
//
// Screenshots are written to test-results/rooms/.
//
// Run with `npm run test:e2e` from the repository root.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { startStack } from "./stack.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = path.resolve(HERE, "../../../test-results/rooms");
const locale = (name) => JSON.parse(fs.readFileSync(path.join(HERE, `../src/locales/vi/${name}.json`), "utf8"));
const TEXT = locale("site");
const COMMON = locale("common");

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const VIEWS = [["desktop-1440", DESKTOP], ["mobile-390", PHONE]];
const THEMES = ["light", "dark"];
const ROOMS_REQUEST = /\/api\/rooms\?/;
const ADMIN = { email: "admin@example.com", password: "Admin-E2E-12345" };

let stack;
// A room given photos, amenities and reviews, and one left bare.
let fullRoom;
let bareRoom;

async function openPage({ viewport = DESKTOP, colorScheme = "light" } = {}) {
  const context = await stack.browser.newContext({ locale: "vi-VN", viewport, colorScheme });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    // A request the test fails on purpose, or the websocket this test server
    // does not carry, is not an error in the page.
    if (message.type() === "error" && !/Failed to load resource|WebSocket/i.test(text)) {
      problems.push(`console: ${text}`);
    }
  });
  return { context, page, problems };
}

// Runs `check` once per screen size and theme.
async function everywhere(check) {
  for (const [name, viewport] of VIEWS) {
    for (const colorScheme of THEMES) {
      const { context, page, problems } = await openPage({ viewport, colorScheme });
      try {
        await check(page, `${name}-${colorScheme}`, name.startsWith("mobile"));
        assert.deepEqual(problems, [], `${name}-${colorScheme}`);
      } finally {
        await context.close();
      }
    }
  }
}

// Empty when nothing sticks out of the right edge of the screen; otherwise
// names what does.
async function sidewaysOverflow(page) {
  return page.evaluate(() => {
    if (document.documentElement.scrollWidth <= window.innerWidth) return [];
    return Array.from(document.querySelectorAll("body *"))
      .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 0.5)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className} +${Math.round(element.getBoundingClientRect().right - window.innerWidth)}px`)
      .slice(0, 8);
  });
}

// `full` scrolls through the page first so lazy photos are in the picture;
// without it the screenshot is of the screen as it is (a dialog, a toast).
async function screenshot(page, name, { full = true } = {}) {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  if (full) {
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      window.scrollTo(0, 0);
      // Photos that are shown; a lazy one that is hidden never loads.
      const shown = Array.from(document.images).filter((image) => image.getClientRects().length > 0);
      await Promise.all(shown.map((image) => Promise.race([image.decode().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 3000))])));
    });
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: full });
}

const listState = (page, state) => page.locator(`[data-testid="rooms-page"][data-state="${state}"]`);

async function signInAsAdmin(page) {
  await page.goto(`${stack.baseUrl}/login`);
  await page.fill("#login-email", ADMIN.email);
  await page.fill("#login-password", ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

describe("The room list and room page in the browser", () => {
  before(async () => {
    process.env.SEED_ADMIN_PASSWORD = ADMIN.password;
    stack = await startStack();
    const { pool } = stack;

    // Photos (the bundled destination pictures stand in), amenities and three
    // reviews for one room; nothing for the other.
    const rooms = (await pool.query("SELECT id, room_name FROM rooms WHERE status != 'maintenance' ORDER BY id OFFSET 20 LIMIT 2")).rows;
    [fullRoom, bareRoom] = rooms;
    const photos = (await pool.query("SELECT image_url FROM destination_images ORDER BY name LIMIT 7")).rows.map((row) => row.image_url);
    await pool.query("UPDATE rooms SET image = $2, amenities = $3 WHERE id = $1", [
      fullRoom.id,
      photos[0],
      JSON.stringify(["Tiện nghi thử 1", "Tiện nghi thử 2", "Tiện nghi thử 3", "Tiện nghi thử 4"]),
    ]);
    for (const [index, photo] of photos.slice(1).entries()) {
      await pool.query("INSERT INTO room_images (room_id, image_path, sort_order) VALUES ($1, $2, $3)", [fullRoom.id, photo, index]);
    }
    for (const [index, [rating, comment]] of [[5, "Đánh giá thử thứ nhất."], [4, "Đánh giá thử thứ hai."], [5, null]].entries()) {
      await pool.query(
        `WITH stay AS (
           INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, payment_status)
           SELECT u.id, $1, CURRENT_DATE - ($2::int * 10 + 32), CURRENT_DATE - ($2::int * 10 + 30), 100, 1, 'completed', 'paid'
           FROM users u WHERE u.email = 'user@example.com'
           RETURNING id, user_id
         )
         INSERT INTO room_reviews (room_id, user_id, booking_id, rating, comment)
         SELECT $1, user_id, id, $3, $4 FROM stay`,
        [fullRoom.id, index, rating, comment]
      );
    }
  });

  after(async () => {
    await stack?.stop();
  });

  it("lists rooms with paging, in both themes and on a phone", async () => {
    await everywhere(async (page, name, mobile) => {
      await page.goto(`${stack.baseUrl}/rooms`);
      await listState(page, "ready").waitFor();
      assert.equal(await page.locator(".room-card").count(), 12);
      // The page title, then each room's name one level below it.
      assert.equal(await page.locator("h1").count(), 1);
      assert.equal(await page.locator(".room-card h2").count(), 12);
      assert.deepEqual(await sidewaysOverflow(page), [], `${name}: the page scrolls sideways`);
      await screenshot(page, `rooms-${name}`);

      // Page 2 is in the address, so it can be shared and reloaded.
      await page.getByRole("button", { name: TEXT.list.next }).click();
      await page.waitForURL((url) => url.searchParams.get("page") === "2");
      await listState(page, "ready").waitFor();
      const position = mobile ? page.locator(".pager-position") : page.locator('.pager [aria-current="page"]');
      assert.match(await position.innerText(), /2/);
    });
  });

  it("filters by room type and price, and says so when nothing matches", async () => {
    const { context, page, problems } = await openPage();
    try {
      const filters = await (await fetch(`${stack.baseUrl}/api/rooms/filters`)).json();
      const { type, count } = filters.types.at(-1);

      await page.goto(`${stack.baseUrl}/rooms`);
      await listState(page, "ready").waitFor();

      // Only the types that exist are offered, each with its number of rooms.
      const chip = page.locator(".rooms-chips .chip", { hasText: type });
      assert.ok((await chip.innerText()).includes(String(count)));
      await chip.click();
      await page.waitForURL((url) => url.searchParams.get("type") === type);
      await listState(page, "ready").waitFor();
      assert.ok((await page.getByTestId("result-count").innerText()).startsWith(`${count} `));
      assert.equal(await chip.getAttribute("aria-pressed"), "true");

      // A price nobody charges: nothing matches, and the page offers to take
      // the conditions off again.
      await page.getByTestId("price-chip").click();
      await page.fill("#price-max", "1000");
      await page.getByRole("button", { name: TEXT.list.apply }).click();
      await listState(page, "empty").waitFor();
      const empty = page.getByTestId("rooms-empty");
      await empty.getByText(TEXT.list.emptyTitle).waitFor();
      await screenshot(page, "rooms-empty-desktop-1440-light");

      await empty.getByRole("button", { name: new RegExp(TEXT.list.priceBelow.split("{{")[0]) }).click();
      await listState(page, "ready").waitFor();
      assert.equal(new URL(page.url()).searchParams.get("maxPrice"), null);
      assert.equal(new URL(page.url()).searchParams.get("type"), type);

      await page.locator(".rooms-chips").getByRole("button", { name: TEXT.list.clearFilters }).click();
      await page.waitForURL((url) => !url.searchParams.has("type"));
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("shows the list loading and failed with a retry", async () => {
    const { context, page, problems } = await openPage();
    try {
      let release;
      await page.route(ROOMS_REQUEST, (route) => new Promise((resolve) => { release = resolve; }).then(() => route.continue()));
      await page.goto(`${stack.baseUrl}/rooms`);
      await listState(page, "loading").waitFor();
      assert.equal(await page.getByTestId("rooms-loading").getAttribute("aria-busy"), "true");
      await screenshot(page, "rooms-loading-desktop-1440-light");
      release();
      await listState(page, "ready").waitFor();
      await page.unroute(ROOMS_REQUEST);

      await page.route(ROOMS_REQUEST, (route) => route.fulfill({ status: 500, json: { code: "SERVER_ERROR" } }));
      await page.goto(`${stack.baseUrl}/rooms?guests=2`);
      await listState(page, "error").waitFor();
      await page.getByRole("alert").getByText(TEXT.list.errorTitle).waitFor();
      await screenshot(page, "rooms-error-desktop-1440-light");
      await page.unroute(ROOMS_REQUEST);
      await page.getByRole("button", { name: TEXT.list.retry }).click();
      await listState(page, "ready").waitFor();
      // The search survived the failure.
      assert.equal(new URL(page.url()).searchParams.get("guests"), "2");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("folds the search and filters into a sheet on a phone", async () => {
    const { context, page, problems } = await openPage({ viewport: PHONE });
    try {
      const { type } = (await (await fetch(`${stack.baseUrl}/api/rooms/filters`)).json()).types[0];
      await page.goto(`${stack.baseUrl}/rooms`);
      await listState(page, "ready").waitFor();

      await page.getByTestId("open-filters").click();
      const sheet = page.getByRole("dialog", { name: TEXT.list.filters });
      await sheet.waitFor();
      await screenshot(page, "rooms-filter-sheet-mobile-390-light", { full: false });

      // Focus is kept inside the sheet: tabbing never reaches the page behind
      // (past the last control it goes to the browser's own bar and back).
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press("Tab");
        assert.ok(await page.evaluate(() => document.activeElement === document.body || Boolean(document.activeElement?.closest("dialog"))), `focus reached the page behind after ${i + 1} tabs`);
      }

      await sheet.locator(".chip", { hasText: type }).click();
      await page.waitForURL((url) => url.searchParams.get("type") === type);
      await page.getByTestId("apply-filters").click();
      await sheet.waitFor({ state: "detached" });
      assert.match(await page.getByTestId("open-filters").innerText(), /1/);

      // Nothing matches on a phone: the same message.
      await page.goto(`${stack.baseUrl}/rooms?maxPrice=1000`);
      await listState(page, "empty").waitFor();
      assert.deepEqual(await sidewaysOverflow(page), []);
      await screenshot(page, "rooms-empty-mobile-390-light");

      // Escape closes the sheet.
      await page.getByTestId("open-filters").click();
      await sheet.waitFor();
      await page.keyboard.press("Escape");
      await sheet.waitFor({ state: "detached" });
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("shows a room with its photos, amenities, policies and reviews", async () => {
    await everywhere(async (page, name, mobile) => {
      await page.goto(`${stack.baseUrl}/rooms/${fullRoom.id}`);
      await page.getByTestId("room-page").waitFor();
      assert.equal(await page.locator("h1").innerText(), fullRoom.room_name);

      // Five of the seven photos in the mosaic; a phone shows the first.
      assert.equal(await page.locator(".gallery > button.guest-photo").count(), 5);
      assert.equal(await page.locator(".gallery > button.guest-photo:visible").count(), mobile ? 1 : 5);
      assert.equal(await page.getByTestId("room-amenities").locator("li").count(), 4);
      await page.getByTestId("room-policies").waitFor();

      // Three reviews: 5, 4 and 5 stars.
      const reviews = page.getByTestId("room-reviews");
      await reviews.waitFor();
      assert.match(await reviews.locator(".review-score b").innerText(), /4,7/);
      assert.deepEqual(await reviews.locator(".review-bars b").allInnerTexts(), ["2", "1", "0", "0", "0"]);
      assert.equal(await reviews.locator(".review-list li").count(), 3);

      // The booking form: beside the page on a desktop, below it on a phone
      // with the price pinned to the bottom of the screen.
      await page.locator("#booking-panel").waitFor();
      assert.equal(await page.locator(".mobile-book-bar").isVisible(), mobile);
      assert.deepEqual(await sidewaysOverflow(page), [], `${name}: the page scrolls sideways`);
      await screenshot(page, `room-${name}`);
      if (mobile) await screenshot(page, `room-${name}-price-bar`, { full: false });
    });
  });

  it("opens the gallery full screen and works from the keyboard", async () => {
    await everywhere(async (page, name, mobile) => {
      await page.goto(`${stack.baseUrl}/rooms/${fullRoom.id}`);
      await page.getByTestId("gallery").waitFor();
      const position = page.getByTestId("lightbox-position");

      const opener = page.locator(".gallery > button.guest-photo").first();
      await opener.focus();
      await page.keyboard.press("Enter");
      const lightbox = page.getByTestId("lightbox");
      await lightbox.waitFor();
      assert.equal(await position.innerText(), "1 / 7");

      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      assert.equal(await position.innerText(), "3 / 7");
      await page.keyboard.press("ArrowLeft");
      assert.equal(await position.innerText(), "2 / 7");
      // Round the end.
      for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
      assert.equal(await position.innerText(), "1 / 7");

      // Focus never reaches the page behind the dialog.
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press("Tab");
        assert.ok(await page.evaluate(() => document.activeElement === document.body || Boolean(document.activeElement?.closest("dialog"))), `focus reached the page behind after ${i + 1} tabs`);
      }

      await lightbox.getByRole("button", { name: `${TEXT.detail.showPhoto.split("{{")[0]}3`, exact: true }).click();
      assert.equal(await position.innerText(), "3 / 7");
      await lightbox.locator(".lightbox-stage img").evaluate((image) => image.decode().catch(() => {}));
      if (!mobile || name.endsWith("light")) await screenshot(page, `room-gallery-${name}`, { full: false });

      // Escape closes it and focus goes back to the photo that opened it.
      await page.keyboard.press("Escape");
      await lightbox.waitFor({ state: "detached" });
      assert.ok(await opener.evaluate((element) => element === document.activeElement));
    });
  });

  it("leaves out what a room does not have, and says when there are no reviews", async () => {
    await everywhere(async (page, name) => {
      await page.goto(`${stack.baseUrl}/rooms/${bareRoom.id}`);
      await page.getByTestId("room-page").waitFor();

      // No photo: the drawn placeholder, with nothing to open.
      assert.equal(await page.locator(".gallery > button").count(), 0);
      assert.equal(await page.getByTestId("room-amenities").count(), 0);
      await page.getByTestId("reviews-empty").getByText(TEXT.reviews.empty).waitFor();
      assert.equal(await page.getByTestId("room-reviews").count(), 0);
      await screenshot(page, `room-no-reviews-${name}`);
    });
  });

  it("shows the room page loading, failed with a retry, and not found", async () => {
    const { context, page, problems } = await openPage();
    try {
      const request = new RegExp(`/api/rooms/${fullRoom.id}$`);
      let release;
      await page.route(request, (route) => new Promise((resolve) => { release = resolve; }).then(() => route.continue()));
      await page.goto(`${stack.baseUrl}/rooms/${fullRoom.id}?checkIn=2030-01-10&checkOut=2030-01-12&guests=2`);
      await page.getByTestId("room-loading").waitFor();
      await screenshot(page, "room-loading-desktop-1440-light");
      release();
      await page.getByTestId("room-page").waitFor();
      await page.unroute(request);

      await page.route(request, (route) => route.fulfill({ status: 500, json: { code: "SERVER_ERROR" } }));
      await page.reload();
      const failed = page.getByTestId("room-error");
      await failed.getByText(TEXT.detail.errorTitle).waitFor();
      await screenshot(page, "room-error-desktop-1440-light");
      await page.unroute(request);
      await failed.getByRole("button", { name: TEXT.list.retry }).click();
      await page.getByTestId("room-page").waitFor();
      // The stay chosen before the failure is still in the form.
      assert.equal(await page.inputValue("#booking-check-in"), "2030-01-10");

      await page.goto(`${stack.baseUrl}/rooms/999999`);
      await page.getByTestId("room-not-found").getByText(TEXT.detail.notFound).waitFor();
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("asks before deleting, with a typed code, and reports with toasts", async () => {
    const { context, page, problems } = await openPage();
    try {
      // A room nobody booked can be deleted; the reviewed one cannot.
      const spare = (await stack.pool.query("SELECT id, room_name FROM rooms WHERE id NOT IN (SELECT room_id FROM bookings) ORDER BY id DESC LIMIT 1")).rows[0];
      await signInAsAdmin(page);

      const askToDelete = async (room) => {
        await page.goto(`${stack.baseUrl}/admin/rooms`);
        await page.getByPlaceholder(/./).first().fill(room.room_name);
        const row = page.locator("tr", { hasText: room.room_name }).first();
        await row.waitFor();
        await row.locator(".is-danger, button[style*='danger']").first().click();
        const dialog = page.getByRole("alertdialog");
        await dialog.waitFor();
        return dialog;
      };

      let dialog = await askToDelete(spare);
      // Focus starts on Cancel, and the delete button waits for the code.
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), COMMON.dialog.cancel);
      const confirm = page.getByTestId("confirm-ok");
      assert.ok(await confirm.isDisabled());
      await page.getByTestId("confirm-code").fill(`ROOM-${spare.id + 1}`);
      assert.ok(await confirm.isDisabled());
      await page.getByTestId("confirm-code").fill(`room-${spare.id}`);
      assert.ok(await confirm.isEnabled());
      await screenshot(page, "confirm-delete-desktop-1440-light", { full: false });

      // Escape cancels and nothing is deleted.
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert.equal((await stack.pool.query("SELECT 1 FROM rooms WHERE id = $1", [spare.id])).rows.length, 1);

      // Confirmed: deleted, with a success toast that goes away by itself.
      dialog = await askToDelete(spare);
      await page.getByTestId("confirm-code").fill(`ROOM-${spare.id}`);
      await confirm.click();
      const success = page.getByTestId("toast-success");
      await success.waitFor();
      await screenshot(page, "toast-success-desktop-1440-light", { full: false });
      assert.equal((await stack.pool.query("SELECT 1 FROM rooms WHERE id = $1", [spare.id])).rows.length, 0);
      await success.waitFor({ state: "detached", timeout: 9000 });

      // Refused by the API (the room has bookings): an error toast that stays.
      dialog = await askToDelete(fullRoom);
      await page.getByTestId("confirm-code").fill(`ROOM-${fullRoom.id}`);
      await confirm.click();
      const failure = page.getByTestId("toast-error");
      await failure.waitFor();
      assert.equal(await failure.getAttribute("role"), "alert");
      await page.waitForTimeout(7000);
      assert.ok(await failure.isVisible(), "an error toast does not hide by itself");
      await screenshot(page, "toast-error-desktop-1440-light", { full: false });
      await failure.getByRole("button", { name: COMMON.dialog.dismiss }).click();
      await failure.waitFor({ state: "detached" });

      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("shows the demo banner only in demo mode, and lets it be closed for the session", async () => {
    const saved = { demo: process.env.DEMO_MODE, vnpay: process.env.VNPAY_PAY_URL, momo: process.env.MOMO_ENABLED };
    try {
      // Not a demo: no banner anywhere.
      const plain = await openPage();
      await plain.page.goto(`${stack.baseUrl}/rooms`);
      await listState(plain.page, "ready").waitFor();
      assert.equal(await plain.page.getByTestId("demo-banner").count(), 0);
      await plain.context.close();

      process.env.DEMO_MODE = "true";
      delete process.env.VNPAY_PAY_URL;
      delete process.env.MOMO_ENABLED;

      for (const [name, viewport] of VIEWS) {
        const { context, page, problems } = await openPage({ viewport });
        try {
          await page.goto(`${stack.baseUrl}/rooms`);
          const banner = page.getByTestId("demo-banner");
          await banner.waitFor();
          assert.equal(await banner.getAttribute("role"), "note");
          // It pushes the page down: the header starts where the banner ends.
          const bannerBox = await banner.boundingBox();
          const headerBox = await page.locator(".guest-header").boundingBox();
          assert.ok(Math.abs(headerBox.y - (bannerBox.y + bannerBox.height)) < 1);
          // One line on a phone.
          if (name.startsWith("mobile")) assert.ok(bannerBox.height <= 44, `banner is ${bannerBox.height}px tall`);
          assert.deepEqual(await sidewaysOverflow(page), []);
          await screenshot(page, `demo-banner-guest-${name}-light`, { full: false });

          // The payment result page adds that no real money moves (test gateways).
          await signInAsAdmin(page);
          await page.goto(`${stack.baseUrl}/payment/result`);
          await banner.getByText(COMMON.demo.noRealMoney).locator("visible=true").waitFor();

          await page.goto(`${stack.baseUrl}/admin`);
          await page.locator(".adm-shell").waitFor();
          await banner.waitFor();
          const shellBox = await page.locator(".adm-shell").boundingBox();
          const adminBanner = await banner.boundingBox();
          assert.ok(Math.abs(shellBox.y - (adminBanner.y + adminBanner.height)) < 1);
          await screenshot(page, `demo-banner-admin-${name}-light`, { full: false });

          // Closed: gone on the next pages of this tab, back in a new session.
          await banner.getByRole("button", { name: COMMON.demo.close }).click();
          assert.equal(await banner.count(), 0);
          await page.goto(`${stack.baseUrl}/rooms`);
          await listState(page, "ready").waitFor();
          assert.equal(await banner.count(), 0);
          assert.deepEqual(problems, []);
        } finally {
          await context.close();
        }
      }

      // With a live gateway configured the banner does not promise anything
      // about money.
      process.env.VNPAY_PAY_URL = "https://pay.vnpay.vn/vpcpay.html";
      const live = await openPage();
      await signInAsAdmin(live.page);
      await live.page.goto(`${stack.baseUrl}/payment/result`);
      const banner = live.page.getByTestId("demo-banner");
      await banner.waitFor();
      assert.ok(!(await banner.innerText()).includes(COMMON.demo.noRealMoney));
      await live.context.close();
    } finally {
      for (const [name, value] of [["DEMO_MODE", saved.demo], ["VNPAY_PAY_URL", saved.vnpay], ["MOMO_ENABLED", saved.momo]]) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
