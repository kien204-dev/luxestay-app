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
process.env.JWT_SECRET = "integration-test-secret-0123456789abcdef";
process.env.SEED_ADMIN_PASSWORD = "Admin-Integration-1";
process.env.VNPAY_TMN_CODE = "TESTTMN01";
process.env.VNPAY_HASH_SECRET = "integration-vnpay-hash-secret";
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
