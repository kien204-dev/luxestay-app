// The whole booking flow in a real browser, against the built web app and
// the real API: room page → checkout (dates, coupon, policy, payment method,
// confirm) → payment gateway → result page → My bookings → cancel → refund.
//
// The gateway itself is the one thing stood in for: the browser's trip to
// VNPay's sandbox is intercepted, and VNPay's signed server-to-server notice
// (IPN) is sent to the API by the test, signed with the test's own secret.
// Everything the API does with it is the real code.
//
// Screenshots are written to test-results/checkout/.
//
// Run with `npm run test:e2e` from the repository root.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { startStack } from "./stack.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = path.resolve(HERE, "../../../test-results/checkout");
const locale = (name) => JSON.parse(fs.readFileSync(path.join(HERE, `../src/locales/vi/${name}.json`), "utf8"));
const TEXT = locale("checkout");
const BOOKINGS = locale("myBookings");
const COMMON = locale("common");
const SITE = locale("site");

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const GATEWAY = "https://sandbox.vnpayment.vn/**";
const GUEST = { name: "Khách Đặt Phòng", email: "checkout-guest@example.com", password: "Guest-Passw0rd" };
const ADMIN = { email: "admin@example.com", password: "Admin-E2E-12345" };

let stack;
let nextRoom = 30;
let nextDay = 40;

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
// A room and three nights nobody else in this file uses.
async function freshStay() {
  const room = (await stack.pool.query("SELECT id, room_name, price FROM rooms WHERE status != 'maintenance' ORDER BY id OFFSET $1 LIMIT 1", [nextRoom++])).rows[0];
  nextDay += 10;
  return { room, checkIn: day(nextDay), checkOut: day(nextDay + 3), price: Number(room.price) };
}

const money = (amount) => `${Number(amount).toLocaleString("vi-VN")} đ`;

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
  // The gateway's own page: never really opened.
  await page.route(GATEWAY, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>gateway</title>" }));
  return { context, page, problems };
}

async function signIn(page, { email, password }) {
  await page.goto(`${stack.baseUrl}/login`);
  await page.fill("#login-email", email);
  await page.fill("#login-password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function screenshot(page, name, { full = true } = {}) {
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
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`)
      .slice(0, 6);
  });
}

const step = (page, name) => page.locator(`[data-testid="checkout-page"][data-step="${name}"]`);
const total = (page) => page.locator(".checkout-summary [data-testid='checkout-total']");
const continueButton = (page) => page.locator(".checkout-step-foot .g-btn--primary");

// VNPay's notice for one payment attempt, signed the way VNPay signs it.
async function sendIpn(transactionRef, amount, overrides = {}) {
  const params = {
    vnp_Amount: String(Math.round(Number(amount) * 100)),
    vnp_BankCode: "NCB",
    vnp_OrderInfo: "Thanh toan dat phong",
    vnp_PayDate: "20300101101010",
    vnp_ResponseCode: "00",
    vnp_TmnCode: process.env.VNPAY_TMN_CODE,
    vnp_TransactionNo: "14123456",
    vnp_TransactionStatus: "00",
    vnp_TxnRef: transactionRef,
    ...overrides,
  };
  const sorted = Object.fromEntries(Object.keys(params).sort().map((key) => [key, params[key]]));
  const hash = crypto.createHmac("sha512", process.env.VNPAY_HASH_SECRET).update(new URLSearchParams(sorted).toString(), "utf-8").digest("hex");
  const response = await fetch(`${stack.baseUrl}/api/payments/vnpay/ipn?${new URLSearchParams({ ...sorted, vnp_SecureHash: hash })}`);
  const body = await response.json();
  assert.equal(body.RspCode, "00", JSON.stringify(body));
}

// Presses the last button and returns what the browser was sent to the
// gateway with.
async function payAtGateway(page, press) {
  const gateway = page.waitForURL((url) => url.hostname === "sandbox.vnpayment.vn");
  await press();
  await gateway;
  const query = new URL(page.url()).searchParams;
  return { transactionRef: query.get("vnp_TxnRef"), amount: Number(query.get("vnp_Amount")) / 100 };
}

// Room page → checkout, with the dates typed into the room page's form.
async function startCheckout(page, stay) {
  await page.goto(`${stack.baseUrl}/rooms/${stay.room.id}`);
  await page.locator("#booking-panel").waitFor();
  await page.fill("#booking-check-in", stay.checkIn);
  await page.fill("#booking-check-out", stay.checkOut);
  await page.getByTestId("book-room").click();
  await step(page, "dates").waitFor();
}

// From the dates step to the confirm step, with an optional coupon.
async function goToConfirm(page, { coupon } = {}) {
  await continueButton(page).click();
  await step(page, "coupon").waitFor();
  if (coupon) {
    await page.fill("#checkout-coupon", coupon);
    await page.getByRole("button", { name: TEXT.coupon.apply, exact: true }).click();
    await page.getByTestId("coupon-applied").waitFor();
  }
  await continueButton(page).click();
  await step(page, "policy").waitFor();
  await page.getByTestId("policy-agree").check();
  await continueButton(page).click();
  await step(page, "payment").waitFor();
  await continueButton(page).click();
  await step(page, "confirm").waitFor();
}

describe("Booking a room in the browser", () => {
  before(async () => {
    Object.assign(process.env, {
      SEED_ADMIN_PASSWORD: ADMIN.password,
      VNPAY_TMN_CODE: "E2ETMN01",
      VNPAY_HASH_SECRET: crypto.randomBytes(32).toString("hex"),
      MOMO_ENABLED: "false",
      PENDING_BOOKING_TTL_MINUTES: "30",
      FREE_CANCELLATION_DAYS: "3",
    });
    delete process.env.VNPAY_PAY_URL;
    delete process.env.VNPAY_RETURN_URL;
    stack = await startStack();

    const registered = await fetch(`${stack.baseUrl}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(GUEST),
    });
    assert.equal(registered.status, 201);

    await stack.pool.query(
      `INSERT INTO coupons (code, discount_type, discount_value, max_discount_amount, expires_at) VALUES
         ('E2E10', 'percent', 10, NULL, NOW() + INTERVAL '30 days'),
         ('E2EOLD', 'percent', 10, NULL, NOW() - INTERVAL '1 day'),
         ('E2EFREE', 'percent', 100, NULL, NOW() + INTERVAL '30 days')`
    );
  });

  after(async () => {
    await stack?.stop();
  });

  it("goes from the room page to a paid, then cancelled and refunded booking", async () => {
    const { context, page, problems } = await openPage();
    try {
      const stay = await freshStay();
      const subtotal = stay.price * 3;
      await signIn(page, GUEST);
      await startCheckout(page, stay);

      // --- Step 1: dates. Nothing is reserved yet.
      assert.equal(await total(page).innerText(), money(subtotal));
      assert.equal((await stack.pool.query("SELECT 1 FROM bookings WHERE room_id = $1", [stay.room.id])).rows.length, 0);
      await screenshot(page, "checkout-dates-desktop-1440-light");
      await continueButton(page).click();

      // --- Step 2: coupon. An expired code is refused with the API's reason,
      // a good one takes 10% off.
      await step(page, "coupon").waitFor();
      await page.fill("#checkout-coupon", "e2eold");
      await page.getByRole("button", { name: TEXT.coupon.apply, exact: true }).click();
      const message = page.getByTestId("coupon-message");
      await page.locator("[data-testid='coupon-message'][role='alert']").waitFor();
      assert.notEqual((await message.innerText()).trim(), TEXT.coupon.hint);
      assert.equal(await total(page).innerText(), money(subtotal));
      await screenshot(page, "checkout-coupon-invalid-desktop-1440-light");

      await page.fill("#checkout-coupon", "E2E10");
      await page.getByRole("button", { name: TEXT.coupon.apply, exact: true }).click();
      await page.getByTestId("coupon-applied").waitFor();
      assert.equal(await total(page).innerText(), money(subtotal * 0.9));
      await screenshot(page, "checkout-coupon-applied-desktop-1440-light");
      await continueButton(page).click();

      // --- Step 3: the policy has to be agreed to.
      await step(page, "policy").waitFor();
      assert.ok(await continueButton(page).isDisabled());
      // Free until three days before check-in, with the amount that comes back.
      assert.ok((await page.getByTestId("policy-deadline").innerText()).includes(money(subtotal * 0.9)));
      await page.getByTestId("policy-agree").check();
      await screenshot(page, "checkout-policy-desktop-1440-light");
      await continueButton(page).click();

      // --- Step 4: only the gateways that are switched on (MoMo is off).
      await step(page, "payment").waitFor();
      assert.equal(await page.locator(".pay-method").count(), 1);
      assert.ok(!(await page.locator(".pay-methods").innerText()).includes("MoMo"));
      assert.ok(await page.locator(".pay-method input").isChecked());
      await screenshot(page, "checkout-payment-desktop-1440-light");

      // Reloading keeps the step, the coupon and the agreement.
      await page.reload();
      await step(page, "payment").waitFor();
      assert.equal(await total(page).innerText(), money(subtotal * 0.9));
      // Going back a step loses nothing either.
      await page.goBack();
      await step(page, "policy").waitFor();
      assert.ok(await page.getByTestId("policy-agree").isChecked());
      await page.goForward();
      await step(page, "payment").waitFor();
      await continueButton(page).click();

      // --- Step 5: confirm. The button says what will be charged and how.
      await step(page, "confirm").waitFor();
      const submit = page.getByTestId("checkout-submit");
      assert.equal(await submit.innerText(), TEXT.confirm.pay.replace("{{amount}}", money(subtotal * 0.9)).replace("{{method}}", "VNPay"));
      await screenshot(page, "checkout-confirm-desktop-1440-light");

      const first = await payAtGateway(page, () => submit.click());
      assert.equal(first.amount, subtotal * 0.9);
      // Now the room is held, with the coupon's slot taken.
      let booking = (await stack.pool.query("SELECT * FROM bookings WHERE room_id = $1", [stay.room.id])).rows[0];
      assert.equal(booking.status, "pending");
      assert.equal(Number(booking.total_price), subtotal * 0.9);
      assert.ok(booking.expires_at);
      assert.equal((await stack.pool.query("SELECT used_count FROM coupons WHERE code = 'E2E10'")).rows[0].used_count, 1);

      // --- The guest gives up at the gateway: the result page says why and
      // offers to try again while the room is still held.
      await sendIpn(first.transactionRef, first.amount, { vnp_ResponseCode: "24", vnp_TransactionStatus: "02" });
      await page.goto(`${stack.baseUrl}/payment/result?vnp_TxnRef=${first.transactionRef}&vnp_ResponseCode=24`);
      const failed = page.getByTestId("payment-result-failed");
      await failed.waitFor();
      assert.ok((await page.getByTestId("result-reason").innerText()).includes(TEXT.result.reasons.vnpay["24"]));
      assert.match(await failed.innerText(), /\d{2}:\d{2}/, "the time the room is held until");
      await screenshot(page, "result-failed-desktop-1440-light");

      // Coming back to the checkout finds the same held booking, not a new one.
      await page.goto(`${stack.baseUrl}/rooms/${stay.room.id}/book`);
      await page.getByTestId("checkout-hold").waitFor();
      assert.equal(await total(page).innerText(), money(subtotal * 0.9));
      await screenshot(page, "checkout-held-booking-desktop-1440-light");

      // --- Try again: this time the gateway has not answered yet.
      await page.goto(`${stack.baseUrl}/payment/result?vnp_TxnRef=${first.transactionRef}`);
      const second = await payAtGateway(page, () => page.getByTestId("retry-vnpay").click());
      assert.notEqual(second.transactionRef, first.transactionRef);
      assert.equal((await stack.pool.query("SELECT COUNT(*)::int AS n FROM bookings WHERE room_id = $1", [stay.room.id])).rows[0].n, 1);

      await page.goto(`${stack.baseUrl}/payment/result?vnp_TxnRef=${second.transactionRef}&vnp_ResponseCode=00`);
      const checking = page.getByTestId("payment-result-checking");
      await checking.waitFor();
      // The redirect alone confirms nothing.
      assert.equal(await checking.locator(".result-steps .is-done").count(), 2);
      assert.equal(await page.getByTestId("payment-result-success").count(), 0);
      await screenshot(page, "result-pending-desktop-1440-light");

      // --- VNPay's signed notice arrives: the page moves on by itself.
      await sendIpn(second.transactionRef, second.amount);
      const success = page.getByTestId("payment-result-success");
      await success.waitFor({ timeout: 15000 });
      const code = `#BK-${String(booking.id).padStart(4, "0")}`;
      assert.equal(await page.getByTestId("result-code").innerText(), code);
      const card = await page.getByTestId("result-booking").innerText();
      assert.ok(card.includes(stay.room.room_name) && card.includes(money(subtotal * 0.9)) && card.includes("E2E10"));
      await screenshot(page, "result-success-desktop-1440-light");
      booking = (await stack.pool.query("SELECT * FROM bookings WHERE id = $1", [booking.id])).rows[0];
      assert.equal(booking.status, "confirmed");
      assert.equal(booking.payment_status, "paid");

      // The PDF really downloads.
      const download = page.waitForEvent("download");
      await success.getByRole("button", { name: BOOKINGS.card.downloadReceipt }).click();
      assert.match((await download).suggestedFilename(), /\.pdf$/);

      // --- My bookings: paid and confirmed, free to cancel.
      await success.getByRole("link", { name: SITE.payment.result.toMyBookings }).click();
      const mine = page.getByTestId(`booking-${booking.id}`);
      await mine.waitFor();
      assert.ok((await mine.innerText()).includes(BOOKINGS.card.note.freeUntil.split("{{")[0]));
      await mine.getByRole("button", { name: BOOKINGS.card.cancelBooking, exact: true }).click();
      const dialog = page.getByTestId("cancel-dialog");
      await dialog.waitFor();
      // Focus starts on "keep", and the refund is the full amount paid.
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), BOOKINGS.cancelModal.keep);
      assert.ok((await page.getByTestId("refund-amount").innerText()).includes(money(subtotal * 0.9)));
      await screenshot(page, "bookings-cancel-dialog-desktop-1440-light", { full: false });

      // --- The API fails once: the error toast shows on top of the open
      // dialog and can be used.
      const cancelRequest = `**/api/bookings/${booking.id}/cancel`;
      await page.route(cancelRequest, (route) => route.fulfill({ status: 500, json: { code: "SERVER_ERROR" } }));
      await page.getByTestId("confirm-cancel").click();
      const toast = page.getByTestId("toast-error");
      await toast.waitFor();
      await dialog.waitFor();
      const onTop = await toast.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return { inside: element.contains(hit), inDialog: Boolean(element.closest("dialog[open]")) };
      });
      assert.deepEqual(onTop, { inside: true, inDialog: true }, "the toast is covered by the dialog");
      await screenshot(page, "toast-over-dialog-desktop-1440-light", { full: false });
      await toast.getByRole("button", { name: COMMON.dialog.dismiss }).click();
      await toast.waitFor({ state: "detached" });
      await page.unroute(cancelRequest);

      // --- Cancelled for real: a refund is owed and the coupon's slot is back.
      await page.getByTestId("confirm-cancel").click();
      await dialog.waitFor({ state: "detached" });
      // With no dialog open the toast is back in the page.
      assert.ok(await page.getByTestId("toast-success").evaluate((element) => !element.closest("dialog")));
      booking = (await stack.pool.query("SELECT * FROM bookings WHERE id = $1", [booking.id])).rows[0];
      assert.equal(booking.status, "cancelled");
      assert.equal(booking.payment_status, "refund_pending");
      assert.equal((await stack.pool.query("SELECT used_count FROM coupons WHERE code = 'E2E10'")).rows[0].used_count, 0);

      await page.getByTestId("tab-refund_pending").click();
      await mine.waitFor();
      assert.ok((await mine.innerText()).includes(BOOKINGS.card.note.refundPending));
      assert.equal(await mine.locator(".refund-progress i.is-on").count(), 2);
      await screenshot(page, "bookings-refund-pending-desktop-1440-light");

      // --- The property sends the money back and records it.
      const admin = await fetch(`${stack.baseUrl}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ADMIN) });
      const refunded = await fetch(`${stack.baseUrl}/api/bookings/${booking.id}/refund`, { method: "PATCH", headers: { Cookie: admin.headers.get("set-cookie").split(";", 1)[0] } });
      assert.equal(refunded.status, 200);
      await page.getByTestId("tab-cancelled").click();
      await mine.waitFor();
      assert.equal(await mine.locator(".refund-progress i.is-on").count(), 3);
      assert.ok((await mine.innerText()).includes(BOOKINGS.paymentStatus.refunded));

      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("says so when the room was booked by someone else in the meantime, and keeps what was entered", async () => {
    const { context, page, problems } = await openPage();
    try {
      const stay = await freshStay();
      await signIn(page, GUEST);
      await startCheckout(page, stay);
      await goToConfirm(page, { coupon: "E2E10" });

      // Another guest's confirmed booking lands on the same nights.
      await stack.pool.query(
        `INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, payment_status)
         SELECT id, $1, $2::date, $3::date, 100, 1, 'confirmed', 'paid' FROM users WHERE email = 'user@example.com'`,
        [stay.room.id, stay.checkIn, stay.checkOut]
      );
      await page.getByTestId("checkout-submit").click();
      const alert = page.getByTestId("checkout-sold-out");
      await alert.waitFor();
      assert.ok((await alert.innerText()).includes(stay.room.room_name));
      await screenshot(page, "checkout-sold-out-desktop-1440-light");

      // No booking of ours, and the coupon's slot was not taken.
      const ours = await stack.pool.query("SELECT 1 FROM bookings b JOIN users u ON u.id = b.user_id WHERE b.room_id = $1 AND u.email = $2", [stay.room.id, GUEST.email]);
      assert.equal(ours.rows.length, 0);
      assert.equal((await stack.pool.query("SELECT used_count FROM coupons WHERE code = 'E2E10'")).rows[0].used_count, 0);

      // "Other dates" goes back to step 1 with the coupon still applied.
      await alert.getByRole("button", { name: TEXT.soldOut.otherDates }).click();
      await step(page, "dates").waitFor();
      await page.getByRole("alert").getByText(SITE.booking.errors.datesTaken).waitFor();
      assert.ok(await continueButton(page).isDisabled());
      await page.fill("#checkout-check-in", day(nextDay + 20));
      await page.fill("#checkout-check-out", day(nextDay + 22));
      await continueButton(page).click();
      await page.getByTestId("coupon-applied").waitFor();
      assert.equal(await total(page).innerText(), money(stay.price * 2 * 0.9));
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("confirms a fully discounted booking without sending the guest to a gateway", async () => {
    const { context, page, problems } = await openPage();
    try {
      const stay = await freshStay();
      await signIn(page, GUEST);
      await startCheckout(page, stay);
      await continueButton(page).click();
      await page.fill("#checkout-coupon", "E2EFREE");
      await page.getByRole("button", { name: TEXT.coupon.apply, exact: true }).click();
      await page.getByTestId("coupon-applied").waitFor();
      assert.equal(await total(page).innerText(), money(0));
      await continueButton(page).click();
      await page.getByTestId("policy-agree").check();
      await continueButton(page).click();
      await page.getByTestId("nothing-to-pay").waitFor();
      assert.equal(await page.locator(".pay-method").count(), 0);
      await continueButton(page).click();

      const submit = page.getByTestId("checkout-submit");
      assert.equal(await submit.innerText(), TEXT.confirm.confirmFree);
      await submit.click();
      await page.waitForURL((url) => url.pathname === "/payment/result" && url.searchParams.has("booking"));
      await page.getByTestId("payment-result-success").getByText(TEXT.result.success.eyebrowFree).waitFor();
      const booking = (await stack.pool.query("SELECT status, payment_status, total_price FROM bookings WHERE room_id = $1", [stay.room.id])).rows[0];
      assert.equal(booking.status, "confirmed");
      assert.equal(Number(booking.total_price), 0);
      assert.equal((await stack.pool.query("SELECT COUNT(*)::int AS n FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.room_id = $1", [stay.room.id])).rows[0].n, 0);
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("walks the steps on a phone with a full-screen calendar, and in the dark theme", async () => {
    for (const [name, viewport, colorScheme] of [["mobile-390-light", PHONE, "light"], ["mobile-390-dark", PHONE, "dark"], ["desktop-1440-dark", DESKTOP, "dark"]]) {
      const { context, page, problems } = await openPage({ viewport, colorScheme });
      const mobile = name.startsWith("mobile");
      try {
        const stay = await freshStay();
        await signIn(page, GUEST);
        // Straight into the checkout with no dates: step 1 asks for them.
        await page.goto(`${stack.baseUrl}/rooms/${stay.room.id}/book`);
        await step(page, "dates").waitFor();
        assert.ok(await continueButton(page).isDisabled());

        if (mobile) {
          await page.getByTestId("open-calendar").click();
          const calendar = page.getByTestId("mobile-calendar");
          await calendar.waitFor();
          const box = await calendar.boundingBox();
          assert.deepEqual([Math.round(box.width), Math.round(box.height)], [PHONE.width, PHONE.height], "the calendar fills the screen");
          assert.ok(await page.getByTestId("apply-dates").isDisabled());
          // Next month, so every day can still be chosen.
          await calendar.getByRole("button", { name: SITE.calendar.next }).click();
          const days = calendar.locator(".calendar-day:not(:disabled)");
          await days.nth(9).click();
          await days.nth(12).click();
          await screenshot(page, `checkout-calendar-${name}`, { full: false });
          await page.getByTestId("apply-dates").click();
          await calendar.waitFor({ state: "detached" });
          // The summary is one line that opens.
          assert.ok(!(await page.locator(".checkout-summary").isVisible()));
          assert.ok((await page.locator(".checkout-summary-mobile summary").innerText()).includes(money(stay.price * 3)));
        } else {
          await page.fill("#checkout-check-in", stay.checkIn);
          await page.fill("#checkout-check-out", stay.checkOut);
        }
        assert.deepEqual(await sidewaysOverflow(page), [], `${name}: dates`);
        await screenshot(page, `checkout-dates-${name}`);
        await continueButton(page).click();

        // "Updating the price" while the coupon is being checked.
        await step(page, "coupon").waitFor();
        let release;
        await page.route("**/api/coupons/validate", (route) => new Promise((resolve) => { release = resolve; }).then(() => route.continue()));
        await page.fill("#checkout-coupon", "E2E10");
        await page.getByRole("button", { name: TEXT.coupon.apply, exact: true }).click();
        if (mobile) await page.locator(".checkout-summary-mobile summary").click();
        await page.locator("[data-testid='summary-updating']:visible").waitFor();
        assert.equal((await page.getByTestId("coupon-message").innerText()).trim(), TEXT.coupon.checking);
        await screenshot(page, `checkout-updating-price-${name}`);
        release();
        await page.getByTestId("coupon-applied").waitFor();
        await page.unroute("**/api/coupons/validate");
        await screenshot(page, `checkout-coupon-applied-${name}`);
        await continueButton(page).click();

        await step(page, "policy").waitFor();
        await page.getByTestId("policy-agree").check();
        assert.deepEqual(await sidewaysOverflow(page), [], `${name}: policy`);
        await screenshot(page, `checkout-policy-${name}`);
        await continueButton(page).click();

        await step(page, "payment").waitFor();
        await screenshot(page, `checkout-payment-${name}`);
        await continueButton(page).click();

        await step(page, "confirm").waitFor();
        assert.deepEqual(await sidewaysOverflow(page), [], `${name}: confirm`);
        await screenshot(page, `checkout-confirm-${name}`);
        assert.deepEqual(problems, [], name);
      } finally {
        await context.close();
      }
    }
  });

  it("shows the result page and My bookings on a phone, with their loading, empty and error states", async () => {
    const { context, page, problems } = await openPage({ viewport: PHONE });
    try {
      const stay = await freshStay();
      await signIn(page, GUEST);
      await page.goto(`${stack.baseUrl}/rooms/${stay.room.id}/book?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}`);
      await step(page, "dates").waitFor();
      await goToConfirm(page);
      const payment = await payAtGateway(page, () => page.getByTestId("checkout-submit").click());

      await page.goto(`${stack.baseUrl}/payment/result?vnp_TxnRef=${payment.transactionRef}`);
      await page.getByTestId("payment-result-checking").waitFor();
      await screenshot(page, "result-pending-mobile-390-light");
      await sendIpn(payment.transactionRef, payment.amount, { vnp_ResponseCode: "51", vnp_TransactionStatus: "02" });
      await page.getByTestId("payment-result-failed").waitFor({ timeout: 15000 });
      assert.ok((await page.getByTestId("result-reason").innerText()).includes(TEXT.result.reasons.vnpay["51"]));
      assert.deepEqual(await sidewaysOverflow(page), []);
      await screenshot(page, "result-failed-mobile-390-light");

      const retry = await payAtGateway(page, () => page.getByTestId("retry-vnpay").click());
      await sendIpn(retry.transactionRef, retry.amount);
      await page.goto(`${stack.baseUrl}/payment/result?vnp_TxnRef=${retry.transactionRef}`);
      await page.getByTestId("payment-result-success").waitFor({ timeout: 15000 });
      assert.deepEqual(await sidewaysOverflow(page), []);
      await screenshot(page, "result-success-mobile-390-light");

      // A reference nobody knows.
      await page.goto(`${stack.baseUrl}/payment/result?vnp_TxnRef=NOSUCHREF`);
      await page.getByTestId("payment-result-unknown").waitFor();

      // --- My bookings: loading, then the list.
      const listRequest = /\/api\/bookings\?/;
      let release;
      await page.route(listRequest, (route) => new Promise((resolve) => { release = resolve; }).then(() => route.continue()));
      await page.goto(`${stack.baseUrl}/my-bookings`);
      await page.getByTestId("bookings-loading").waitFor();
      await screenshot(page, "bookings-loading-mobile-390-light");
      release();
      await page.locator("[data-testid='my-bookings'][data-state='ready']").waitFor();
      await page.unroute(listRequest);
      assert.deepEqual(await sidewaysOverflow(page), []);
      await screenshot(page, "bookings-mobile-390-light");

      // Empty tab.
      await page.getByTestId("tab-refund_pending").click();
      await page.getByTestId("bookings-empty").getByText(BOOKINGS.emptyTab.refund_pending).waitFor();
      await screenshot(page, "bookings-empty-mobile-390-light");

      // Failed to load, with a retry.
      await page.route(listRequest, (route) => route.fulfill({ status: 500, json: { code: "SERVER_ERROR" } }));
      await page.getByTestId("tab-all").click();
      await page.getByTestId("bookings-error").waitFor();
      await screenshot(page, "bookings-error-mobile-390-light");
      await page.unroute(listRequest);
      await page.getByTestId("bookings-error").getByRole("button", { name: SITE.list.retry }).click();
      await page.locator("[data-testid='my-bookings'][data-state='ready']").waitFor();
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });

  it("checks a review before sending it", async () => {
    const stay = await freshStay();
    const finished = (
      await stack.pool.query(
        `INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, payment_status)
         SELECT id, $1, CURRENT_DATE - 9, CURRENT_DATE - 7, 100, 1, 'completed', 'paid' FROM users WHERE email = $2
         RETURNING id`,
        [stay.room.id, GUEST.email]
      )
    ).rows[0];

    for (const [name, viewport, colorScheme] of [["desktop-1440-light", DESKTOP, "light"], ["mobile-390-dark", PHONE, "dark"]]) {
      const { context, page, problems } = await openPage({ viewport, colorScheme });
      try {
        await signIn(page, GUEST);
        await page.goto(`${stack.baseUrl}/my-bookings`);
        await page.getByTestId("tab-completed").click();
        const card = page.getByTestId(`booking-${finished.id}`);
        await card.getByRole("button", { name: BOOKINGS.card.reviewThisRoom, exact: true }).click();
        const dialog = page.getByTestId("review-dialog");
        await dialog.waitFor();
        await screenshot(page, `bookings-review-dialog-${name}`, { full: false });

        // No stars: refused next to the stars, nothing sent.
        await dialog.locator("textarea").fill("x".repeat(2001));
        await dialog.getByRole("button", { name: BOOKINGS.reviewModal.submit }).click();
        await page.locator("[data-testid='review-stars-message'][role='alert']").getByText(BOOKINGS.errors.reviewRatingRequired).waitFor();
        await dialog.locator("#review-comment-message[role='alert']").waitFor();
        await screenshot(page, `bookings-review-errors-${name}`, { full: false });
        assert.equal((await stack.pool.query("SELECT 1 FROM room_reviews WHERE booking_id = $1", [finished.id])).rows.length, 0);

        // Stars are radio buttons: reachable and settable from the keyboard.
        await dialog.locator("input[name='rating']").nth(3).check({ force: true });
        assert.ok((await page.getByTestId("review-stars-message").innerText()).includes("4 / 5"));
        if (name.startsWith("mobile")) {
          await dialog.locator("textarea").fill("Đánh giá thử từ test trình duyệt.");
          await dialog.getByRole("button", { name: BOOKINGS.reviewModal.submit }).click();
          await dialog.waitFor({ state: "detached" });
          await card.getByText(BOOKINGS.card.reviewed).waitFor();
          const review = (await stack.pool.query("SELECT rating, comment FROM room_reviews WHERE booking_id = $1", [finished.id])).rows[0];
          assert.deepEqual(review, { rating: 4, comment: "Đánh giá thử từ test trình duyệt." });
        } else {
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "detached" });
        }
        assert.deepEqual(problems, [], name);
      } finally {
        await context.close();
      }
    }
  });

  it("says that payments are test ones on a demo with test gateways", async () => {
    const saved = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "true";
    const { context, page, problems } = await openPage();
    try {
      const stay = await freshStay();
      await signIn(page, GUEST);
      await page.goto(`${stack.baseUrl}/rooms/${stay.room.id}/book?checkIn=${stay.checkIn}&checkOut=${stay.checkOut}`);
      await step(page, "dates").waitFor();
      // The banner over the checkout, and the note beside the pay buttons.
      await page.getByTestId("demo-banner").getByText(COMMON.demo.noRealMoney).locator("visible=true").waitFor();
      await goToConfirm(page);
      await page.getByTestId("demo-payment-note").waitFor();
      await page.goBack();
      await step(page, "payment").waitFor();
      await page.getByTestId("demo-payment-note").waitFor();
      await screenshot(page, "checkout-payment-demo-desktop-1440-light");
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
      if (saved === undefined) delete process.env.DEMO_MODE;
      else process.env.DEMO_MODE = saved;
    }
  });
});
