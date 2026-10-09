// "My bookings" in a real browser, against the built web app and the real
// API: every state a booking can be in, for an account that signs in with a
// password and one that signs in with Google, plus an account that has no
// booking yet (the screen a new Google account lands on).
//
// Screenshots are written to test-results/my-bookings/.
//
// Run with `npm run test:e2e` from the repository root.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { startStack } from "./stack.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = path.resolve(HERE, "../../../test-results/my-bookings");
const TEXT = JSON.parse(fs.readFileSync(path.join(HERE, "../src/locales/vi/myBookings.json"), "utf8"));
const SITE = JSON.parse(fs.readFileSync(path.join(HERE, "../src/locales/vi/site.json"), "utf8"));
const PAGE_SIZE = 5;

// One booking per state a guest can see. `start` is days from today.
// "Pay at the counter" has no state of its own: it is a confirmed booking
// that is still unpaid, and once the front desk records the money it is paid
// without an online payment.
const STATES = [
  { key: "pending-unpaid", status: "pending", payment: "unpaid", start: 20, pay: true, cancel: true },
  { key: "pending-payment-failed", status: "pending", payment: "failed", start: 23, pay: true, cancel: true },
  { key: "confirmed-paid-online", status: "confirmed", payment: "paid", online: true, start: 26, cancel: true },
  { key: "confirmed-pay-at-counter", status: "confirmed", payment: "unpaid", start: 29, pay: true, cancel: true },
  { key: "confirmed-paid-at-counter", status: "confirmed", payment: "paid", start: 32, cancel: true },
  { key: "completed-paid", status: "completed", payment: "paid", online: true, start: -30, review: "open" },
  { key: "completed-reviewed", status: "completed", payment: "paid", start: -40, review: "done" },
  { key: "cancelled-unpaid", status: "cancelled", payment: "unpaid", start: 35 },
  { key: "cancelled-refund-pending", status: "cancelled", payment: "refund_pending", online: true, start: 38 },
  { key: "cancelled-refunded", status: "cancelled", payment: "refunded", online: true, start: 41 },
];

let stack;

// Gives the account one booking in every state, each in a room of its own,
// and returns them newest first, the order the page lists them in.
async function addBookings(email, firstRoom) {
  const { pool } = stack;
  const userId = (await pool.query("SELECT id FROM users WHERE email = $1", [email])).rows[0].id;
  const rooms = (await pool.query("SELECT id FROM rooms ORDER BY id OFFSET $1 LIMIT $2", [firstRoom, STATES.length])).rows;
  const created = [];

  for (const [index, state] of STATES.entries()) {
    const booking = (
      await pool.query(
        `INSERT INTO bookings
           (user_id, room_id, check_in, check_out, total_price, guests, status, payment_status,
            expires_at, cancelled_at, refund_reason, refunded_at)
         SELECT $1, r.id, CURRENT_DATE + $3::int, CURRENT_DATE + $3::int + 2, r.price * 2, 2, $4::text, $5::text,
                CASE WHEN $4::text = 'pending' THEN NOW() + INTERVAL '1 hour' END,
                CASE WHEN $4::text = 'cancelled' THEN NOW() END,
                CASE WHEN $5::text IN ('refund_pending', 'refunded') THEN 'Khách hủy trước hạn' END,
                CASE WHEN $5::text = 'refunded' THEN NOW() END
         FROM rooms r WHERE r.id = $2
         RETURNING id, room_id, total_price`,
        [userId, rooms[index].id, state.start, state.status, state.payment]
      )
    ).rows[0];

    if (state.online) {
      await pool.query(
        "INSERT INTO payments (booking_id, provider, transaction_ref, amount, status) VALUES ($1, 'vnpay', $2, $3, 'success')",
        [booking.id, `E2E-${booking.id}`, booking.total_price]
      );
    }
    if (state.review === "done") {
      await pool.query(
        "INSERT INTO room_reviews (room_id, user_id, booking_id, rating, comment) VALUES ($1, $2, $3, 4, 'Ổn')",
        [booking.room_id, userId, booking.id]
      );
    }
    created.push({ ...state, code: `#${String(booking.id).padStart(4, "0")}` });
  }
  return created.reverse();
}

// A page that records everything that goes wrong in it: an uncaught error
// (what "Icon is not defined" was) or an error React logs.
async function openPage() {
  const context = await stack.browser.newContext({ locale: "vi-VN", viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    // A room without a photo, or the websocket this test server does not
    // carry, are requests that fail, not errors in the page.
    if (message.type() === "error" && !/Failed to load resource|WebSocket/i.test(text)) {
      problems.push(`console: ${text}`);
    }
  });
  return { context, page, problems };
}

async function signInWithPassword(page, email, password) {
  await page.goto(`${stack.baseUrl}/login`);
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

// The popup is Google's; what follows it is ours: the page posts the token
// to /api/google-login, gets the session cookie and remembers the user.
async function signInWithGoogle(page, account) {
  await page.goto(`${stack.baseUrl}/login`);
  const result = await page.evaluate(async (idToken) => {
    const response = await fetch("/api/google-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const body = await response.json();
    if (response.ok) localStorage.setItem("user", JSON.stringify(body.user));
    return { status: response.status, body };
  }, JSON.stringify(account));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body;
}

async function openMyBookings(page) {
  await page.goto(`${stack.baseUrl}/my-bookings`);
  await page.getByRole("heading", { name: TEXT.header.title }).waitFor();
  await page.locator(".luxe-skeleton-light").first().waitFor({ state: "detached" });
}

async function screenshot(page, name) {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true });
}

// innerText is what the guest sees, CSS capitalisation included, so labels
// are compared without regard to case.
function shows(text, label) {
  return text.toLowerCase().includes(label.toLowerCase());
}

function button(card, label) {
  return card.getByRole("button", { name: label, exact: true });
}

// Checks one card against the state it was created in, then opens its details.
async function checkCard(page, booking) {
  const card = page.locator(".my-booking-card").filter({ hasText: booking.code });
  await card.waitFor();
  const text = await card.innerText();
  const where = `${booking.key} ${booking.code}`;

  assert.ok(shows(text, TEXT.status[booking.status]), `${where}: status label`);
  assert.equal(
    shows(text, TEXT.paymentStatus[booking.payment]),
    booking.payment !== "unpaid",
    `${where}: payment label is shown unless nothing was paid`
  );
  assert.equal(await button(card, TEXT.card.pay).count(), booking.pay ? 1 : 0, `${where}: pay button`);
  assert.equal(await button(card, TEXT.card.cancelBooking).count(), booking.cancel ? 1 : 0, `${where}: cancel button`);
  assert.equal(
    await button(card, TEXT.card.reviewThisRoom).count(),
    booking.review === "open" ? 1 : 0,
    `${where}: review button`
  );
  assert.equal(shows(text, TEXT.card.reviewed), booking.review === "done", `${where}: reviewed note`);
  assert.equal(await button(card, TEXT.card.downloadReceipt).count(), 1, `${where}: PDF button`);

  await button(card, TEXT.card.details).click();
  const details = page.locator(".booking-detail-panel");
  await details.waitFor();
  assert.ok(shows(await details.innerText(), TEXT.status[booking.status]), `${where}: details show the status`);
  if (booking.detailShot) await screenshot(page, booking.detailShot);
  await details.getByRole("button", { name: "×" }).click();
  await details.waitFor({ state: "detached" });
}

// Walks both pages of the list, the status filters and the dialogs.
async function checkEveryState(page, bookings, shotPrefix) {
  await openMyBookings(page);

  for (let pageNumber = 1; pageNumber <= bookings.length / PAGE_SIZE; pageNumber++) {
    const expected = bookings.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);
    await page.locator(".my-booking-card").filter({ hasText: expected[0].code }).waitFor();
    assert.equal(await page.locator(".my-booking-card").count(), expected.length);
    await screenshot(page, `${shotPrefix}-page-${pageNumber}`);

    for (const booking of expected) await checkCard(page, booking);

    if (pageNumber * PAGE_SIZE < bookings.length) {
      await page.getByRole("button", { name: SITE.list.next }).click();
    }
  }

  for (const status of ["pending", "confirmed", "completed", "cancelled"]) {
    const expected = bookings.filter((booking) => booking.status === status);
    await page.getByTestId(`tab-${status}`).click();
    await page.locator(".my-booking-card").filter({ hasText: expected[0].code }).waitFor();
    // The tab carries how many there are.
    assert.ok((await page.getByTestId(`tab-${status}`).innerText()).includes(String(expected.length)), `${status} tab count`);
    assert.equal(await page.locator(".my-booking-card").count(), expected.length, `${status} filter`);
    await screenshot(page, `${shotPrefix}-filter-${status}`);
  }

  // The dialogs behind the buttons, on the bookings that have them.
  await page.getByTestId("tab-pending").click();
  const pending = page.locator(".my-booking-card").filter({ hasText: bookings.find((b) => b.key === "pending-unpaid").code });
  await button(pending, TEXT.card.pay).click();
  await page.getByText(TEXT.paymentModal.title).waitFor();
  await screenshot(page, `${shotPrefix}-payment-dialog`);
  await page.getByRole("button", { name: TEXT.paymentModal.cancel, exact: true }).click();

  await button(pending, TEXT.card.cancelBooking).click();
  await page.getByTestId("cancel-dialog").waitFor();
  await screenshot(page, `${shotPrefix}-cancel-dialog`);
  await page.getByRole("button", { name: TEXT.cancelModal.keep, exact: true }).click();

  await page.getByTestId("tab-completed").click();
  const completed = page.locator(".my-booking-card").filter({ hasText: bookings.find((b) => b.key === "completed-paid").code });
  await button(completed, TEXT.card.reviewThisRoom).click();
  await page.getByText(TEXT.reviewModal.starsLabel).waitFor();
  await screenshot(page, `${shotPrefix}-review-dialog`);
  await page.getByRole("button", { name: TEXT.reviewModal.cancel, exact: true }).click();
}

describe("My bookings in the browser", () => {
  before(async () => {
    stack = await startStack();
  });

  after(async () => {
    await stack?.stop();
  });

  it("shows a booking in every state to an account that signs in with a password", async () => {
    const { context, page, problems } = await openPage();
    try {
      const registered = await fetch(`${stack.baseUrl}/api/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Khách Mật Khẩu", email: "password-guest@example.com", password: "Guest-Passw0rd" }),
      });
      assert.equal(registered.status, 201);
      const bookings = await addBookings("password-guest@example.com", 10);
      bookings.find((b) => b.key === "confirmed-pay-at-counter").detailShot = "password-details-pay-at-counter";
      bookings.find((b) => b.key === "cancelled-refund-pending").detailShot = "password-details-refund-pending";

      await signInWithPassword(page, "password-guest@example.com", "Guest-Passw0rd");
      await checkEveryState(page, bookings, "password");

      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("shows a booking in every state to an account that signs in with Google", async () => {
    const { context, page, problems } = await openPage();
    try {
      const google = { uid: "google-uid-with-bookings", email: "google-guest@example.com", name: "Khách Google" };
      // The first sign-in creates the account; the bookings come after it.
      await signInWithGoogle(page, google);
      const bookings = await addBookings(google.email, 25);
      bookings.find((b) => b.key === "completed-reviewed").detailShot = "google-details-completed";

      const again = await signInWithGoogle(page, google);
      assert.equal(again.linked, false, "the second sign-in finds the same Google account");
      await checkEveryState(page, bookings, "google");

      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("shows the empty list to a new Google account, and when a filter matches nothing", async () => {
    const { context, page, problems } = await openPage();
    try {
      await signInWithGoogle(page, { uid: "google-uid-new", email: "new-google-guest@example.com", name: "Khách Mới" });

      await openMyBookings(page);
      await page.getByText(TEXT.empty.none).waitFor();
      assert.equal(await page.locator(".my-booking-card").count(), 0);
      await page.getByRole("link", { name: TEXT.empty.exploreRooms }).waitFor();
      await screenshot(page, "google-new-account-empty");

      await page.getByTestId("tab-cancelled").click();
      await page.getByText(TEXT.empty.filtered).waitFor();
      await screenshot(page, "google-new-account-empty-filter");

      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });
});
