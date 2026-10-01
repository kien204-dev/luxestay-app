const pool = require("../db/db.js");
const { getPropertySettings } = require("../services/propertySettings");

const MAX_COMMENT_LENGTH = 2000;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseRating(value) {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

function parsePositiveInteger(value, fallback) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

// "Nguyễn Văn An" -> "Nguyễn V. A." — keeps the reviewer recognizable
// without publishing a stranger's full name next to a public comment.
function maskReviewerName(name, propertyName) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return `Khách ${propertyName}`;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts.slice(1).map((p) => `${p[0].toUpperCase()}.`).join(" ")}`;
}

// ======================
// CREATE REVIEW
// ======================
exports.createReview = async (req, res) => {
  try {
    const roomId = parseId(req.params.id);
    if (!roomId) {
      return res.status(400).json({ message: "Room id must be a positive integer" });
    }

    const bookingId = parseId(req.body.booking_id);
    if (!bookingId) {
      return res.status(400).json({ message: "booking_id là bắt buộc và phải là số nguyên dương" });
    }

    const rating = parseRating(req.body.rating);
    if (!rating) {
      return res.status(400).json({ message: "rating là bắt buộc và phải là số nguyên từ 1 đến 5" });
    }

    const commentRaw = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
    if (commentRaw.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({
        message: `Bình luận không được vượt quá ${MAX_COMMENT_LENGTH} ký tự`,
      });
    }
    const comment = commentRaw || null;

    // Validate the booking chặt ở backend: phải thuộc về user gọi API, phải
    // đúng phòng đang đánh giá, và phải đã hoàn tất kỳ lưu trú — không chỉ
    // ẩn nút trên UI, vì request có thể được gửi thẳng tới API.
    const bookingResult = await pool.query(
      "SELECT id, user_id, room_id, status FROM bookings WHERE id = $1",
      [bookingId]
    );
    const booking = bookingResult.rows[0];

    if (!booking) {
      return res.status(404).json({ message: "Không tìm thấy đặt phòng" });
    }
    if (booking.user_id !== req.user.id) {
      return res.status(403).json({ message: "Đặt phòng này không thuộc về bạn" });
    }
    if (booking.room_id !== roomId) {
      return res.status(400).json({ message: "Đặt phòng này không thuộc phòng đang đánh giá" });
    }
    if (booking.status !== "completed") {
      return res.status(400).json({ message: "Chỉ có thể đánh giá sau khi đã hoàn tất kỳ lưu trú" });
    }

    const existingReview = await pool.query(
      "SELECT id FROM room_reviews WHERE booking_id = $1",
      [bookingId]
    );
    if (existingReview.rows.length > 0) {
      return res.status(409).json({ message: "Đặt phòng này đã được đánh giá rồi" });
    }

    let result;
    try {
      result = await pool.query(
        `INSERT INTO room_reviews (room_id, user_id, booking_id, rating, comment)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, room_id, user_id, booking_id, rating, comment, is_hidden, created_at`,
        [roomId, req.user.id, bookingId, rating, comment]
      );
    } catch (err) {
      // Defensive fallback against the UNIQUE(booking_id) constraint for a
      // racing duplicate submit — surface a clean message, not a raw SQL error.
      if (err.code === "23505") {
        return res.status(409).json({ message: "Đặt phòng này đã được đánh giá rồi" });
      }
      throw err;
    }

    res.status(201).json({
      message: "Cảm ơn bạn đã đánh giá!",
      review: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================
// GET ROOM REVIEWS (public)
// ======================
exports.getRoomReviews = async (req, res) => {
  try {
    const roomId = parseId(req.params.id);
    if (!roomId) {
      return res.status(400).json({ message: "Room id must be a positive integer" });
    }

    const page = parsePositiveInteger(req.query.page, 1);
    const limit = Math.min(parsePositiveInteger(req.query.limit, 10), 50);
    const offset = (page - 1) * limit;

    const statsResult = await pool.query(
      `SELECT COUNT(*)::int AS total, COALESCE(AVG(rating), 0) AS average
       FROM room_reviews
       WHERE room_id = $1 AND is_hidden = false`,
      [roomId]
    );
    const total = statsResult.rows[0].total;
    const average = Number(statsResult.rows[0].average);

    const result = await pool.query(
      `SELECT rv.id, rv.rating, rv.comment, rv.created_at, u.name AS user_name
       FROM room_reviews rv
       JOIN users u ON rv.user_id = u.id
       WHERE rv.room_id = $1 AND rv.is_hidden = false
       ORDER BY rv.created_at DESC
       LIMIT $2 OFFSET $3`,
      [roomId, limit, offset]
    );

    const propertyName = (await getPropertySettings()).name;

    res.json({
      data: result.rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        created_at: row.created_at,
        reviewer_name: maskReviewerName(row.user_name, propertyName),
      })),
      averageRating: Math.round(average * 10) / 10,
      totalReviews: total,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================
// ADMIN: LIST ALL REVIEWS (optionally filtered by room)
// ======================
exports.listReviews = async (req, res) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = Math.min(parsePositiveInteger(req.query.limit, 20), 100);
    const offset = (page - 1) * limit;

    const roomId = parseId(req.query.roomId);
    const filters = [];
    const values = [];
    if (roomId) {
      values.push(roomId);
      filters.push(`rv.room_id = $${values.length}`);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM room_reviews rv ${whereClause}`,
      values
    );
    const total = countResult.rows[0].total;

    const dataValues = [...values, limit, offset];
    const result = await pool.query(
      `SELECT rv.id, rv.room_id, rv.rating, rv.comment, rv.is_hidden, rv.created_at,
              r.room_name, u.name AS user_name, u.email AS user_email
       FROM room_reviews rv
       JOIN rooms r ON rv.room_id = r.id
       JOIN users u ON rv.user_id = u.id
       ${whereClause}
       ORDER BY rv.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      dataValues
    );

    res.json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================
// ADMIN: HIDE / UNHIDE REVIEW
// ======================
exports.hideReview = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Review id must be a positive integer" });
    }

    if (typeof req.body.hidden !== "boolean") {
      return res.status(400).json({ message: "hidden phải là true hoặc false" });
    }

    const result = await pool.query(
      `UPDATE room_reviews SET is_hidden = $1 WHERE id = $2
       RETURNING id, room_id, user_id, booking_id, rating, comment, is_hidden, created_at`,
      [req.body.hidden, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy đánh giá" });
    }

    res.json({
      message: req.body.hidden ? "Đã ẩn đánh giá" : "Đã hiện lại đánh giá",
      review: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
