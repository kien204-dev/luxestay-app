// Runs the real app against a real PostgreSQL (see docker-compose.test.yml),
// covering what the in-memory fake in test/ cannot: row locks, constraints,
// the actual SQL, and timezone behaviour.
//
// Run with `npm run test:integration` from the repository root.

// The server process runs in UTC here on purpose: every "today" decision has
// to come from APP_TIMEZONE, not from wherever the process happens to run.
process.env.TZ = "UTC";
process.env.NODE_ENV = "test";
process.env.APP_TIMEZONE = "Asia/Ho_Chi_Minh";
process.env.FREE_CANCELLATION_DAYS = "3";
process.env.DB_HOST = process.env.TEST_DB_HOST || "127.0.0.1";
process.env.DB_PORT = process.env.TEST_DB_PORT || "54330";
process.env.DB_USER = "luxestay";
process.env.DB_PASSWORD = "luxestay";
process.env.DB_NAME = "luxestay_test";
process.env.DB_SSL = "false";
// No secret is written into this file: each run signs with throwaway random
// values (or whatever the environment already provides), and the tests read
// them back from the environment like the app does.
const randomSecret = () => require("node:crypto").randomBytes(32).toString("hex");
process.env.JWT_SECRET = randomSecret();
process.env.SEED_ADMIN_PASSWORD = "Admin-Integration-1";
process.env.VNPAY_TMN_CODE = process.env.TEST_VNPAY_TMN_CODE || "TESTTMN01";
process.env.VNPAY_HASH_SECRET = process.env.TEST_VNPAY_HASH_SECRET || randomSecret();
process.env.VNPAY_RETURN_URL = "http://localhost:5173/payment/result";
process.env.MOMO_ENABLED = "false";
// Set (even to empty) so a developer's own apps/api/.env cannot switch on
// real email or change the hold time for this run.
process.env.SMTP_HOST = "";
process.env.PENDING_BOOKING_TTL_MINUTES = "30";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, before, describe, it, mock } = require("node:test");
const { io: ioClient } = require("socket.io-client");

const pool = require("../src/db/db");
const { reset } = require("../src/db/reset");
const { initSocket } = require("../src/services/socket");
const { dateInTimezone } = require("../src/utils/time");
const { formatVnpayDate } = require("../src/services/vnpayService");
const app = require("../server");

const ADMIN = { email: "admin@example.com", password: "Admin-Integration-1" };
const GUEST = { email: "user@example.com", password: "User@12345" };
const DAY_MS = 24 * 60 * 60 * 1000;

let server;
let io;
let baseUrl;
let adminCookie;
let guestCookie;
let nextRoomIndex = 10;

// "YYYY-MM-DD" this many days from today, in the property's timezone.
function dayFromToday(offset) {
  return dateInTimezone(new Date(Date.now() + offset * DAY_MS));
}

async function api(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function login({ email, password }) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `login failed for ${email}`);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

// Each test books its own room so tests cannot collide on dates.
async function freshRoomId() {
  const result = await pool.query("SELECT id FROM rooms ORDER BY id ASC OFFSET $1 LIMIT 1", [
    nextRoomIndex++,
  ]);
  return result.rows[0].id;
}

function book(roomId, checkIn, checkOut, extra = {}, cookie = guestCookie) {
  return api("/api/bookings", {
    method: "POST",
    cookie,
    body: { room_id: roomId, check_in: checkIn, check_out: checkOut, guests: 1, ...extra },
  });
}

async function bookingRow(id) {
  return (await pool.query("SELECT * FROM bookings WHERE id = $1", [id])).rows[0];
}

async function couponUses(code) {
  return (await pool.query("SELECT used_count FROM coupons WHERE code = $1", [code])).rows[0]
    .used_count;
}

async function createCoupon(code, fields = {}) {
  const coupon = { discount_type: "percent", discount_value: 10, usage_limit: null, ...fields };
  await pool.query(
    `INSERT INTO coupons (code, discount_type, discount_value, usage_limit, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '5 years')`,
    [code, coupon.discount_type, coupon.discount_value, coupon.usage_limit]
  );
}

// Makes a pending booking overdue and lets the app's own maintenance expire it.
async function expireBooking(id) {
  await pool.query("UPDATE bookings SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [id]);
  await api("/api/bookings", { cookie: adminCookie });
  assert.equal((await bookingRow(id)).status, "cancelled", "booking should have expired");
}

function vnpayIpnQuery(transactionRef, amount, overrides = {}) {
  const params = {
    vnp_Amount: String(Math.round(Number(amount) * 100)),
    vnp_BankCode: "NCB",
    vnp_OrderInfo: "Thanh toan booking",
    vnp_PayDate: "20300101101010",
    vnp_ResponseCode: "00",
    vnp_TmnCode: process.env.VNPAY_TMN_CODE,
    vnp_TransactionNo: "14123456",
    vnp_TransactionStatus: "00",
    vnp_TxnRef: transactionRef,
    ...overrides,
  };
  const sorted = Object.fromEntries(Object.keys(params).sort().map((key) => [key, params[key]]));
  const hash = crypto
    .createHmac("sha512", process.env.VNPAY_HASH_SECRET)
    .update(new URLSearchParams(sorted).toString(), "utf-8")
    .digest("hex");
  return new URLSearchParams({ ...sorted, vnp_SecureHash: hash }).toString();
}

async function startVnpayPayment(bookingId) {
  const created = await api(`/api/payments/bookings/${bookingId}`, {
    method: "POST",
    cookie: guestCookie,
    body: { provider: "vnpay" },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body;
}

function sendVnpayIpn(transactionRef, amount, overrides) {
  return api(`/api/payments/vnpay/ipn?${vnpayIpnQuery(transactionRef, amount, overrides)}`);
}

describe("booking and payment rules on real PostgreSQL", () => {
  before(async () => {
    await reset(pool, { log: () => {} });

    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    io = initSocket(server);
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    adminCookie = await login(ADMIN);
    guestCookie = await login(GUEST);
  });

  after(async () => {
    if (io) await io.close();
    else if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("lets exactly one of 20 simultaneous bookings for the same room and nights through", async () => {
    const roomId = await freshRoomId();
    const checkIn = dayFromToday(60);
    const checkOut = dayFromToday(62);

    const results = await Promise.all(
      Array.from({ length: 20 }, () => book(roomId, checkIn, checkOut))
    );

    const statuses = results.map((result) => result.status);
    assert.equal(statuses.filter((status) => status === 201).length, 1, statuses.join(","));
    assert.equal(statuses.filter((status) => status === 400).length, 19, statuses.join(","));

    const active = await pool.query(
      "SELECT COUNT(*)::int AS n FROM bookings WHERE room_id = $1 AND status IN ('pending', 'confirmed')",
      [roomId]
    );
    assert.equal(active.rows[0].n, 1);
  });

  it("has the database itself refuse overlapping active bookings, but allow back-to-back stays", async () => {
    const roomId = await freshRoomId();
    const insert = (checkIn, checkOut, status = "confirmed") =>
      pool.query(
        `INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, status)
         VALUES (2, $1, $2::date, $3::date, 100, $4)`,
        [roomId, checkIn, checkOut, status]
      );

    await insert(dayFromToday(70), dayFromToday(73));

    await assert.rejects(insert(dayFromToday(72), dayFromToday(75)), { code: "23P01" });
    await assert.rejects(insert(dayFromToday(69), dayFromToday(71), "pending"), { code: "23P01" });

    // Checkout day == next check-in day, and cancelled bookings, are fine.
    await insert(dayFromToday(73), dayFromToday(74));
    await insert(dayFromToday(70), dayFromToday(73), "cancelled");
  });

  it("gives a coupon's usage slot back when its booking is cancelled or expires", async () => {
    await createCoupon("ONCE", { usage_limit: 1 });
    const roomId = await freshRoomId();
    const dates = [dayFromToday(80), dayFromToday(81)];

    const first = await book(roomId, ...dates, { coupon_code: "ONCE" });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(await couponUses("ONCE"), 1);

    // The single slot is taken.
    const blocked = await book(await freshRoomId(), ...dates, { coupon_code: "ONCE" });
    assert.equal(blocked.status, 400);

    const cancelled = await api(`/api/bookings/${first.body.booking.id}/cancel`, {
      method: "PATCH",
      cookie: guestCookie,
    });
    assert.equal(cancelled.status, 200);
    assert.equal(await couponUses("ONCE"), 0);

    const second = await book(roomId, ...dates, { coupon_code: "ONCE" });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.equal(await couponUses("ONCE"), 1);

    await expireBooking(second.body.booking.id);
    assert.equal(await couponUses("ONCE"), 0);
  });

  it("confirms a fully discounted booking straight away instead of asking for a 0đ payment", async () => {
    await createCoupon("FREE100", { discount_value: 100 });

    const result = await book(await freshRoomId(), dayFromToday(85), dayFromToday(86), {
      coupon_code: "FREE100",
    });

    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(Number(result.body.booking.total_price), 0);
    assert.equal(result.body.booking.status, "confirmed");
    assert.equal(result.body.booking.payment_status, "paid");
    assert.equal(result.body.booking.expires_at, null);
  });

  // The gateway's server-to-server callback, simulated: each request is
  // signed here with VNPAY_HASH_SECRET from the environment, exactly as VNPay
  // would sign it. (A real sandbox round trip needs an activated merchant.)
  describe("VNPay IPN", () => {
    it("confirms a waiting booking on a correctly signed success callback, once", async () => {
      const roomId = await freshRoomId();
      const booking = (await book(roomId, dayFromToday(120), dayFromToday(122))).body.booking;
      const payment = await startVnpayPayment(booking.id);
      assert.equal((await bookingRow(booking.id)).payment_status, "pending");

      const ipn = await sendVnpayIpn(payment.transactionRef, booking.total_price);
      assert.deepEqual(ipn.body, { RspCode: "00", Message: "Confirm Success" });

      const row = await bookingRow(booking.id);
      assert.equal(row.status, "confirmed");
      assert.equal(row.payment_status, "paid");
      assert.equal(row.expires_at, null);

      const paymentRow = (
        await pool.query("SELECT * FROM payments WHERE transaction_ref = $1", [payment.transactionRef])
      ).rows[0];
      assert.equal(paymentRow.status, "success");
      assert.equal(paymentRow.provider_transaction_id, "14123456");
      assert.equal(paymentRow.raw_callback.vnp_TxnRef, payment.transactionRef);
      // The signature itself is not kept with the stored callback.
      assert.equal(paymentRow.raw_callback.vnp_SecureHash, undefined);

      // What the guest's result page asks for.
      const status = await api(`/api/payments/transactions/${payment.transactionRef}`, {
        cookie: guestCookie,
      });
      assert.equal(status.body.payment.status, "success");
      assert.equal(status.body.bookingStatus, "confirmed");
      assert.equal(status.body.bookingPaymentStatus, "paid");

      // VNPay repeats callbacks until acknowledged; a repeat must change nothing.
      for (let attempt = 0; attempt < 3; attempt++) {
        const replay = await sendVnpayIpn(payment.transactionRef, booking.total_price);
        assert.equal(replay.body.RspCode, "02");
      }
      const after = await bookingRow(booking.id);
      assert.equal(after.status, "confirmed");
      assert.equal(after.payment_status, "paid");
      const attempts = await pool.query("SELECT COUNT(*)::int AS n FROM payments WHERE booking_id = $1", [
        booking.id,
      ]);
      assert.equal(attempts.rows[0].n, 1);
    });

    it("refuses a callback with a wrong, missing or foreign signature and changes nothing", async () => {
      const booking = (await book(await freshRoomId(), dayFromToday(123), dayFromToday(124))).body.booking;
      const payment = await startVnpayPayment(booking.id);
      const signed = vnpayIpnQuery(payment.transactionRef, booking.total_price);

      // A field changed after signing.
      const tampered = await api(`/api/payments/vnpay/ipn?${signed.replace("vnp_BankCode=NCB", "vnp_BankCode=XXX")}`);
      assert.equal(tampered.body.RspCode, "97");

      // No signature at all.
      const unsigned = new URLSearchParams(signed);
      unsigned.delete("vnp_SecureHash");
      assert.equal((await api(`/api/payments/vnpay/ipn?${unsigned}`)).body.RspCode, "97");

      // Signed, but with a different secret.
      const foreign = new URLSearchParams(signed);
      foreign.delete("vnp_SecureHash");
      const sorted = Object.fromEntries([...foreign.entries()].sort(([a], [b]) => a.localeCompare(b)));
      const foreignHash = crypto
        .createHmac("sha512", randomSecret())
        .update(new URLSearchParams(sorted).toString(), "utf-8")
        .digest("hex");
      foreign.set("vnp_SecureHash", foreignHash);
      assert.equal((await api(`/api/payments/vnpay/ipn?${foreign}`)).body.RspCode, "97");

      const row = await bookingRow(booking.id);
      assert.equal(row.status, "pending");
      assert.equal(row.payment_status, "pending");
    });

    it("refuses a correctly signed callback for the wrong amount, or for an unknown order", async () => {
      const booking = (await book(await freshRoomId(), dayFromToday(125), dayFromToday(126))).body.booking;
      const payment = await startVnpayPayment(booking.id);

      for (const amount of [Number(booking.total_price) - 1, Number(booking.total_price) * 100, 0]) {
        const wrong = await sendVnpayIpn(payment.transactionRef, amount);
        assert.equal(wrong.body.RspCode, "04", `amount ${amount}`);
      }

      const unknown = await sendVnpayIpn("LX-NO-SUCH-ORDER", booking.total_price);
      assert.equal(unknown.body.RspCode, "01");

      const row = await bookingRow(booking.id);
      assert.equal(row.status, "pending");
      assert.equal(row.payment_status, "pending");

      // The right amount still goes through afterwards.
      const ok = await sendVnpayIpn(payment.transactionRef, booking.total_price);
      assert.equal(ok.body.RspCode, "00");
      assert.equal((await bookingRow(booking.id)).status, "confirmed");
    });

    it("records a failed payment without confirming, and lets the guest try again", async () => {
      const booking = (await book(await freshRoomId(), dayFromToday(127), dayFromToday(128))).body.booking;
      const first = await startVnpayPayment(booking.id);

      const failed = await sendVnpayIpn(first.transactionRef, booking.total_price, {
        vnp_ResponseCode: "24",
        vnp_TransactionStatus: "02",
      });
      assert.equal(failed.body.RspCode, "00");

      let row = await bookingRow(booking.id);
      assert.equal(row.status, "pending");
      assert.equal(row.payment_status, "failed");

      const second = await startVnpayPayment(booking.id);
      assert.notEqual(second.transactionRef, first.transactionRef);
      assert.equal((await sendVnpayIpn(second.transactionRef, booking.total_price)).body.RspCode, "00");

      row = await bookingRow(booking.id);
      assert.equal(row.status, "confirmed");
      assert.equal(row.payment_status, "paid");
    });
  });

  it("revives an expired booking when its payment arrives and the room is still free", async () => {
    await createCoupon("REVIVE", { usage_limit: 5 });
    const roomId = await freshRoomId();
    const created = await book(roomId, dayFromToday(90), dayFromToday(92), { coupon_code: "REVIVE" });
    const booking = created.body.booking;
    const payment = await startVnpayPayment(booking.id);

    await expireBooking(booking.id);
    assert.equal(await couponUses("REVIVE"), 0);

    const ipn = await sendVnpayIpn(payment.transactionRef, booking.total_price);
    assert.equal(ipn.body.RspCode, "00");

    const row = await bookingRow(booking.id);
    assert.equal(row.status, "confirmed");
    assert.equal(row.payment_status, "paid");
    assert.equal(row.cancelled_at, null);
    assert.equal(row.refund_reason, null);
    assert.equal(await couponUses("REVIVE"), 1);

    const room = await pool.query("SELECT status FROM rooms WHERE id = $1", [roomId]);
    assert.equal(room.rows[0].status, "booked");

    // VNPay retrying the same callback changes nothing.
    const replay = await sendVnpayIpn(payment.transactionRef, booking.total_price);
    assert.equal(replay.body.RspCode, "02");
    assert.equal((await bookingRow(booking.id)).status, "confirmed");
  });

  it("flags an expired booking for refund, and tells the admin, when its payment arrives after the room was rebooked", async () => {
    const roomId = await freshRoomId();
    const dates = [dayFromToday(95), dayFromToday(97)];
    const created = await book(roomId, ...dates);
    const booking = created.body.booking;
    const payment = await startVnpayPayment(booking.id);

    await expireBooking(booking.id);

    // Someone else takes the room for an overlapping stay in the meantime.
    const rebooked = await book(roomId, dayFromToday(96), dayFromToday(98), {}, adminCookie);
    assert.equal(rebooked.status, 201, JSON.stringify(rebooked.body));

    const adminSocket = ioClient(baseUrl, {
      extraHeaders: { Cookie: adminCookie },
      reconnection: false,
      forceNew: true,
    });
    await new Promise((resolve, reject) => {
      adminSocket.on("connect", resolve);
      adminSocket.on("connect_error", reject);
    });
    const alert = new Promise((resolve) => adminSocket.on("booking:refund-pending", resolve));

    const ipn = await sendVnpayIpn(payment.transactionRef, booking.total_price);
    assert.equal(ipn.body.RspCode, "00");

    const row = await bookingRow(booking.id);
    assert.equal(row.status, "cancelled");
    assert.equal(row.payment_status, "refund_pending");
    assert.equal(row.refund_reason, "paid_after_cancellation");

    // The other guest's booking is untouched.
    assert.equal((await bookingRow(rebooked.body.booking.id)).status, "pending");

    const event = await alert;
    adminSocket.close();
    assert.equal(event.id, booking.id);
    assert.equal(event.refund_reason, "paid_after_cancellation");

    // The admin's record: it shows up in the refund queue until settled.
    const queue = await api("/api/bookings?payment_status=refund_pending", { cookie: adminCookie });
    assert.ok(queue.body.some((item) => item.id === booking.id));

    const paymentRow = await pool.query("SELECT status FROM payments WHERE transaction_ref = $1", [
      payment.transactionRef,
    ]);
    assert.equal(paymentRow.rows[0].status, "success");

    // A paid-for booking can no longer be hard-deleted (it would take the
    // payment record with it).
    const deleted = await api(`/api/bookings/${booking.id}`, { method: "DELETE", cookie: adminCookie });
    assert.equal(deleted.status, 400);

    const guestRefund = await api(`/api/bookings/${booking.id}/refund`, { method: "PATCH", cookie: guestCookie });
    assert.equal(guestRefund.status, 403);

    const refunded = await api(`/api/bookings/${booking.id}/refund`, { method: "PATCH", cookie: adminCookie });
    assert.equal(refunded.status, 200);
    assert.equal(refunded.body.booking.payment_status, "refunded");
    assert.ok(refunded.body.booking.refunded_at);

    const again = await api(`/api/bookings/${booking.id}/refund`, { method: "PATCH", cookie: adminCookie });
    assert.equal(again.status, 400);
  });

  it("rejects a payment callback whose amount or signature does not match", async () => {
    const created = await book(await freshRoomId(), dayFromToday(100), dayFromToday(101));
    const booking = created.body.booking;
    const payment = await startVnpayPayment(booking.id);

    const wrongAmount = await sendVnpayIpn(payment.transactionRef, Number(booking.total_price) - 1);
    assert.equal(wrongAmount.body.RspCode, "04");

    const signedQuery = vnpayIpnQuery(payment.transactionRef, booking.total_price);
    const tampered = await api(
      `/api/payments/vnpay/ipn?${signedQuery.replace("vnp_BankCode=NCB", "vnp_BankCode=XXX")}`
    );
    assert.equal(tampered.body.RspCode, "97");

    const row = await bookingRow(booking.id);
    assert.equal(row.status, "pending");
    assert.equal(row.payment_status, "pending");
  });

  it("applies the free-cancellation window to paid bookings only", async () => {
    const markPaid = (id) => api(`/api/bookings/${id}/mark-paid`, { method: "PATCH", cookie: adminCookie });
    const cancel = (id, cookie = guestCookie) => api(`/api/bookings/${id}/cancel`, { method: "PATCH", cookie });

    // Paid, check-in in 2 days (inside the 3-day window): the guest is too late.
    const late = (await book(await freshRoomId(), dayFromToday(2), dayFromToday(4))).body.booking;
    const paid = await markPaid(late.id);
    assert.equal(paid.status, 200);
    assert.equal(paid.body.booking.status, "confirmed");
    assert.equal(paid.body.booking.payment_status, "paid");

    const tooLate = await cancel(late.id);
    assert.equal(tooLate.status, 400);
    assert.equal(tooLate.body.code, "CANCELLATION_WINDOW_PASSED");
    assert.equal((await bookingRow(late.id)).status, "confirmed");

    // The admin can still cancel it, and that owes the guest a refund.
    const byAdmin = await cancel(late.id, adminCookie);
    assert.equal(byAdmin.status, 200);
    assert.equal(byAdmin.body.booking.payment_status, "refund_pending");
    assert.equal(byAdmin.body.booking.refund_reason, "cancelled_by_admin");

    // Paid, exactly 3 days ahead: still inside the free window.
    const onTime = (await book(await freshRoomId(), dayFromToday(3), dayFromToday(5))).body.booking;
    await markPaid(onTime.id);
    const cancelled = await cancel(onTime.id);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.booking.status, "cancelled");
    assert.equal(cancelled.body.booking.payment_status, "refund_pending");
    assert.equal(cancelled.body.booking.refund_reason, "cancelled_by_guest");

    // Unpaid, check-in tomorrow: nothing to refund, so always allowed.
    const unpaid = (await book(await freshRoomId(), dayFromToday(1), dayFromToday(2))).body.booking;
    const dropped = await cancel(unpaid.id);
    assert.equal(dropped.status, 200);
    assert.equal(dropped.body.booking.payment_status, "unpaid");

    const policy = await api("/api/bookings/policy");
    assert.equal(policy.body.freeCancellationDays, 3);
  });

  it("publishes a room's taken nights without anything about the bookings behind them", async () => {
    const roomId = await freshRoomId();
    await book(roomId, dayFromToday(130), dayFromToday(132));
    const cancelled = (await book(roomId, dayFromToday(133), dayFromToday(134))).body.booking;
    await api(`/api/bookings/${cancelled.id}/cancel`, { method: "PATCH", cookie: guestCookie });

    // No cookie: this is what an anonymous visitor's calendar asks for.
    const result = await api(
      `/api/rooms/${roomId}/availability?from=${dayFromToday(128)}&to=${dayFromToday(136)}`
    );

    assert.equal(result.status, 200);
    assert.deepEqual(Object.keys(result.body).sort(), ["bookable", "from", "room_id", "to", "today", "unavailable"]);
    // The two booked nights; checkout day is free again, the cancelled stay does not count.
    assert.deepEqual(result.body.unavailable, [dayFromToday(130), dayFromToday(131)]);
    assert.equal(result.body.bookable, true);
    assert.doesNotMatch(JSON.stringify(result.body), /user|email|guest|price|status/i);

    const destinations = await api("/api/rooms/destinations");
    assert.equal(destinations.status, 200);
    assert.ok(destinations.body.length > 0);
    assert.ok(destinations.body.every((item) => item.name && item.room_count >= 1));
  });

  it("stores property settings and applies them to the booking rules", async () => {
    const before = await api("/api/settings/public");
    assert.equal(before.status, 200);
    assert.equal(before.body.freeCancellationDays, 3);

    const forbidden = await api("/api/settings", { method: "PUT", cookie: guestCookie, body: { name: "x" } });
    assert.equal(forbidden.status, 403);

    const saved = await api("/api/settings", {
      method: "PUT",
      cookie: adminCookie,
      body: { name: "Nhà Nghỉ Hoa Sữa", checkInTime: "15:00", checkOutTime: "11:30", freeCancellationDays: 1 },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    try {
      const after = await api("/api/settings/public");
      assert.equal(after.body.name, "Nhà Nghỉ Hoa Sữa");
      assert.equal(after.body.checkInTime, "15:00");

      // The database refuses values the API would never send.
      await assert.rejects(pool.query("UPDATE property_settings SET check_in_time = '25:99' WHERE id = 1"));
      await assert.rejects(pool.query("INSERT INTO property_settings (id, name) VALUES (2, 'second row')"));

      // With a 1-day window, a paid booking 2 days ahead can be cancelled by the guest.
      const booking = (await book(await freshRoomId(), dayFromToday(2), dayFromToday(3))).body.booking;
      await api(`/api/bookings/${booking.id}/mark-paid`, { method: "PATCH", cookie: adminCookie });
      const cancelled = await api(`/api/bookings/${booking.id}/cancel`, { method: "PATCH", cookie: guestCookie });
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
      assert.equal(cancelled.body.booking.payment_status, "refund_pending");
    } finally {
      // Back to "nothing stored" so the other tests see the environment's 3 days.
      await pool.query("DELETE FROM property_settings");
    }
    assert.equal((await api("/api/settings/public")).body.freeCancellationDays, 3);
  });

  it("books for a walk-in guest, lists it with totals, and produces a PDF", async () => {
    const roomId = await freshRoomId();
    const created = await api("/api/bookings", {
      method: "POST",
      cookie: adminCookie,
      body: {
        room_id: roomId,
        check_in: dayFromToday(140),
        check_out: dayFromToday(142),
        guests: 1,
        guest_name: "Trần Thị Bình",
        guest_phone: "0912 345 678",
        paid: true,
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.booking.status, "confirmed");
    assert.equal(created.body.booking.payment_status, "paid");
    assert.equal(created.body.booking.expires_at, null);

    const row = await bookingRow(created.body.booking.id);
    assert.equal(row.guest_name, "Trần Thị Bình");
    assert.equal(row.language, "vi");

    const summary = await api("/api/bookings/summary", { cookie: adminCookie });
    const counted = await pool.query(
      "SELECT COUNT(*)::int AS total, COALESCE(SUM(total_price) FILTER (WHERE payment_status = 'paid'), 0) AS revenue FROM bookings"
    );
    assert.equal(summary.body.total, counted.rows[0].total);
    assert.equal(summary.body.revenue, Number(counted.rows[0].revenue));

    const page = await api("/api/bookings?page=1&limit=3", { cookie: adminCookie });
    assert.equal(page.body.data.length, 3);
    assert.equal(page.body.data[0].guest_name, "Trần Thị Bình");

    const pdf = await fetch(`${baseUrl}/api/bookings/${created.body.booking.id}/receipt`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(pdf.status, 200);
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");

    const stats = await api("/api/dashboard/stats", { cookie: adminCookie });
    assert.equal(stats.status, 200, JSON.stringify(stats.body));
    assert.equal(stats.body.totalRooms, stats.body.availableRooms + stats.body.bookedRooms + stats.body.maintenanceRooms);
    const analytics = await api("/api/dashboard/analytics?range=month", { cookie: adminCookie });
    assert.equal(analytics.status, 200, JSON.stringify(analytics.body));
  });

  it("keeps maintenance set by the admin and derives available/booked from bookings", async () => {
    const roomId = await freshRoomId();
    const room = (await api(`/api/rooms/${roomId}`)).body;
    const payload = {
      room_name: room.room_name,
      room_type: room.room_type,
      price: room.price,
      capacity: room.capacity,
      location: room.location,
    };
    const update = (extra) =>
      api(`/api/rooms/${roomId}`, { method: "PUT", cookie: adminCookie, body: { ...payload, ...extra } });

    await book(roomId, dayFromToday(110), dayFromToday(111));

    // Claiming "available" by hand does not stick while a booking is active.
    assert.equal((await update({ status: "available" })).body.room.status, "booked");
    assert.equal((await update({ status: "maintenance" })).body.room.status, "maintenance");
    // Leaving status out keeps maintenance instead of silently reopening the room.
    assert.equal((await update({})).body.room.status, "maintenance");
  });

  describe("at 01:30 in Vietnam while the server clock (UTC) still shows the previous day", () => {
    // 2031-03-10 18:30 UTC == 2031-03-11 01:30 in Asia/Ho_Chi_Minh.
    const NOW = new Date("2031-03-10T18:30:05Z");
    let lateGuestCookie;

    before(async () => {
      mock.timers.enable({ apis: ["Date"], now: NOW });
      // Sessions are time-limited, so sign in again "then".
      lateGuestCookie = await login(GUEST);
    });

    after(() => {
      mock.timers.reset();
    });

    it("treats the Vietnamese date as today: yesterday there cannot be booked", async () => {
      assert.equal(new Date().toISOString().slice(0, 10), "2031-03-10", "server-side UTC date");

      const policy = await api("/api/bookings/policy");
      assert.equal(policy.body.today, "2031-03-11");

      const roomId = await freshRoomId();
      const yesterdayInVietnam = await book(roomId, "2031-03-10", "2031-03-12", {}, lateGuestCookie);
      assert.equal(yesterdayInVietnam.status, 400);
      assert.match(yesterdayInVietnam.body.message, /quá khứ/);

      const todayInVietnam = await book(roomId, "2031-03-11", "2031-03-12", {}, lateGuestCookie);
      assert.equal(todayInVietnam.status, 201, JSON.stringify(todayInVietnam.body));
    });

    it("sends VNPay its timestamps in GMT+7", async () => {
      assert.equal(formatVnpayDate(NOW), "20310311013005");

      const created = await book(await freshRoomId(), "2031-03-20", "2031-03-21", {}, lateGuestCookie);
      const payment = await api(`/api/payments/bookings/${created.body.booking.id}`, {
        method: "POST",
        cookie: lateGuestCookie,
        body: { provider: "vnpay" },
      });
      assert.equal(payment.status, 201, JSON.stringify(payment.body));

      const query = new URL(payment.body.payUrl).searchParams;
      assert.equal(query.get("vnp_CreateDate"), "20310311013005");
      // The booking is held for 30 minutes, so the deadline is 02:00 that night.
      assert.equal(query.get("vnp_ExpireDate"), "20310311020005");
    });
  });
});
