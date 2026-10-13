// The admin area in a real browser, against the built web app and the real
// API: the frame (grouped menu, rail on a tablet, search, live bell, account
// menu), the dashboard, the bookings list with its panel and money dialogs,
// desk bookings, the room calendar, the room type picker, and the phone
// layout. Every state of each screen, both themes, three widths.
//
// Screenshots are written to test-results/phase-10/app/.
//
// Run with `npm run test:e2e` from the repository root.

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { addAdminSample } from "./admin-sample.mjs";
import { startStack } from "./stack.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = path.resolve(HERE, "../../../test-results/phase-10/app");
const LOCALES = path.join(HERE, "../src/locales/vi");
const read = (name) => JSON.parse(fs.readFileSync(path.join(LOCALES, `${name}.json`), "utf8"));
const ADMIN_TEXT = read("admin");
const ORDERS = read("orders");
const DASH = read("dashboard");
const requireApi = createRequire(path.resolve(HERE, "../../api/server.js"));

const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 1024, height: 900 };
const PHONE = { width: 390, height: 844 };
const SIZES = [["desktop", DESKTOP], ["tablet", TABLET], ["mobile", PHONE]];
const ADMIN = { email: "admin@example.com", password: "Admin-E2E-12345" };

let stack;
let today;

const code = (id) => `#BK-${String(id).padStart(4, "0")}`;

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
  await page.waitForTimeout(200);
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

// Holds an API call back so the loading state can be seen. The page may
// have moved on (and the route been removed) by the time it is let through.
async function slowly(route) {
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await route.continue().catch(() => {});
}

// Waits until `check` (run in the test) returns true.
async function until(check, timeout = 10000) {
  const end = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`timed out: ${check}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const state = (page, testId, value) => page.locator(`[data-testid="${testId}"][data-state="${value}"]`);

describe("The admin area in the browser", () => {
  before(async () => {
    process.env.SEED_ADMIN_PASSWORD = ADMIN.password;
    stack = await startStack();
    today = requireApi("./src/utils/time").todayInAppTimezone();
    await addAdminSample(stack.pool, { today });
    // One room under maintenance, with no bookings: hatched in the calendar.
    await stack.pool.query("UPDATE rooms SET status = 'maintenance' WHERE id = (SELECT id FROM rooms WHERE id NOT IN (SELECT room_id FROM bookings) ORDER BY id LIMIT 1)");
  });

  after(async () => {
    await stack?.stop();
  });

  it("frames every admin screen: grouped menu of real screens, rail on a tablet, account menu, light and dark", async () => {
    for (const [size, viewport] of SIZES) {
      for (const colorScheme of ["light", "dark"]) {
        const { context, page, problems } = await openPage({ viewport, colorScheme });
        try {
          await page.goto(`${stack.baseUrl}/admin`);
          await state(page, "dashboard-page", "ready").waitFor();
          // The old frame's class stays on the frame (older screens and tests use it).
          assert.equal(await page.locator(".adm-shell").count(), 1);

          if (size !== "mobile") {
            const side = page.locator("aside.ax-side").first();
            // Only screens that exist, in their groups.
            const links = await side.locator("nav a").evaluateAll((items) => items.map((a) => new URL(a.href).pathname));
            assert.deepEqual(links, ["/admin", "/admin/calendar", "/admin/orders", "/admin/rooms", "/admin/coupons", "/admin/reviews", "/admin/users", "/admin/property", "/admin/destinations"]);
            assert.equal(await side.evaluate((el) => el.classList.contains("is-rail")), size === "tablet", "a rail on a tablet only");
            for (const link of links) {
              const response = await page.request.get(`${stack.baseUrl}${link}`);
              assert.equal(response.status(), 200);
            }
            // Menu count: bookings waiting for payment or a refund.
            const counts = (await api(page, "/bookings/counts")).body;
            const count = side.locator('[data-testid="nav-orders"] .ax-side__count');
            if (size === "desktop") assert.equal(await count.innerText(), String(counts.pending + counts.refund_pending));

            await shot(page, `shell-${size}-${colorScheme}`, { full: false });

            // Account menu: profile, password, light/dark, language, sign out.
            await page.getByTestId("account-menu-button").click();
            const menu = page.getByTestId("account-menu");
            await menu.waitFor();
            assert.deepEqual(
              await menu.locator('a[role="menuitem"]').evaluateAll((items) => items.map((a) => new URL(a.href).pathname)),
              ["/settings", "/settings/password"]
            );
            await shot(page, `shell-account-${size}-${colorScheme}`, { full: false });
            const before = await page.locator("html").getAttribute("data-theme");
            await page.getByTestId("account-menu-theme").click();
            assert.notEqual(await page.locator("html").getAttribute("data-theme"), before);
            await page.keyboard.press("Escape");
            await menu.waitFor({ state: "detached" });
          } else {
            await shot(page, `shell-${size}-${colorScheme}`, { full: false });
            await page.getByTestId("admin-menu-button").click();
            const drawer = page.locator("dialog.ax-menu");
            await drawer.waitFor();
            await shot(page, `menu-mobile-${colorScheme}`, { full: false });
            await drawer.getByRole("link", { name: ADMIN_TEXT.nav.reviews }).click();
            await page.waitForURL(/\/admin\/reviews$/);
            await drawer.waitFor({ state: "detached" });
          }
          assert.deepEqual(await sidewaysOverflow(page), []);
          assert.deepEqual(problems, []);
        } finally {
          await context.close();
        }
      }
    }
  });

  it("collapses and expands the menu, and remembers it", async () => {
    const { context, page } = await openPage();
    try {
      await page.goto(`${stack.baseUrl}/admin/orders`);
      const side = page.locator("aside.ax-side").first();
      await page.getByTestId("sidebar-toggle").click();
      assert.ok(await side.evaluate((el) => el.classList.contains("is-rail")));
      await page.reload();
      assert.ok(await page.locator("aside.ax-side").first().evaluate((el) => el.classList.contains("is-rail")));
      await shot(page, "shell-desktop-collapsed-light", { full: false });
      await page.getByTestId("sidebar-toggle").click();
      assert.ok(!(await side.evaluate((el) => el.classList.contains("is-rail"))));
    } finally {
      await context.close();
    }
  });

  it("searches bookings from the top bar by code, name or email, and opens one", async () => {
    const { context, page, problems } = await openPage();
    try {
      const booking = (await stack.pool.query("SELECT b.id, u.name, u.email FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.guest_name IS NULL AND u.role = 'user' ORDER BY b.id DESC LIMIT 1")).rows[0];
      await page.goto(`${stack.baseUrl}/admin`);
      const box = page.getByTestId("admin-search");
      const results = page.getByTestId("admin-search-results");

      for (const term of [code(booking.id), `bk${booking.id}`, booking.email]) {
        await box.fill(term);
        await results.locator('[role="option"]').first().waitFor();
        assert.ok((await results.innerText()).includes(code(booking.id)), term);
      }
      await box.fill(booking.name.split(" ").at(-1));
      await results.locator('[role="option"]').first().waitFor();
      await shot(page, "search-desktop-light", { full: false });

      // Nothing found.
      await box.fill("khong-co-ai-ten-nay");
      await results.getByText(/khong-co-ai-ten-nay/).waitFor();

      // Enter on a result opens it in the bookings list.
      await box.fill(code(booking.id));
      await results.locator('[role="option"]').first().waitFor();
      await box.press("ArrowDown");
      await box.press("Enter");
      await page.waitForURL(new RegExp(`/admin/orders\\?booking=${booking.id}`));
      await page.getByTestId("booking-drawer").waitFor();
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("rings the bell when a booking is made, with the real booking", async () => {
    const { context, page, problems } = await openPage();
    try {
      await page.goto(`${stack.baseUrl}/admin/calendar`);
      await page.getByTestId("calendar-grid").waitFor();
      // Let socket.io connect (long-polling through the test server).
      await page.waitForTimeout(1500);
      const room = (await stack.pool.query("SELECT id FROM rooms WHERE status = 'available' AND id NOT IN (SELECT room_id FROM bookings) ORDER BY id DESC LIMIT 1")).rows[0];
      const checkIn = new Date(`${today}T00:00:00Z`);
      checkIn.setUTCDate(checkIn.getUTCDate() + 60);
      const out = new Date(checkIn);
      out.setUTCDate(out.getUTCDate() + 2);
      const created = await api(page, "/bookings", {
        method: "POST",
        data: { room_id: room.id, check_in: checkIn.toISOString().slice(0, 10), check_out: out.toISOString().slice(0, 10), guests: 2, guest_name: "Khách Chuông Báo", guest_phone: "0909 000 111" },
      });
      assert.equal(created.status, 201);
      const id = created.body.booking.id;

      const bell = page.getByTestId("notifications-button");
      await page.locator('[data-testid="notifications-button"] .ax-badge-n').waitFor({ timeout: 15000 });
      await bell.click();
      const list = page.getByTestId("notifications");
      await list.getByText(code(id)).waitFor();
      await list.getByText("Khách Chuông Báo").waitFor();
      await shot(page, "notifications-desktop-light", { full: false });
      await list.getByText(code(id)).click();
      await page.waitForURL(new RegExp(`booking=${id}`));
      await page.getByTestId("booking-drawer").getByRole("heading", { name: "Khách Chuông Báo" }).waitFor();
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("dashboard: the API's figures, 7 / 30 days / custom, export, loading, empty and error", async () => {
    for (const [size, viewport] of SIZES) {
      for (const colorScheme of ["light", "dark"]) {
        const { context, page, problems } = await openPage({ viewport, colorScheme });
        try {
          await page.goto(`${stack.baseUrl}/admin`);
          await state(page, "dashboard-page", "ready").waitFor();
          const overview = (await api(page, "/dashboard/overview?days=7")).body;
          assert.equal(await page.getByTestId("kpi-bookings").locator(".ax-kpi__v").innerText(), String(overview.current.bookings));
          const strip = await page.getByTestId("today-strip").innerText();
          assert.ok(strip.includes(`${overview.todayAt.occupiedRooms} / ${overview.rooms.sellable}`));
          await shot(page, `dashboard-${size}-${colorScheme}`);
          if (size !== "mobile") {
            // The chart steps through its days from the keyboard.
            await page.getByTestId("revenue-chart").locator(".ax-plotarea").focus();
            await page.keyboard.press("ArrowRight");
            await page.keyboard.press("ArrowRight");
            await page.getByTestId("revenue-chart").locator(".ax-tip").waitFor();
            await shot(page, `dashboard-tooltip-${size}-${colorScheme}`, { full: false });
          }
          assert.deepEqual(await sidewaysOverflow(page), []);
          assert.deepEqual(problems, []);
        } finally {
          await context.close();
        }
      }
    }

    const { context, page, problems } = await openPage();
    try {
      // 30 days.
      await page.goto(`${stack.baseUrl}/admin`);
      await state(page, "dashboard-page", "ready").waitFor();
      await page.getByRole("button", { name: DASH.overview.range.d30 }).click();
      await page.waitForURL(/days=30/);
      await state(page, "dashboard-page", "ready").waitFor();
      const month = (await api(page, "/dashboard/overview?days=30")).body;
      // The 7 days stay on screen (dimmed) until the 30 have arrived.
      await until(async () => (await page.getByTestId("kpi-bookings").locator(".ax-kpi__v").innerText()) === String(month.current.bookings));
      await page.locator('[data-testid="dashboard-page"][aria-busy="false"]').waitFor();
      await shot(page, "dashboard-30days-desktop-light");

      // Custom: a ready range, then dates typed in; an impossible range is refused.
      await page.getByTestId("range-custom").click();
      const picker = page.getByTestId("range-picker");
      await picker.waitFor();
      await picker.getByRole("button", { name: DASH.overview.range.preset.lastMonth }).click();
      await shot(page, "dashboard-custom-desktop-light", { full: false });
      const inputs = picker.locator('input[type="date"]');
      await inputs.nth(0).fill(today);
      await inputs.nth(1).fill(`${Number(today.slice(0, 4)) - 1}-01-01`);
      await picker.getByRole("alert").waitFor();
      assert.ok(await picker.getByTestId("range-apply").isDisabled());
      await inputs.nth(0).fill(`${Number(today.slice(0, 4)) - 1}-01-01`);
      await inputs.nth(1).fill(`${Number(today.slice(0, 4)) - 1}-01-07`);
      await picker.getByTestId("range-apply").click();
      await page.waitForURL(/from=\d{4}-01-01&to=\d{4}-01-07/);
      // Nothing happened then: the empty state.
      await state(page, "dashboard-page", "empty").waitFor();
      await shot(page, "dashboard-empty-desktop-light");

      // Export the window shown.
      await page.goto(`${stack.baseUrl}/admin`);
      await state(page, "dashboard-page", "ready").waitFor();
      await page.getByTestId("export-button").click();
      const download = page.waitForEvent("download");
      await page.getByRole("menuitem", { name: DASH.overview.export.excel }).click();
      assert.match((await download).suggestedFilename(), /^luxestay-dashboard-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.xlsx$/);

      // Loading, then the API failing.
      await page.route("**/api/dashboard/overview**", slowly);
      await page.goto(`${stack.baseUrl}/admin`);
      await state(page, "dashboard-page", "loading").waitFor();
      await shot(page, "dashboard-loading-desktop-light", { full: false });
      await page.unroute("**/api/dashboard/overview**");
      await page.route("**/api/dashboard/overview**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "SERVER_ERROR" }) }));
      await page.goto(`${stack.baseUrl}/admin`);
      await state(page, "dashboard-page", "error").waitFor();
      await shot(page, "dashboard-error-desktop-light", { full: false });
      await page.unroute("**/api/dashboard/overview**");
      await page.getByRole("button", { name: DASH.overview.error.retry }).click();
      await state(page, "dashboard-page", "ready").waitFor();
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }

    // The same states on a phone.
    const phone = await openPage({ viewport: PHONE });
    try {
      await phone.page.route("**/api/dashboard/overview**", slowly);
      await phone.page.goto(`${stack.baseUrl}/admin`);
      await state(phone.page, "dashboard-page", "loading").waitFor();
      await shot(phone.page, "dashboard-loading-mobile-light", { full: false });
      await phone.page.unroute("**/api/dashboard/overview**");
      await phone.page.route("**/api/dashboard/overview**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
      await phone.page.reload();
      await state(phone.page, "dashboard-page", "error").waitFor();
      await shot(phone.page, "dashboard-error-mobile-light", { full: false });
    } finally {
      await phone.context.close();
    }
  });

  it("bookings: tabs with counts, search, filters, pages, the panel, all states", async () => {
    for (const [size, viewport] of SIZES) {
      for (const colorScheme of ["light", "dark"]) {
        const { context, page, problems } = await openPage({ viewport, colorScheme });
        try {
          await page.goto(`${stack.baseUrl}/admin/orders`);
          await page.getByTestId(size === "mobile" ? "orders-cards" : "orders-table").waitFor();
          const counts = (await api(page, "/bookings/counts")).body;
          const tabText = await page.getByTestId("tab-in_house").innerText();
          assert.ok(tabText.includes(String(counts.in_house)), tabText);
          assert.ok((await page.getByTestId("tab-confirmed").innerText()).includes(String(counts.confirmed - counts.in_house)));
          await shot(page, `bookings-${size}-${colorScheme}`, { full: size === "mobile" });

          const first = (await api(page, "/bookings?page=1&limit=1")).body.data[0];
          await page.goto(`${stack.baseUrl}/admin/orders?booking=${first.id}`);
          const drawer = page.getByTestId("booking-drawer");
          await drawer.getByRole("heading", { name: first.guest_name || first.user_name }).waitFor();
          await shot(page, `bookings-detail-${size}-${colorScheme}`, { full: false });
          await page.keyboard.press("Escape");
          await drawer.waitFor({ state: "detached" });
          assert.ok(!page.url().includes("booking="));
          assert.deepEqual(await sidewaysOverflow(page), []);
          assert.deepEqual(problems, []);
        } finally {
          await context.close();
        }
      }
    }

    const { context, page, problems } = await openPage();
    try {
      await page.goto(`${stack.baseUrl}/admin/orders`);
      await page.getByTestId("orders-table").waitFor();
      const counts = (await api(page, "/bookings/counts")).body;

      // A tab: the list is what the API gives for it.
      await page.getByTestId("tab-pending").click();
      await page.waitForURL(/tab=pending/);
      await until(async () => (await page.getByTestId("order-row").count()) === Math.min(20, counts.pending));
      for (const text of await page.getByTestId("order-row").allInnerTexts()) assert.ok(text.includes(ORDERS.tabs.pending), text);

      // Desk bookings only.
      await page.getByTestId("tab-all").click();
      await page.getByTestId("filter-channel").selectOption("desk");
      await page.waitForURL(/channel=desk/);
      const desk = (await api(page, "/bookings?page=1&limit=20&channel=desk")).body;
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid="order-row"]').length === n, Math.min(20, desk.total));
      assert.ok((await page.getByTestId("orders-table").innerText()).includes(ORDERS.channel.desk));

      // Pages.
      await page.getByTestId("filter-channel").selectOption("");
      await page.getByTestId("orders-pagination").getByRole("button", { name: ORDERS.pager.next }).click();
      await page.waitForURL(/page=2/);
      const second = (await api(page, "/bookings?page=2&limit=20")).body.data[0];
      await page.getByTestId("orders-table").getByText(code(second.id)).waitFor();

      // Search: no match, then the empty state's way out.
      await page.getByTestId("orders-search").fill("không-có-ai");
      await page.getByTestId("orders-empty").waitFor();
      await shot(page, "bookings-empty-desktop-light", { full: false });
      await page.getByRole("button", { name: ORDERS.states.clear }).click();
      await page.getByTestId("orders-table").waitFor();

      // Loading and failure.
      await page.route("**/api/bookings?**", slowly);
      await page.goto(`${stack.baseUrl}/admin/orders`);
      await page.getByTestId("orders-loading").waitFor();
      await shot(page, "bookings-loading-desktop-light", { full: false });
      await page.unroute("**/api/bookings?**");
      await page.route("**/api/bookings?**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
      await page.goto(`${stack.baseUrl}/admin/orders`);
      await page.getByTestId("orders-error").waitFor();
      await shot(page, "bookings-error-desktop-light", { full: false });
      await page.unroute("**/api/bookings?**");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }

    // Phone states.
    const phone = await openPage({ viewport: PHONE });
    try {
      await phone.page.goto(`${stack.baseUrl}/admin/orders?q=khong-co-ai`);
      await phone.page.getByTestId("orders-empty").waitFor();
      await shot(phone.page, "bookings-empty-mobile-light", { full: false });
      await phone.page.route("**/api/bookings?**", slowly);
      await phone.page.goto(`${stack.baseUrl}/admin/orders`);
      await phone.page.getByTestId("orders-loading").waitFor();
      await shot(phone.page, "bookings-loading-mobile-light", { full: false });
      await phone.page.unroute("**/api/bookings?**");
      await phone.page.route("**/api/bookings?**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
      await phone.page.goto(`${stack.baseUrl}/admin/orders`);
      await phone.page.getByTestId("orders-error").waitFor();
      await shot(phone.page, "bookings-error-mobile-light", { full: false });
    } finally {
      await phone.context.close();
    }
  });

  it("bookings: money taken at the desk, refund sent, cancel, delete only without money", async () => {
    const { context, page, problems } = await openPage();
    try {
      // Payment received: the booking's total, then confirmed and paid.
      const unpaid = (await stack.pool.query("SELECT id, total_price FROM bookings WHERE status = 'pending' AND payment_status = 'unpaid' ORDER BY id DESC LIMIT 1")).rows[0];
      await page.goto(`${stack.baseUrl}/admin/orders?booking=${unpaid.id}`);
      const drawer = page.getByTestId("booking-drawer");
      await drawer.getByTestId("drawer-money").click();
      const collect = page.getByTestId("collect-dialog");
      await collect.waitFor();
      assert.equal((await collect.getByTestId("collect-amount").innerText()).replace(/\D/g, ""), String(Number(unpaid.total_price)));
      await shot(page, "bookings-collect-desktop-light", { full: false });
      await collect.getByTestId("collect-confirm").click();
      await page.getByTestId("toast-success").waitFor();
      await shot(page, "bookings-toast-desktop-light", { full: false });
      const paid = (await stack.pool.query("SELECT status, payment_status FROM bookings WHERE id = $1", [unpaid.id])).rows[0];
      assert.deepEqual(paid, { status: "confirmed", payment_status: "paid" });

      // Refund: the amount is what the gateway took.
      const owed = (await stack.pool.query(
        `SELECT b.id, COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'success'), b.total_price) AS amount
         FROM bookings b LEFT JOIN payments p ON p.booking_id = b.id
         WHERE b.payment_status = 'refund_pending' GROUP BY b.id ORDER BY b.id LIMIT 1`
      )).rows[0];
      await page.goto(`${stack.baseUrl}/admin/orders?tab=refund`);
      await page.getByTestId("row-action").first().click();
      const refund = page.getByTestId("refund-dialog");
      await refund.getByTestId("refund-amount").waitFor();
      assert.equal((await refund.getByTestId("refund-amount").innerText()).replace(/\D/g, ""), String(Number(owed.amount)));
      await shot(page, "bookings-refund-desktop-light", { full: false });
      await refund.getByTestId("refund-confirm").click();
      await page.getByTestId("toast-success").waitFor();
      assert.equal((await stack.pool.query("SELECT payment_status FROM bookings WHERE id = $1", [owed.id])).rows[0].payment_status, "refunded");

      // A paid booking cannot be deleted: no delete button, and the API agrees.
      await page.goto(`${stack.baseUrl}/admin/orders?booking=${unpaid.id}`);
      await drawer.getByText(ORDERS.drawer.cannotDelete).waitFor();
      assert.equal((await api(page, `/bookings/${unpaid.id}`, { method: "DELETE" })).status, 400);

      // Cancel it: money to send back.
      await drawer.getByRole("button", { name: ORDERS.drawer.cancel }).click();
      await page.getByRole("alertdialog").getByTestId("confirm-ok").click();
      await page.getByTestId("toast-success").first().waitFor();
      assert.equal((await stack.pool.query("SELECT payment_status FROM bookings WHERE id = $1", [unpaid.id])).rows[0].payment_status, "refund_pending");

      // An unpaid booking can be deleted, after typing its code.
      const spare = (await stack.pool.query("SELECT id FROM bookings b WHERE payment_status = 'unpaid' AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id) ORDER BY id DESC LIMIT 1")).rows[0];
      await page.goto(`${stack.baseUrl}/admin/orders?booking=${spare.id}`);
      await drawer.getByRole("button", { name: ORDERS.drawer.delete }).click();
      const confirm = page.getByRole("alertdialog");
      assert.ok(await confirm.getByTestId("confirm-ok").isDisabled());
      await confirm.getByTestId("confirm-code").fill(`BK-${String(spare.id).padStart(4, "0")}`);
      await confirm.getByTestId("confirm-ok").click();
      await page.getByTestId("toast-success").first().waitFor();
      assert.equal((await stack.pool.query("SELECT 1 FROM bookings WHERE id = $1", [spare.id])).rows.length, 0);
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("bookings: a desk booking, checked before it is sent", async () => {
    for (const [size, viewport] of SIZES) {
      const { context, page, problems } = await openPage({ viewport });
      try {
        await page.goto(`${stack.baseUrl}/admin/orders?new=desk`);
        const form = page.getByTestId("walk-in-drawer");
        await form.waitFor();
        await form.getByTestId("walk-in-submit").click();
        await form.getByText(ORDERS.walkIn.errors.name).waitFor();
        await shot(page, `bookings-counter-errors-${size}-light`, { full: false });
        if (size !== "desktop") continue;

        const start = new Date(`${today}T00:00:00Z`);
        start.setUTCDate(start.getUTCDate() + 90);
        const end = new Date(start);
        end.setUTCDate(end.getUTCDate() + 2);
        await form.locator("#walkin-guestName").fill("Đinh Quang Huy");
        await form.locator("#walkin-guestPhone").fill("0912 334 455");
        await form.locator("#walkin-checkIn").fill(start.toISOString().slice(0, 10));
        await form.locator("#walkin-checkOut").fill(end.toISOString().slice(0, 10));
        await page.waitForFunction(() => document.querySelectorAll("#walkin-roomId option").length > 1);
        const roomId = await form.locator("#walkin-roomId option").nth(1).getAttribute("value");
        await form.locator("#walkin-roomId").selectOption(roomId);
        await form.getByTestId("walk-in-paid").check();
        const price = Number((await stack.pool.query("SELECT price FROM rooms WHERE id = $1", [roomId])).rows[0].price);
        assert.equal((await form.getByTestId("walk-in-total").innerText()).replace(/\D/g, ""), String(price * 2));
        await shot(page, "bookings-counter-desktop-light", { full: false });
        await form.getByTestId("walk-in-submit").click();
        await page.getByTestId("toast-success").waitFor();
        const made = (await stack.pool.query("SELECT id, status, payment_status, guest_name FROM bookings WHERE guest_name = 'Đinh Quang Huy'")).rows[0];
        assert.deepEqual({ status: made.status, payment_status: made.payment_status }, { status: "confirmed", payment_status: "paid" });
        await page.waitForURL(new RegExp(`booking=${made.id}`));
        assert.deepEqual(problems, []);
      } finally {
        await context.close();
      }
    }
  });

  it("room calendar: every room, stays across their nights, week and month, types, states", async () => {
    for (const [size, viewport] of SIZES) {
      for (const colorScheme of ["light", "dark"]) {
        const { context, page, problems } = await openPage({ viewport, colorScheme });
        try {
          await page.goto(`${stack.baseUrl}/admin/calendar`);
          const grid = page.getByTestId("calendar-grid");
          await grid.waitFor();
          await shot(page, `calendar-${size}-${colorScheme}`, { full: false });
          if (size === "desktop" && colorScheme === "light") {
            const from = `${today.slice(0, 7)}-01`;
            const next = new Date(`${from}T00:00:00Z`);
            next.setUTCMonth(next.getUTCMonth() + 1);
            next.setUTCDate(0);
            const timeline = (await api(page, `/bookings/timeline?from=${from}&to=${next.toISOString().slice(0, 10)}`)).body;
            assert.equal(await page.getByTestId("calendar-block").count(), timeline.bookings.length);
            assert.equal(await grid.locator(".ax-tl__room").count(), timeline.rooms.length);
            assert.equal(await grid.locator(".ax-blk.is-block").count(), timeline.rooms.filter((room) => room.status === "maintenance").length);

            await page.getByTestId("calendar-block").first().click();
            const pop = page.getByTestId("calendar-popover");
            await pop.waitFor();
            await shot(page, "calendar-popover-desktop-light", { full: false });
            await page.keyboard.press("Escape");
            await pop.waitFor({ state: "detached" });

            // One type only; a week.
            const type = timeline.rooms[0].room_type;
            await page.locator(".ax-toolbar").getByRole("button", { name: type, exact: true }).click();
            const ofType = timeline.rooms.filter((room) => room.room_type === type).length;
            await until(async () => (await grid.locator(".ax-tl__room").count()) === ofType);
            await page.getByRole("button", { name: "Tuần", exact: true }).click();
            await page.waitForURL(/view=week/);
            await until(async () => (await grid.locator(".ax-tl__day").count()) === 7);
            await shot(page, "calendar-week-desktop-light", { full: false });
          }
          assert.deepEqual(problems, []);
        } finally {
          await context.close();
        }
      }
    }

    const { context, page } = await openPage();
    try {
      await page.route("**/api/bookings/timeline**", slowly);
      await page.goto(`${stack.baseUrl}/admin/calendar`);
      await page.getByTestId("calendar-loading").waitFor();
      await shot(page, "calendar-loading-desktop-light", { full: false });
      await page.unroute("**/api/bookings/timeline**");
      await page.route("**/api/bookings/timeline**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
      await page.goto(`${stack.baseUrl}/admin/calendar`);
      await page.getByTestId("calendar-error").waitFor();
      await shot(page, "calendar-error-desktop-light", { full: false });
      await page.unroute("**/api/bookings/timeline**");
      // No rooms at all (a new property).
      await page.route("**/api/bookings/timeline**", async (route) => {
        const real = await route.fetch();
        const body = await real.json();
        await route.fulfill({ response: real, json: { ...body, rooms: [], bookings: [] } });
      });
      await page.goto(`${stack.baseUrl}/admin/calendar`);
      await page.getByTestId("calendar-empty").waitFor();
      await shot(page, "calendar-empty-desktop-light", { full: false });
    } finally {
      await context.close();
    }
  });

  it("room form: a type is picked from those in use; a new one that is already in use is not added twice", async () => {
    const { context, page, problems } = await openPage();
    try {
      await page.goto(`${stack.baseUrl}/admin/rooms`);
      await page.getByRole("button", { name: /Thêm phòng/ }).first().click();
      const form = page.getByTestId("room-form");
      await form.waitFor();
      const types = (await api(page, "/rooms/types")).body.map((item) => item.type);
      const options = await form.getByTestId("room-type-select").locator("option").allInnerTexts();
      for (const type of types) assert.ok(options.includes(type), type);

      await form.getByTestId("room-type-select").selectOption("__new__");
      const existing = types[0];
      await form.getByTestId("room-type-new").fill(`  ${existing.toLowerCase()}  `);
      await form.getByText(new RegExp(existing)).first().waitFor();
      await shot(page, "room-type-desktop-light", { full: false });
      await form.locator("#room-name").fill("Phòng Thử Loại");
      await form.locator("#room-price").fill("1500000");
      await form.locator('button[type="submit"]').click();
      await page.getByTestId("toast-success").waitFor();
      assert.equal((await stack.pool.query("SELECT room_type FROM rooms WHERE room_name = 'Phòng Thử Loại'")).rows[0].room_type, existing);
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("every other admin screen fits a phone", async () => {
    const { context, page, problems } = await openPage({ viewport: PHONE });
    try {
      for (const screen of ["users", "rooms", "coupons", "reviews", "property", "destinations", "calendar"]) {
        await page.goto(`${stack.baseUrl}/admin/${screen}`);
        await page.locator(".ax-body > *").first().waitFor();
        // Let the screen's data arrive (the live socket keeps the network busy).
        await page.waitForTimeout(1200);
        // The calendar scrolls inside its own frame.
        assert.deepEqual(await sidewaysOverflow(page), [], screen);
        await shot(page, `other-${screen}-mobile-light`, { full: false });
      }
      await page.goto(`${stack.baseUrl}/settings`);
      await page.getByTestId("profile-form").waitFor();
      assert.deepEqual(await sidewaysOverflow(page), []);
      await shot(page, "other-settings-mobile-light", { full: false });

      // The toast above the bottom bar.
      await page.goto(`${stack.baseUrl}/admin/orders`);
      const unpaid = (await stack.pool.query("SELECT id FROM bookings WHERE status = 'pending' AND payment_status = 'unpaid' ORDER BY id DESC LIMIT 1")).rows[0];
      await page.goto(`${stack.baseUrl}/admin/orders?booking=${unpaid.id}`);
      await page.getByTestId("drawer-money").click();
      await page.getByTestId("collect-confirm").click();
      await page.getByTestId("toast-success").waitFor();
      await shot(page, "toast-mobile-light", { full: false });
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });
});
