const pool = require("../db/db.js");
const { applyCouponForBooking } = require("./couponController.js");
const { emitBookingCreated } = require("../services/socket.js");

const ACTIVE_STATUSES = ["pending", "confirmed"];
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

async function autoCompletePastBookings() {
  await pool.query(
    `UPDATE bookings SET status = 'completed' WHERE status = 'confirmed' AND check_out < CURRENT_DATE`
  );
}

function getPendingBookingTtlMinutes() {
  const ttl = Number(process.env.PENDING_BOOKING_TTL_MINUTES || 30);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 30;
}

// Bookings left "pending" past their expires_at never got confirmed/paid in
// time, so they're auto-cancelled and their room's cached status resynced —
// otherwise they'd block the room from being booked or shown as available
// indefinitely.
async function autoExpirePendingBookings() {
  const expired = await pool.query(
    `UPDATE bookings SET status = 'cancelled'
     WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()
     RETURNING room_id`
  );

  const roomIds = [...new Set(expired.rows.map((row) => row.room_id))];
  for (const roomId of roomIds) {
    await syncRoomStatus(pool, roomId);
  }
}

// Exposed so roomController's availability search can expire stale pending
// bookings before excluding rooms from the "still free" result set.
exports.autoExpirePendingBookings = autoExpirePendingBookings;

// Exposed so paymentController can resync a room's cached status after a
// verified payment callback confirms a booking, without duplicating this logic.
exports.syncRoomStatus = syncRoomStatus;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseDateOnly(dateStr) {
  if (typeof dateStr !== "string" || !DATE_ONLY_PATTERN.test(dateStr)) {
    return null;
  }

  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  const [year, month, day] = dateStr.split("-").map(Number);
  if (
    d.getFullYear() !== year ||
    d.getMonth() + 1 !== month ||
    d.getDate() !== day
  ) {
    return null;
  }

  return d;
}

function calculateNights(checkIn, checkOut) {
  const start = parseDateOnly(checkIn);
  const end = parseDateOnly(checkOut);
  if (!start || !end) return 0;
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
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
    AND check_out >= CURRENT_DATE
    LIMIT 1
    `,
    [roomId, ACTIVE_STATUSES]
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
    b.expires_at,
    b.created_at,
    b.coupon_id,
    b.discount_amount,
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

exports.getBookings = async (req, res) => {
  try {
    await autoCompletePastBookings();
    await autoExpirePendingBookings();

    const allowStatus = ["pending", "confirmed", "cancelled", "completed"];
    const { status, from, to, page, limit } = req.query;

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

exports.getBookingById = async (req, res) => {
  const id = parseId(req.params.id);

  if (!id) {
    return res.status(400).json({ message: "Booking id must be a positive integer" });
  }

  try {
    await autoCompletePastBookings();
    await autoExpirePendingBookings();

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
      message: "Phong khong hop le",
    });
  }

  if (!Number.isInteger(guestCount) || guestCount <= 0) {
    return res.status(400).json({
      message: "So khach phai lon hon 0",
    });
  }

  const checkInDate = parseDateOnly(check_in);
  const checkOutDate = parseDateOnly(check_out);

  if (!checkInDate || !checkOutDate) {
    return res.status(400).json({ message: "Ngày check-in/check-out không hợp lệ" });
  }

  const nights = calculateNights(check_in, check_out);

  if (nights <= 0) {
    return res.status(400).json({
      message: "Ngày check-out phải sau ngày check-in",
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (checkInDate < today) {
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
        message: `So khach vuot qua suc chua cua phong (${capacity} khach)`,
      });
    }

    if (!Number.isFinite(price) || price < 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: "Gia phong khong hop le",
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
    const expiresAt = new Date(Date.now() + getPendingBookingTtlMinutes() * 60 * 1000);

    const result = await client.query(
      `
      INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, expires_at, coupon_id, discount_amount)
      VALUES ($1, $2, $3::date, $4::date, $5, $6, 'pending', $7, $8, $9)
      RETURNING *
      `,
      [user_id, roomId, check_in, check_out, total_price, guestCount, expiresAt, couponId, discountAmount]
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

    const currentStatus = existing.rows[0].status;

    if (currentStatus !== status && !STATUS_TRANSITIONS[currentStatus]?.includes(status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Không thể chuyển trạng thái từ "${currentStatus}" sang "${status}"`,
      });
    }

    const result = await client.query(
      `
      UPDATE bookings
      SET status = $1::text, expires_at = CASE WHEN $1::text = 'pending' THEN expires_at ELSE NULL END
      WHERE id = $2
      RETURNING *
      `,
      [status, id]
    );

    const booking = result.rows[0];
    await syncRoomStatus(client, booking.room_id);

    await client.query("COMMIT");

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

    const existing = await client.query(
      "SELECT * FROM bookings WHERE id = $1",
      [id]
    );

    if (existing.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy booking" });
    }

    const booking = existing.rows[0];

    if (req.user.role !== "admin" && booking.user_id !== req.user.id) {
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

    const result = await client.query(
      `
      UPDATE bookings SET status = 'cancelled' WHERE id = $1 RETURNING *
      `,
      [id]
    );

    await syncRoomStatus(client, booking.room_id);

    await client.query("COMMIT");

    res.json({
      message: "Hủy đặt phòng thành công",
      booking: result.rows[0],
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("CANCEL BOOKING ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi hủy booking" });
  } finally {
    if (client) client.release();
  }
};

function parseYearMonth(yearRaw, monthRaw) {
  const now = new Date();
  const year = yearRaw === undefined ? now.getFullYear() : Number(yearRaw);
  const month = monthRaw === undefined ? now.getMonth() + 1 : Number(monthRaw);

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

    await autoCompletePastBookings();
    await autoExpirePendingBookings();

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
        // Bookings are iterated oldest-first, so a later (re-)booking for a
        // day a cancelled one used to occupy naturally wins the day's slot.
        days[key] = { status: booking.status, bookingId: booking.id };
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
      "SELECT * FROM bookings WHERE id = $1",
      [id]
    );

    if (bookingCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy booking để xóa" });
    }

    const booking = bookingCheck.rows[0];

    const result = await client.query(
      "DELETE FROM bookings WHERE id = $1 RETURNING *",
      [id]
    );

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
