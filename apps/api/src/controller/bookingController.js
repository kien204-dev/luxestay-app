const pool = require("../db/db.js");
const { applyCouponForBooking, releaseCoupon } = require("./couponController.js");
const { emitBookingCreated } = require("../services/socket.js");
const { notifyRefundPending } = require("../services/adminAlerts.js");
const { daysBetween, todayInAppTimezone } = require("../utils/time.js");
const { getPropertySettings } = require("../services/propertySettings.js");
const { loadBookingDetails, notifyBooking, SUPPORTED_LANGUAGES } = require("../services/bookingEmails.js");
const { buildReceiptPdf } = require("../services/bookingReceipt.js");

const ACTIVE_STATUSES = ["pending", "confirmed"];
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EXCLUSION_VIOLATION = "23P01";

const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// Why a cancelled booking is waiting for a refund. Stored in
// bookings.refund_reason so the admin sees what happened.
const REFUND_REASONS = {
  cancelledByGuest: "cancelled_by_guest",
  cancelledByAdmin: "cancelled_by_admin",
  paidAfterCancellation: "paid_after_cancellation",
};

async function autoCompletePastBookings() {
  await pool.query(
    `UPDATE bookings SET status = 'completed' WHERE status = 'confirmed' AND check_out < $1::date`,
    [todayInAppTimezone()]
  );
}

function getPendingBookingTtlMinutes() {
  const ttl = Number(process.env.PENDING_BOOKING_TTL_MINUTES || 30);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 30;
}

// A guest may cancel a paid booking for free until this many days before
// check-in (0 means "up to and including check-in day"). Set by the admin in
// the property settings, else FREE_CANCELLATION_DAYS, else 3.
async function getFreeCancellationDays() {
  return (await getPropertySettings()).freeCancellationDays;
}

// Bookings left "pending" past their expires_at never got confirmed/paid in
// time, so they're auto-cancelled, their coupon slot is handed back and their
// room's cached status resynced — otherwise they'd block the room from being
// booked or shown as available indefinitely. One statement, so a booking can
// never end up cancelled with its coupon slot still taken.
async function autoExpirePendingBookings() {
  const expired = await pool.query(
    `WITH expired AS (
       UPDATE bookings SET status = 'cancelled', cancelled_at = NOW()
       WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()
       RETURNING room_id, coupon_id
     ),
     released AS (
       UPDATE coupons c SET used_count = GREATEST(c.used_count - n.uses, 0)
       FROM (
         SELECT coupon_id, COUNT(*)::int AS uses
         FROM expired WHERE coupon_id IS NOT NULL GROUP BY coupon_id
       ) n
       WHERE c.id = n.coupon_id
     )
     SELECT DISTINCT room_id FROM expired`
  );

  for (const row of expired.rows) {
    await syncRoomStatus(pool, row.room_id);
  }
}

const MAINTENANCE_INTERVAL_MS = 30 * 1000;
let lastMaintenanceAt = 0;

// Expiry and auto-completion are driven by the background job started in
// server.js. Read endpoints call this too so their data is fresh, but outside
// tests it is throttled: listing bookings must not mean two table-wide
// UPDATEs per request.
async function runBookingMaintenance({ force = false } = {}) {
  const throttled = process.env.NODE_ENV !== "test" && !force;
  if (throttled && Date.now() - lastMaintenanceAt < MAINTENANCE_INTERVAL_MS) return;

  lastMaintenanceAt = Date.now();
  await autoCompletePastBookings();
  await autoExpirePendingBookings();
}

// Exposed so roomController's availability search can expire stale pending
// bookings before excluding rooms from the "still free" result set.
exports.autoExpirePendingBookings = autoExpirePendingBookings;
exports.runBookingMaintenance = runBookingMaintenance;

// Exposed so paymentController can reuse the same rules when a verified
// payment callback confirms, or revives, a booking.
exports.syncRoomStatus = syncRoomStatus;
exports.hasDateOverlap = hasDateOverlap;
exports.REFUND_REASONS = REFUND_REASONS;
exports.EXCLUSION_VIOLATION = EXCLUSION_VIOLATION;

// The language the guest's browser is showing the site in (the web app
// sends it as Accept-Language); remembered on the booking for later emails.
function requestLanguage(req) {
  const preferred = String(req.headers["accept-language"] || "").trim().slice(0, 2).toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(preferred)) return preferred;
  return SUPPORTED_LANGUAGES.includes(process.env.DEFAULT_LANGUAGE) ? process.env.DEFAULT_LANGUAGE : "vi";
}

const GUEST_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GUEST_PHONE_PATTERN = /^[0-9+\-\s().]{6,30}$/;

// An admin entering a booking for someone at the desk or on the phone.
// Returns null for an ordinary booking, { error } or { guest } otherwise.
function parseWalkInGuest(req) {
  if (req.user.role !== "admin" || req.body.guest_name === undefined) return null;

  const text = (value) => (typeof value === "string" ? value.trim() : "");
  const name = text(req.body.guest_name);
  const phone = text(req.body.guest_phone);
  const email = text(req.body.guest_email).toLowerCase();

  if (!name) return { error: "Vui lòng nhập tên khách" };
  if (name.length > 100) return { error: "Tên khách không được dài quá 100 ký tự" };
  if (phone && !GUEST_PHONE_PATTERN.test(phone)) return { error: "Số điện thoại khách không hợp lệ" };
  if (email && (email.length > 255 || !GUEST_EMAIL_PATTERN.test(email))) {
    return { error: "Email khách không hợp lệ" };
  }

  return { guest: { name, phone: phone || null, email: email || null, paid: req.body.paid === true } };
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseDateOnly(dateStr) {
  if (typeof dateStr !== "string" || !DATE_ONLY_PATTERN.test(dateStr)) {
    return null;
  }

  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;

  // Rejects dates the calendar doesn't have (2026-02-30 rolls over to March).
  return d.toISOString().slice(0, 10) === dateStr ? d : null;
}

function calculateNights(checkIn, checkOut) {
  if (!parseDateOnly(checkIn) || !parseDateOnly(checkOut)) return 0;
  return daysBetween(checkIn, checkOut);
}

async function hasDateOverlap(client, roomId, checkIn, checkOut, excludeBookingId = null) {
  let query = `
    SELECT id FROM bookings
    WHERE room_id = $1
    AND status = ANY($4::text[])
    AND check_in < $3::date
    AND check_out > $2::date
  `;
  const params = [roomId, checkIn, checkOut, ACTIVE_STATUSES];

  if (excludeBookingId) {
    query += " AND id != $5";
    params.push(excludeBookingId);
  }

  query += " FOR UPDATE";

  const result = await client.query(query, params);
  return result.rows.length > 0;
}

async function syncRoomStatus(client, roomId) {
  const active = await client.query(
    `
    SELECT id FROM bookings
    WHERE room_id = $1
    AND status = ANY($2::text[])
    AND check_out >= $3::date
    LIMIT 1
    `,
    [roomId, ACTIVE_STATUSES, todayInAppTimezone()]
  );

  const room = await client.query(
    "SELECT status FROM rooms WHERE id = $1",
    [roomId]
  );

  if (room.rows.length === 0) return;

  if (room.rows[0].status === "maintenance") return;

  const newStatus = active.rows.length > 0 ? "booked" : "available";

  await client.query("UPDATE rooms SET status = $1 WHERE id = $2", [
    newStatus,
    roomId,
  ]);
}

// The one place a booking becomes cancelled by a person (guest or admin).
// Money already received turns into a refund the admin has to settle by hand;
// the coupon slot goes back; the room's cached status is resynced. The caller
// owns the transaction and must hold the booking row lock.
async function cancelBookingRow(client, booking, { byAdmin }) {
  const owesRefund = booking.payment_status === "paid";
  const refundReason = owesRefund
    ? byAdmin
      ? REFUND_REASONS.cancelledByAdmin
      : REFUND_REASONS.cancelledByGuest
    : null;

  const result = await client.query(
    `
    UPDATE bookings
    SET status = 'cancelled',
        cancelled_at = NOW(),
        expires_at = NULL,
        payment_status = CASE WHEN $2::boolean THEN 'refund_pending' ELSE payment_status END,
        refund_reason = CASE WHEN $2::boolean THEN $3::text ELSE refund_reason END
    WHERE id = $1
    RETURNING *
    `,
    [booking.id, owesRefund, refundReason]
  );

  await releaseCoupon(client, booking.coupon_id);
  await syncRoomStatus(client, booking.room_id);

  return { booking: result.rows[0], owesRefund };
}

const BOOKING_SELECT = `
  SELECT
    b.id,
    b.user_id,
    b.room_id,
    b.check_in,
    b.check_out,
    b.total_price,
    b.guests,
    b.status,
    b.payment_status,
    b.expires_at,
    b.created_at,
    b.cancelled_at,
    b.refund_reason,
    b.refunded_at,
    b.coupon_id,
    b.discount_amount,
    b.language,
    b.guest_name,
    b.guest_phone,
    b.guest_email,
    u.name AS user_name,
    u.email AS user_email,
    r.room_name,
    r.room_type,
    r.capacity AS room_capacity,
    r.price AS room_price,
    r.image AS room_image,
    c.code AS coupon_code,
    EXISTS(SELECT 1 FROM room_reviews rv WHERE rv.booking_id = b.id) AS has_review
  FROM bookings b
  JOIN users u ON b.user_id = u.id
  JOIN rooms r ON b.room_id = r.id
  LEFT JOIN coupons c ON b.coupon_id = c.id
`;

const PAYMENT_STATUSES = ["unpaid", "pending", "paid", "failed", "refund_pending", "refunded"];

exports.getBookings = async (req, res) => {
  try {
    await runBookingMaintenance();

    const allowStatus = ["pending", "confirmed", "cancelled", "completed"];
    const { status, from, to, page, limit } = req.query;
    const paymentStatus = req.query.payment_status;

    const conditions = [];
    const params = [];

    if (req.user.role !== "admin") {
      params.push(req.user.id);
      conditions.push(`b.user_id = $${params.length}`);
    }

    if (status && allowStatus.includes(status)) {
      params.push(status);
      conditions.push(`b.status = $${params.length}`);
    }

    if (paymentStatus && PAYMENT_STATUSES.includes(paymentStatus)) {
      params.push(paymentStatus);
      conditions.push(`b.payment_status = $${params.length}`);
    }

    if (from && parseDateOnly(from)) {
      params.push(from);
      conditions.push(`b.check_in >= $${params.length}::date`);
    }

    if (to && parseDateOnly(to)) {
      params.push(to);
      conditions.push(`b.check_out <= $${params.length}::date`);
    }

    const whereClause = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
    const usePagination = page !== undefined || limit !== undefined;

    if (!usePagination) {
      const result = await pool.query(
        `${BOOKING_SELECT}${whereClause} ORDER BY b.id DESC`,
        params
      );
      return res.json(result.rows);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM bookings b${whereClause}`,
      params
    );
    const total = countResult.rows[0].total;

    const dataParams = [...params, limitNum, offset];
    const result = await pool.query(
      `${BOOKING_SELECT}${whereClause} ORDER BY b.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    );

    res.json({
      data: result.rows,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.max(1, Math.ceil(total / limitNum)),
    });
  } catch (err) {
    console.error("GET BOOKINGS ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi lấy danh sách booking" });
  }
};

// Admin: the headline numbers above the orders list, computed over every
// booking so the list itself can be loaded one page at a time.
exports.getBookingSummary = async (req, res) => {
  try {
    await runBookingMaintenance();

    const result = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE payment_status = 'refund_pending')::int AS refund_pending,
         COALESCE(SUM(total_price) FILTER (WHERE payment_status = 'paid'), 0)::numeric AS revenue
       FROM bookings`
    );
    const row = result.rows[0];

    res.json({
      total: row.total,
      pending: row.pending,
      refundPending: row.refund_pending,
      revenue: Number(row.revenue) || 0,
    });
  } catch (err) {
    console.error("GET BOOKING SUMMARY ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi lấy số liệu đơn đặt phòng" });
  }
};

// What the guest-facing pages need to explain the rules before asking the
// server to apply them.
exports.getBookingPolicy = async (req, res) => {
  const settings = await getPropertySettings();

  res.json({
    freeCancellationDays: settings.freeCancellationDays,
    checkInTime: settings.checkInTime,
    checkOutTime: settings.checkOutTime,
    pendingBookingTtlMinutes: getPendingBookingTtlMinutes(),
    today: todayInAppTimezone(),
  });
};

exports.getBookingById = async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Booking id must be a positive integer" });
  }

  try {
    await runBookingMaintenance();

    const result = await pool.query(
      `${BOOKING_SELECT} WHERE b.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy booking" });
    }

    const booking = result.rows[0];

    if (req.user.role !== "admin" && booking.user_id !== req.user.id) {
      return res.status(403).json({
        message: "Bạn không có quyền xem booking này",
      });
    }

    res.json(booking);
  } catch (err) {
    console.error("GET BOOKING BY ID ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi lấy booking" });
  }
};

// The booking as a one-page PDF, for the guest who made it or an admin.
exports.getBookingReceipt = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Booking id must be a positive integer" });
  }

  try {
    const booking = await loadBookingDetails(id);
    if (!booking) {
      return res.status(404).json({ message: "Không tìm thấy booking" });
    }
    if (req.user.role !== "admin" && booking.user_id !== req.user.id) {
      return res.status(403).json({ message: "Bạn không có quyền xem booking này" });
    }

    const property = await getPropertySettings();
    // ?lang= lets the person downloading choose; otherwise the language the
    // booking was made in.
    const buffer = await buildReceiptPdf(booking, property, { language: req.query.lang });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="booking-BK-${String(id).padStart(4, "0")}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    console.error("BOOKING RECEIPT ERROR:", err);
    return res.status(500).json({ message: "Lỗi server khi tạo phiếu xác nhận" });
  }
};

exports.createBooking = async (req, res) => {
  const { room_id, check_in, check_out, guests, num_guests, coupon_code } = req.body;
  const user_id = req.user.id;
  const roomId = Number(room_id);
  const guestCount = Number(guests ?? num_guests ?? 1);

  if (!room_id || !check_in || !check_out) {
    return res.status(400).json({
      message: "Thiếu thông tin đặt phòng (room_id, check_in, check_out)",
    });
  }

  if (!Number.isInteger(roomId) || roomId <= 0) {
    return res.status(400).json({
      message: "Phòng không hợp lệ",
    });
  }

  if (!Number.isInteger(guestCount) || guestCount <= 0) {
    return res.status(400).json({
      message: "Số khách phải lớn hơn 0",
    });
  }

  const walkIn = parseWalkInGuest(req);
  if (walkIn?.error) {
    return res.status(400).json({ message: walkIn.error });
  }
  const guest = walkIn?.guest || null;

  if (!parseDateOnly(check_in) || !parseDateOnly(check_out)) {
    return res.status(400).json({ message: "Ngày check-in/check-out không hợp lệ" });
  }

  const nights = calculateNights(check_in, check_out);

  if (nights <= 0) {
    return res.status(400).json({
      message: "Ngày check-out phải sau ngày check-in",
    });
  }

  // Both sides are "YYYY-MM-DD" strings in the property's timezone, so this
  // holds whatever timezone the server itself runs in.
  if (check_in < todayInAppTimezone()) {
    return res.status(400).json({
      message: "Ngày check-in không được ở quá khứ",
    });
  }

  let client;

  try {
    await autoExpirePendingBookings();

    client = await pool.connect();
    await client.query("BEGIN");

    const roomResult = await client.query(
      "SELECT id, room_name, price, status, capacity FROM rooms WHERE id = $1 FOR UPDATE",
      [roomId]
    );

    if (roomResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy phòng" });
    }

    const room = roomResult.rows[0];
    const capacity = Number(room.capacity) || 0;
    const price = Number(room.price);

    if (capacity > 0 && guestCount > capacity) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Số khách vượt quá sức chứa của phòng (${capacity} khách)`,
      });
    }

    if (!Number.isFinite(price) || price < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Giá phòng không hợp lệ",
      });
    }

    if (room.status === "maintenance") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Phòng đang bảo trì, không thể đặt",
      });
    }

    const overlap = await hasDateOverlap(client, roomId, check_in, check_out);

    if (overlap) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Phòng đã có booking trùng khoảng thời gian này",
      });
    }

    const subtotal = nights * price;

    // Re-validated fully server-side, inside this same transaction, even
    // though the frontend already called /coupons/validate once — that
    // earlier check could be stale (coupon deactivated, expired, or its
    // last usage slot taken by another booking in the meantime). The
    // FOR UPDATE lock inside applyCouponForBooking is what makes the
    // usage_limit check race-safe across two concurrent createBooking calls.
    let couponId = null;
    let discountAmount = 0;
    if (coupon_code) {
      try {
        const applied = await applyCouponForBooking(client, coupon_code, subtotal);
        couponId = applied.couponId;
        discountAmount = applied.discountAmount;
      } catch (couponErr) {
        await client.query("ROLLBACK");
        const status = couponErr?.status || 500;
        const message = couponErr?.message || "Lỗi server khi áp dụng mã giảm giá";
        return res.status(status).json({ message });
      }
    }

    const total_price = subtotal - discountAmount;

    // Nothing left to pay (a 100% coupon): there is no payment step to wait
    // for, so the booking is confirmed straight away instead of sitting in
    // "pending" until it expires.
    const isFree = total_price <= 0;
    // A booking entered by an admin for a guest in front of them is confirmed
    // on the spot (no payment countdown); the admin says whether it was paid.
    const confirmedNow = isFree || Boolean(guest);
    const status = confirmedNow ? "confirmed" : "pending";
    const paymentStatus = isFree || guest?.paid ? "paid" : "unpaid";
    const expiresAt = confirmedNow
      ? null
      : new Date(Date.now() + getPendingBookingTtlMinutes() * 60 * 1000);

    const result = await client.query(
      `
      INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, expires_at, coupon_id, discount_amount, payment_status, language, guest_name, guest_phone, guest_email)
      VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
      `,
      [
        user_id, roomId, check_in, check_out, total_price, guestCount, status, expiresAt,
        couponId, discountAmount, paymentStatus, requestLanguage(req),
        guest?.name ?? null, guest?.phone ?? null, guest?.email ?? null,
      ]
    );

    await syncRoomStatus(client, roomId);

    await client.query("COMMIT");

    // Only emitted after COMMIT succeeds — admins must never be notified
    // about a booking that could still have rolled back.
    emitBookingCreated({
      id: result.rows[0].id,
      room_id: result.rows[0].room_id,
      room_name: room.room_name,
      check_in: result.rows[0].check_in,
      check_out: result.rows[0].check_out,
      total_price: result.rows[0].total_price,
      status: result.rows[0].status,
      created_at: result.rows[0].created_at,
    });
    notifyBooking(status === "confirmed" ? "confirmed" : "received", result.rows[0].id);

    res.status(201).json({
      message: "Đặt phòng thành công",
      booking: result.rows[0],
      total_price,
      subtotal,
      discount_amount: discountAmount,
      nights,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");

    // The database's own no-overlap constraint caught what the check above
    // could not see (it is the backstop, not the normal path).
    if (err.code === EXCLUSION_VIOLATION) {
      return res.status(400).json({
        message: "Phòng đã có booking trùng khoảng thời gian này",
      });
    }

    console.error("CREATE BOOKING ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi tạo booking" });
  } finally {
    if (client) client.release();
  }
};

exports.updateBookingStatus = async (req, res) => {
  const id = parseId(req.params.id);
  const { status } = req.body;

  if (!id) {
    return res.status(400).json({ message: "Booking id must be a positive integer" });
  }

  const allowStatus = ["pending", "confirmed", "cancelled", "completed"];

  if (!allowStatus.includes(status)) {
    return res.status(400).json({ message: "Trạng thái booking không hợp lệ" });
  }

  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT * FROM bookings WHERE id = $1 FOR UPDATE",
      [id]
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy booking" });
    }

    const current = existing.rows[0];
    const currentStatus = current.status;

    if (currentStatus !== status && !STATUS_TRANSITIONS[currentStatus]?.includes(status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Không thể chuyển trạng thái từ "${currentStatus}" sang "${status}"`,
      });
    }

    let booking;
    let owesRefund = false;

    if (status === "cancelled" && currentStatus !== "cancelled") {
      ({ booking, owesRefund } = await cancelBookingRow(client, current, { byAdmin: true }));
    } else {
      const result = await client.query(
        `
        UPDATE bookings
        SET status = $1::text, expires_at = CASE WHEN $1::text = 'pending' THEN expires_at ELSE NULL END
        WHERE id = $2
        RETURNING *
        `,
        [status, id]
      );
      booking = result.rows[0];
      await syncRoomStatus(client, booking.room_id);
    }

    await client.query("COMMIT");

    if (owesRefund) notifyRefundPending(booking);
    if (status !== currentStatus && (status === "confirmed" || status === "cancelled")) {
      notifyBooking(status, booking.id);
    }

    res.json({
      message: "Cập nhật trạng thái thành công",
      booking,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("UPDATE BOOKING ERROR:", err);
    res.status(500).json({ message: "Lỗi server" });
  } finally {
    if (client) client.release();
  }
};

exports.cancelBooking = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Booking id must be a positive integer" });
  }
  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Locked, so a payment callback or an admin status change for the same
    // booking waits for this to finish instead of racing it.
    const existing = await client.query(
      "SELECT * FROM bookings WHERE id = $1 FOR UPDATE",
      [id]
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy booking" });
    }

    const booking = existing.rows[0];
    const isAdmin = req.user.role === "admin";

    if (!isAdmin && booking.user_id !== req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Bạn không có quyền hủy booking này",
      });
    }

    if (!["pending", "confirmed"].includes(booking.status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Chỉ có thể hủy booking đang pending hoặc confirmed",
      });
    }

    // The free-cancellation window only matters once money has changed
    // hands; an unpaid booking can always be dropped. Admins are not bound
    // by it (they are the ones a late guest is told to contact).
    const freeDays = await getFreeCancellationDays();
    const daysUntilCheckIn = daysBetween(todayInAppTimezone(), String(booking.check_in).slice(0, 10));
    if (!isAdmin && booking.payment_status === "paid" && daysUntilCheckIn < freeDays) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        code: "CANCELLATION_WINDOW_PASSED",
        message:
          `Booking đã thanh toán chỉ được hủy miễn phí trước ngày nhận phòng ít nhất ${freeDays} ngày. ` +
          "Vui lòng liên hệ cơ sở lưu trú để được hỗ trợ.",
      });
    }

    const cancelled = await cancelBookingRow(client, booking, { byAdmin: isAdmin });

    await client.query("COMMIT");

    if (cancelled.owesRefund) notifyRefundPending(cancelled.booking);
    notifyBooking("cancelled", cancelled.booking.id);

    res.json({
      message: cancelled.owesRefund
        ? "Hủy đặt phòng thành công. Khoản thanh toán sẽ được hoàn lại sau khi cơ sở lưu trú xác nhận."
        : "Hủy đặt phòng thành công",
      booking: cancelled.booking,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("CANCEL BOOKING ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi hủy booking" });
  } finally {
    if (client) client.release();
  }
};

// Admin records money received outside the online gateways (cash or bank
// transfer at the desk). A booking still waiting for payment is confirmed by
// this, the same way a successful online payment would confirm it.
exports.markBookingPaid = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Booking id must be a positive integer" });
  }
  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT * FROM bookings WHERE id = $1 FOR UPDATE",
      [id]
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy booking" });
    }

    const booking = existing.rows[0];

    if (booking.status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Không thể ghi nhận thanh toán cho booking đã hủy" });
    }

    if (!["unpaid", "pending", "failed"].includes(booking.payment_status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Booking này đã được ghi nhận thanh toán" });
    }

    const result = await client.query(
      `
      UPDATE bookings
      SET payment_status = 'paid',
          status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
          expires_at = NULL
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    // An online attempt still open for this booking is now moot.
    await client.query(
      "UPDATE payments SET status = 'cancelled', updated_at = NOW() WHERE booking_id = $1 AND status = 'pending'",
      [id]
    );

    await syncRoomStatus(client, booking.room_id);
    await client.query("COMMIT");

    notifyBooking("confirmed", id);

    res.json({ message: "Đã ghi nhận thanh toán", booking: result.rows[0] });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("MARK BOOKING PAID ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi ghi nhận thanh toán" });
  } finally {
    if (client) client.release();
  }
};

// Admin confirms the money has actually been sent back to the guest (refunds
// are made by hand, outside the app).
exports.confirmRefund = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Booking id must be a positive integer" });
  }

  try {
    const result = await pool.query(
      `
      UPDATE bookings
      SET payment_status = 'refunded', refunded_at = NOW()
      WHERE id = $1 AND payment_status = 'refund_pending'
      RETURNING *
      `,
      [id]
    );

    if (result.rows.length === 0) {
      const existing = await pool.query("SELECT id FROM bookings WHERE id = $1", [id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ message: "Không tìm thấy booking" });
      }
      return res.status(400).json({ message: "Booking này không ở trạng thái chờ hoàn tiền" });
    }

    res.json({ message: "Đã xác nhận hoàn tiền", booking: result.rows[0] });
  } catch (err) {
    console.error("CONFIRM REFUND ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi xác nhận hoàn tiền" });
  }
};

function parseYearMonth(yearRaw, monthRaw) {
  const [todayYear, todayMonth] = todayInAppTimezone().split("-").map(Number);
  const year = yearRaw === undefined ? todayYear : Number(yearRaw);
  const month = monthRaw === undefined ? todayMonth : Number(monthRaw);

  if (!Number.isInteger(year) || year < 2000 || year > 2200) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;

  return { year, month };
}

function formatDateOnly(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// node-postgres parses SQL DATE columns into a JS Date object built from
// *local* y/m/d components (not UTC) — reading it back with local getters
// round-trips the original calendar date correctly; reading it with UTC
// getters or toISOString() can land on the wrong day depending on the
// server's timezone offset. Comparing the raw Date object against a plain
// "YYYY-MM-DD" string (as this endpoint used to) is worse still: it coerces
// into a NaN comparison that's always false, silently matching every day.
function toDateOnlyString(value) {
  if (value instanceof Date) {
    return formatDateOnly(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  return String(value).slice(0, 10);
}

// One room's calendar for one month, pre-aggregated server-side (day ->
// status) so the frontend never has to expand raw booking ranges itself —
// with ~390 rooms in the system, a naive "load every room's bookings and
// figure it out client-side" approach doesn't scale, so this only ever
// queries the one room + one month range actually being viewed.
exports.getBookingCalendar = async (req, res) => {
  try {
    const roomId = parseId(req.query.roomId);
    if (!roomId) {
      return res.status(400).json({ message: "roomId là bắt buộc và phải là số nguyên dương" });
    }

    const parsed = parseYearMonth(req.query.year, req.query.month);
    if (!parsed) {
      return res.status(400).json({ message: "year/month không hợp lệ" });
    }
    const { year, month } = parsed;

    const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    const monthStart = formatDateOnly(year, month, 1);
    const monthEndExclusive = formatDateOnly(nextMonth.year, nextMonth.month, 1);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    await runBookingMaintenance();

    const roomResult = await pool.query(
      "SELECT id, room_name, location FROM rooms WHERE id = $1",
      [roomId]
    );
    if (roomResult.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy phòng" });
    }

    const bookingsResult = await pool.query(
      `SELECT b.id, b.check_in, b.check_out, b.status, b.guests, b.total_price,
              u.name AS user_name, u.email AS user_email
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.room_id = $1 AND b.check_in < $3::date AND b.check_out > $2::date
       ORDER BY b.id ASC`,
      [roomId, monthStart, monthEndExclusive]
    );

    const days = {};
    const bookings = bookingsResult.rows.map((booking) => ({
      ...booking,
      check_in: toDateOnlyString(booking.check_in),
      check_out: toDateOnlyString(booking.check_out),
    }));

    for (const booking of bookings) {
      const start = booking.check_in > monthStart ? booking.check_in : monthStart;
      const end = booking.check_out < monthEndExclusive ? booking.check_out : monthEndExclusive;

      for (let d = new Date(`${start}T00:00:00Z`); d < new Date(`${end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        // An active booking always owns its nights; a cancelled or completed
        // one only shows on nights nothing active covers.
        const isActive = ACTIVE_STATUSES.includes(booking.status);
        const current = days[key];
        if (!current || isActive || !ACTIVE_STATUSES.includes(current.status)) {
          days[key] = { status: booking.status, bookingId: booking.id };
        }
      }
    }

    res.json({
      room: roomResult.rows[0],
      year,
      month,
      daysInMonth,
      days,
      bookings,
    });
  } catch (err) {
    console.error("GET BOOKING CALENDAR ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi lấy dữ liệu lịch" });
  }
};

exports.deleteBooking = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "Booking id must be a positive integer" });
  }
  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const bookingCheck = await client.query(
      "SELECT * FROM bookings WHERE id = $1 FOR UPDATE",
      [id]
    );

    if (bookingCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy booking để xóa" });
    }

    const booking = bookingCheck.rows[0];

    // Deleting a booking also deletes its payment rows (ON DELETE CASCADE).
    // Once money has moved, that trail has to stay: cancel instead.
    const moneyTrail = await client.query(
      "SELECT 1 FROM payments WHERE booking_id = $1 AND status = 'success' LIMIT 1",
      [id]
    );
    if (
      moneyTrail.rows.length > 0 ||
      ["paid", "refund_pending", "refunded"].includes(booking.payment_status)
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Không thể xóa booking đã có thanh toán. Hãy hủy booking thay vì xóa.",
      });
    }

    const result = await client.query(
      "DELETE FROM bookings WHERE id = $1 RETURNING *",
      [id]
    );

    // A booking that was still holding its coupon slot gives it back.
    if (ACTIVE_STATUSES.includes(booking.status)) {
      await releaseCoupon(client, booking.coupon_id);
    }

    await syncRoomStatus(client, booking.room_id);

    await client.query("COMMIT");

    res.json({
      message: "Xóa booking thành công",
      booking: result.rows[0],
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("DELETE BOOKING ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi xóa booking" });
  } finally {
    if (client) client.release();
  }
};
