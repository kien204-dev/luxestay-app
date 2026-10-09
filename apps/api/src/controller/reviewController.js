const pool = require("../db/db.js");
const { getPropertySettings } = require("../services/propertySettings");
const { apiMessage } = require("../utils/apiMessages");

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
      return res.status(400).json({ ...apiMessage("INVALID_ROOM_ID") });
    }

    const bookingId = parseId(req.body.booking_id);
    if (!bookingId) {
      return res.status(400).json({ ...apiMessage("INVALID_REVIEW_BOOKING") });
    }

    const rating = parseRating(req.body.rating);
    if (!rating) {
      return res.status(400).json({ ...apiMessage("INVALID_RATING") });
    }

    const commentRaw = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
    if (commentRaw.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({
        ...apiMessage("COMMENT_TOO_LONG", { max: MAX_COMMENT_LENGTH }),
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
      return res.status(404).json({ ...apiMessage("BOOKING_NOT_FOUND") });
    }
    if (booking.user_id !== req.user.id) {
      return res.status(403).json({ ...apiMessage("BOOKING_FORBIDDEN") });
    }
    if (booking.room_id !== roomId) {
      return res.status(400).json({ ...apiMessage("REVIEW_WRONG_ROOM") });
    }
    if (booking.status !== "completed") {
      return res.status(400).json({ ...apiMessage("REVIEW_TOO_EARLY") });
    }

    const existingReview = await pool.query(
      "SELECT id FROM room_reviews WHERE booking_id = $1",
      [bookingId]
    );
    if (existingReview.rows.length > 0) {
      return res.status(409).json({ ...apiMessage("ALREADY_REVIEWED") });
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
        return res.status(409).json({ ...apiMessage("ALREADY_REVIEWED") });
      }
      throw err;
    }

    res.status(201).json({
      ...apiMessage("REVIEW_THANKS"),
      review: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ...apiMessage("SERVER_ERROR") });
  }
};

// ======================
// GET ROOM REVIEWS (public)
// ======================
exports.getRoomReviews = async (req, res) => {
  try {
    const roomId = parseId(req.params.id);
    if (!roomId) {
      return res.status(400).json({ ...apiMessage("INVALID_ROOM_ID") });
    }

    const page = parsePositiveInteger(req.query.page, 1);
    const limit = Math.min(parsePositiveInteger(req.query.limit, 10), 50);
    const offset = (page - 1) * limit;

    const statsResult = await pool.query(
      `SELECT COUNT(*)::int AS total, COALESCE(AVG(rating), 0) AS average,
              COUNT(*) FILTER (WHERE rating = 5)::int AS r5,
              COUNT(*) FILTER (WHERE rating = 4)::int AS r4,
              COUNT(*) FILTER (WHERE rating = 3)::int AS r3,
              COUNT(*) FILTER (WHERE rating = 2)::int AS r2,
              COUNT(*) FILTER (WHERE rating = 1)::int AS r1
       FROM room_reviews
       WHERE room_id = $1 AND is_hidden = false`,
      [roomId]
    );
    const stats = statsResult.rows[0];
    const total = stats.total;
    const average = Number(stats.average);

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
      // How many visible reviews gave each number of stars.
      ratingCounts: { 5: stats.r5 || 0, 4: stats.r4 || 0, 3: stats.r3 || 0, 2: stats.r2 || 0, 1: stats.r1 || 0 },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ...apiMessage("SERVER_ERROR") });
  }
};

// ======================
// GET FEATURED REVIEWS (public, for the home page)
// ======================
// The score across every visible review, and a few of the best ones that
// have something to say: four stars or more, with a comment short enough to
// quote. Nothing here is written by the property.
const FEATURED_LIMIT = 5;
const FEATURED_MAX_COMMENT_LENGTH = 400;

exports.getFeaturedReviews = async (req, res) => {
  try {
    const statsResult = await pool.query(
      `SELECT COUNT(*)::int AS total, COALESCE(AVG(rating), 0) AS average
       FROM room_reviews
       WHERE is_hidden = false`
    );

    const result = await pool.query(
      `SELECT rv.id, rv.rating, rv.comment, rv.created_at, u.name AS user_name, r.room_name
       FROM room_reviews rv
       JOIN users u ON rv.user_id = u.id
       JOIN rooms r ON rv.room_id = r.id
       WHERE rv.is_hidden = false
         AND rv.rating >= 4
         AND char_length(btrim(COALESCE(rv.comment, ''))) BETWEEN 1 AND $1
       ORDER BY rv.rating DESC, rv.created_at DESC
       LIMIT $2`,
      [FEATURED_MAX_COMMENT_LENGTH, FEATURED_LIMIT]
    );

    const propertyName = (await getPropertySettings()).name;

    res.json({
      data: result.rows.map((row) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment.trim(),
        created_at: row.created_at,
        reviewer_name: maskReviewerName(row.user_name, propertyName),
        room_name: row.room_name,
      })),
      averageRating: Math.round(Number(statsResult.rows[0].average) * 10) / 10,
      totalReviews: statsResult.rows[0].total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ...apiMessage("SERVER_ERROR") });
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
    res.status(500).json({ ...apiMessage("SERVER_ERROR") });
  }
};

// ======================
// ADMIN: HIDE / UNHIDE REVIEW
// ======================
exports.hideReview = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ ...apiMessage("INVALID_REVIEW_ID") });
    }

    if (typeof req.body.hidden !== "boolean") {
      return res.status(400).json({ ...apiMessage("INVALID_HIDDEN_FLAG") });
    }

    const result = await pool.query(
      `UPDATE room_reviews SET is_hidden = $1 WHERE id = $2
       RETURNING id, room_id, user_id, booking_id, rating, comment, is_hidden, created_at`,
      [req.body.hidden, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ...apiMessage("REVIEW_NOT_FOUND") });
    }

    res.json({
      ...apiMessage(req.body.hidden ? "REVIEW_HIDDEN" : "REVIEW_SHOWN"),
      review: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ...apiMessage("SERVER_ERROR") });
  }
};
