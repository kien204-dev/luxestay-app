// The home page in a real browser, against the built web app and the real
// API: what a fresh install shows, the four states of "featured rooms", the
// sections an admin fills in, light/dark, and the phone layout.
//
// Screenshots are written to test-results/home/.
//
// Run with `npm run test:e2e` from the repository root.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { startStack } from "./stack.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = path.resolve(HERE, "../../../test-results/home");
const TEXT = JSON.parse(fs.readFileSync(path.join(HERE, "../src/locales/vi/site.json"), "utf8"));

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const ROOMS_REQUEST = /\/api\/rooms\?/;

let stack;

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

function featured(page, state) {
  return page.locator(`[data-testid="featured-rooms"][data-state="${state}"]`);
}

async function openHome(page) {
  await page.goto(`${stack.baseUrl}/`);
  await featured(page, "ready").waitFor();
  await page.locator(".dest-card").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
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

// Lazy photos only load near the viewport; a full-page screenshot needs them.
async function screenshot(page, name, locator) {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  const file = path.join(SCREENSHOTS, `${name}.png`);
  if (locator) {
    await locator.scrollIntoViewIfNeeded();
    await locator.screenshot({ path: file });
    return;
  }
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    window.scrollTo(0, 0);
    await Promise.all(Array.from(document.images, (image) => image.decode().catch(() => {})));
  });
  await page.screenshot({ path: file, fullPage: true });
}

// The headline, amenities and nearby places an admin would type under
// "Cơ sở lưu trú", and a few more reviews, written straight to the tables.
async function fillHomeContent() {
  const { pool } = stack;
  await pool.query(
    `INSERT INTO property_settings (id, hero_title, hero_subtitle, address, phone, amenities, nearby_places)
     VALUES (1, $1, $2, $3, $4, $5, $6)`,
    [
      "Tiêu đề do quản trị viên đặt",
      "Dòng mô tả do quản trị viên nhập ở trang Cơ sở lưu trú.",
      "12 Đường Thử Nghiệm, Phường Mẫu",
      "0900 000 000",
      JSON.stringify([
        { name: "Tiện ích thử 1", description: "Mô tả thử cho tiện ích 1." },
        { name: "Tiện ích thử 2", description: "Mô tả thử cho tiện ích 2." },
        { name: "Tiện ích thử 3", description: "" },
        { name: "Tiện ích thử 4", description: "Mô tả thử cho tiện ích 4." },
      ]),
      JSON.stringify([
        { name: "Điểm lân cận thử 1", note: "Ghi chú thử", distance: "10 phút" },
        { name: "Điểm lân cận thử 2", note: "", distance: "2 km" },
      ]),
    ]
  );
  for (const [index, comment] of ["Đánh giá thử thứ nhất của khách.", "Đánh giá thử thứ hai của khách."].entries()) {
    await pool.query(
      `WITH guest AS (SELECT id FROM users WHERE email = 'user@example.com'),
            room AS (SELECT id, price FROM rooms ORDER BY id OFFSET $1::int LIMIT 1),
            stay AS (
              INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, payment_status)
              SELECT guest.id, room.id, CURRENT_DATE - 60, CURRENT_DATE - 58, room.price * 2, 2, 'completed', 'paid'
              FROM guest, room
              RETURNING id, user_id, room_id
            )
       INSERT INTO room_reviews (room_id, user_id, booking_id, rating, comment)
       SELECT room_id, user_id, id, 4, $2 FROM stay`,
      [30 + index, comment]
    );
  }
}

describe("The home page in the browser", () => {
  before(async () => {
    stack = await startStack();
  });

  after(async () => {
    await stack?.stop();
  });

  it("shows only real data on a fresh install, in both themes and on a phone", async () => {
    for (const [name, viewport] of [["desktop-1440", DESKTOP], ["mobile-390", PHONE]]) {
      for (const colorScheme of ["light", "dark"]) {
        const { context, page, problems } = await openPage({ viewport, colorScheme });
        try {
          await openHome(page);

          // With no stored choice the theme is the system's.
          assert.equal(await page.locator("html").getAttribute("data-theme"), colorScheme);

          // The neutral headline; three real rooms, the first one large.
          assert.equal(await page.locator(".home-hero h1").innerText(), TEXT.home.heroTitle);
          assert.equal(await page.locator(".home-rooms .room-card").count(), 3);
          assert.equal(await page.locator(".home-rooms .room-card--lead").count(), 1);
          assert.ok((await page.locator(".dest-card").count()) > 0);

          // The sample data has one review: the score is computed from it.
          assert.match(await page.getByTestId("hero-rating").innerText(), /5,0 \/ 5/);
          await page.getByTestId("guest-voices").waitFor();

          // Nothing was written for these, so they are not there at all.
          assert.equal(await page.getByTestId("amenities").count(), 0);
          assert.equal(await page.getByTestId("location").count(), 0);

          assert.deepEqual(await sidewaysOverflow(page), [], `${name}: the page scrolls sideways`);

          await screenshot(page, `${name}-${colorScheme}`);
          assert.deepEqual(problems, []);
        } finally {
          await context.close();
        }
      }
    }
  });

  it("fits a 360px screen and keeps touch targets at 44px", async () => {
    const { context, page, problems } = await openPage({ viewport: { width: 360, height: 740 } });
    try {
      await openHome(page);
      assert.deepEqual(await sidewaysOverflow(page), [], "the page scrolls sideways");

      await page.getByRole("button", { name: TEXT.nav.menu, exact: true }).click();
      await page.locator("#guest-nav.is-open").waitFor();
      await screenshot(page, "mobile-360-menu", page.locator(".guest-header"));

      // Everything meant to be pressed, wherever it is on the page. A room
      // card's link is its title, stretched over the whole card.
      const small = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".guest button, .guest a, .guest input, .guest select"))
          .filter((element) => !element.closest(".room-card") && element.getClientRects().length > 0)
          .map((element) => {
            const box = (element.closest(".search-seg") || element).getBoundingClientRect();
            return { what: `${element.tagName} "${(element.innerText || element.getAttribute("aria-label") || element.id || "").trim().slice(0, 30)}"`, height: Math.round(box.height), width: Math.round(box.width) };
          })
          .filter((box) => box.height < 44 || box.width < 40)
      );
      assert.deepEqual(small, []);
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("shows featured rooms loading, empty, failed with a retry, and ready", async () => {
    const { context, page, problems } = await openPage();
    try {
      const section = page.getByTestId("featured-rooms");

      // Loading: the request is held back.
      let release;
      await page.route(ROOMS_REQUEST, (route) => new Promise((resolve) => { release = resolve; }).then(() => route.continue()));
      await page.goto(`${stack.baseUrl}/`);
      await featured(page, "loading").waitFor();
      assert.equal(await section.locator("[aria-busy='true']").count(), 1);
      await page.evaluate(() => document.fonts.ready);
      await screenshot(page, "featured-rooms-loading", section);
      release();
      await featured(page, "ready").waitFor();
      await page.locator(".home-rooms .room-card img").first().evaluate((image) => image.decode().catch(() => {}));
      await screenshot(page, "featured-rooms-ready", section);
      await page.unroute(ROOMS_REQUEST);

      // Empty: the API has no room to offer.
      await page.route(ROOMS_REQUEST, (route) =>
        route.fulfill({ json: { data: [], pagination: { page: 1, limit: 3, total: 0, totalPages: 1 } } })
      );
      await page.reload();
      await featured(page, "empty").waitFor();
      await section.getByText(TEXT.home.rooms.emptyTitle).waitFor();
      await screenshot(page, "featured-rooms-empty", section);
      await page.unroute(ROOMS_REQUEST);

      // Failed: a message with "try again", which then loads the rooms.
      await page.route(ROOMS_REQUEST, (route) => route.fulfill({ status: 500, json: { code: "SERVER_ERROR" } }));
      await page.reload();
      await featured(page, "error").waitFor();
      await section.getByRole("alert").getByText(TEXT.home.rooms.errorTitle).waitFor();
      await screenshot(page, "featured-rooms-error", section);
      await page.unroute(ROOMS_REQUEST);
      await section.getByRole("button", { name: TEXT.list.retry }).click();
      await featured(page, "ready").waitFor();
      assert.equal(await page.locator(".home-rooms .room-card").count(), 3);

      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("remembers the theme the visitor chooses", async () => {
    const { context, page, problems } = await openPage({ colorScheme: "light" });
    try {
      await openHome(page);
      const html = page.locator("html");
      assert.equal(await html.getAttribute("data-theme"), "light");
      const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

      await page.getByTestId("theme-switch").click();
      assert.equal(await html.getAttribute("data-theme"), "dark");
      assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), light);

      // Still dark after a reload, and on another page.
      await page.reload();
      assert.equal(await html.getAttribute("data-theme"), "dark");
      await page.goto(`${stack.baseUrl}/rooms`);
      assert.equal(await html.getAttribute("data-theme"), "dark");
      await page.locator(".room-card").first().waitFor();
      await screenshot(page, "rooms-dark");

      await page.getByTestId("theme-switch").click();
      assert.equal(await html.getAttribute("data-theme"), "light");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("searches with the guest counter", async () => {
    const { context, page, problems } = await openPage();
    try {
      await openHome(page);
      const guests = page.locator("#search-guests");
      assert.ok((await guests.innerText()).includes(TEXT.search.anyGuests));

      await guests.click();
      const counter = page.getByRole("dialog", { name: TEXT.search.guests });
      // No child without an adult.
      assert.ok(await counter.getByRole("button", { name: TEXT.search.moreChildren }).isDisabled());
      await counter.getByRole("button", { name: TEXT.search.moreAdults }).click();
      await counter.getByRole("button", { name: TEXT.search.moreAdults }).click();
      await counter.getByRole("button", { name: TEXT.search.moreChildren }).click();
      await screenshot(page, "search-guest-counter", page.locator(".home-hero"));
      await counter.getByRole("button", { name: TEXT.search.done }).click();
      assert.equal(await counter.count(), 0);
      assert.ok((await guests.innerText()).includes("2 người lớn, 1 trẻ em"));

      await page.getByRole("button", { name: TEXT.search.submit }).click();
      await page.waitForURL((url) => url.pathname === "/rooms");
      assert.equal(new URL(page.url()).searchParams.get("guests"), "3");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("shows the headline, amenities, location and reviews once they exist", async () => {
    await fillHomeContent();
    try {
      for (const [name, viewport] of [["desktop-1440", DESKTOP], ["mobile-390", PHONE]]) {
        for (const colorScheme of ["light", "dark"]) {
          const { context, page, problems } = await openPage({ viewport, colorScheme });
          try {
            await openHome(page);
            assert.equal(await page.locator(".home-hero h1").innerText(), "Tiêu đề do quản trị viên đặt");
            assert.equal(await page.getByTestId("amenities").locator("li").count(), 4);
            assert.equal(await page.getByTestId("location").locator("li").count(), 2);

            // Three reviews now (5, 4, 4): the score and the quotes follow.
            assert.match(await page.getByTestId("hero-rating").innerText(), /4,3 \/ 5/);
            const voices = page.getByTestId("guest-voices");
            const first = await voices.locator("blockquote").innerText();
            await voices.getByRole("button", { name: TEXT.home.voices.next }).click();
            assert.notEqual(await voices.locator("blockquote").innerText(), first);

            assert.deepEqual(await sidewaysOverflow(page), [], `${name}: the page scrolls sideways`);

            await screenshot(page, `${name}-${colorScheme}-with-content`);
            assert.deepEqual(problems, []);
          } finally {
            await context.close();
          }
        }
      }
    } finally {
      await stack.pool.query("DELETE FROM property_settings");
    }
  });
});
