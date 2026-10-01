const pool = require("../db/db.js");

const DISCOUNT_TYPES = new Set(["percent", "fixed"]);
const CODE_PATTERN = /^[A-Z0-9_-]{3,50}$/;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeCode(raw) {
  return String(raw || "").trim().toUpperCase();
}

function parsePositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseNonNegativeNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined; // undefined = invalid, distinct from "not provided"
}

function parseOptionalPositiveNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseOptionalPositiveInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

// Shared by both the standalone /validate endpoint (so the customer sees a
// live preview before booking) and createBooking (which re-derives the same
// numbers server-side rather than trusting whatever the validate call once
// returned — the two calls can be minutes apart and the coupon's state can
// change in between).
function evaluateCoupon(coupon, amount) {
  if (!coupon.is_active) {
    return { valid: false, message: "Mã giảm giá đã bị vô hiệu hóa" };
  }
  if (new Date(coupon.expires_at) < new Date()) {
    return { valid: false, message: "Mã giảm giá đã hết hạn" };
  }
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
    return { valid: false, message: "Mã giảm giá đã hết lượt sử dụng" };
  }
  if (coupon.min_booking_amount !== null && amount < Number(coupon.min_booking_amount)) {
    return {
      valid: false,
      message: `Đơn đặt phòng cần tối thiểu ${Number(coupon.min_booking_amount).toLocaleString("vi-VN")} đ để dùng mã này`,
    };
  }

  let discountAmount =
    coupon.discount_type === "percent"
      ? (amount * Number(coupon.discount_value)) / 100
      : Number(coupon.discount_value);

  if (coupon.max_discount_amount !== null) {
    discountAmount = Math.min(discountAmount, Number(coupon.max_discount_amount));
  }
  // A discount can never exceed the booking total itself.
  discountAmount = Math.min(discountAmount, amount);
  discountAmount = Math.round(discountAmount);

  return {
    valid: true,
    discountAmount,
    finalAmount: amount - discountAmount,
  };
}

// ======================
// VALIDATE (preview only — does not consume a usage slot)
// ======================
exports.validateCoupon = async (req, res) => {
  try {
    const code = normalizeCode(req.body.code);
    const amount = parseNonNegativeNumber(req.body.amount);

    if (!code) {
      return res.status(400).json({ valid: false, message: "Vui lòng nhập mã giảm giá" });
    }
    if (amount === undefined || amount === null) {
      return res.status(400).json({ valid: false, message: "Số tiền booking không hợp lệ" });
    }

    const result = await pool.query("SELECT * FROM coupons WHERE code = $1", [code]);
    const coupon = result.rows[0];

    if (!coupon) {
      return res.status(404).json({ valid: false, message: "Mã giảm giá không tồn tại" });
    }

    const evaluation = evaluateCoupon(coupon, amount);
    if (!evaluation.valid) {
      return res.status(400).json({ valid: false, message: evaluation.message });
    }

    res.json({
      valid: true,
      discountAmount: evaluation.discountAmount,
      finalAmount: evaluation.finalAmount,
      coupon: {
        code: coupon.code,
        discount_type: coupon.discount_type,
        discount_value: Number(coupon.discount_value),
      },
    });
  } catch (err) {
    console.error("VALIDATE COUPON ERROR:", err);
    res.status(500).json({ valid: false, message: "Lỗi server khi kiểm tra mã giảm giá" });
  }
};

// Used by bookingController.createBooking, inside its own transaction/client
// so the coupon row lock and the booking insert commit or roll back
// together. Returns { discountAmount, couponId } on success and throws a
// {status, message} object on failure so the caller can respond directly.
exports.applyCouponForBooking = async function applyCouponForBooking(client, rawCode, amount) {
  const code = normalizeCode(rawCode);
  if (!code) {
    throw { status: 400, message: "Mã giảm giá không hợp lệ" };
  }

  // FOR UPDATE locks the coupon row for the rest of this transaction — a
  // second concurrent booking using the same coupon blocks here until this
  // one commits or rolls back, then re-reads the now-current used_count.
  // This is the exact same row-locking pattern already used to stop two
  // bookings from double-booking a room (hasDateOverlap's FOR UPDATE).
  const result = await client.query("SELECT * FROM coupons WHERE code = $1 FOR UPDATE", [code]);
  const coupon = result.rows[0];

  if (!coupon) {
    throw { status: 404, message: "Mã giảm giá không tồn tại" };
  }

  const evaluation = evaluateCoupon(coupon, amount);
  if (!evaluation.valid) {
    throw { status: 400, message: evaluation.message };
  }

  await client.query("UPDATE coupons SET used_count = used_count + 1 WHERE id = $1", [coupon.id]);

  return { discountAmount: evaluation.discountAmount, couponId: coupon.id };
};

// ======================
// ADMIN: LIST
// ======================
exports.listCoupons = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM coupons ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    console.error("LIST COUPONS ERROR:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

function validateCouponPayload(body) {
  const code = normalizeCode(body.code);
  if (!CODE_PATTERN.test(code)) {
    return { error: "Mã giảm giá phải dài 3-50 ký tự, chỉ gồm chữ, số, gạch ngang hoặc gạch dưới" };
  }

  if (!DISCOUNT_TYPES.has(body.discount_type)) {
    return { error: "discount_type phải là 'percent' hoặc 'fixed'" };
  }

  const discountValue = parsePositiveNumber(body.discount_value);
  if (discountValue === null) {
    return { error: "discount_value phải là số dương" };
  }
  if (body.discount_type === "percent" && discountValue > 100) {
    return { error: "Giảm theo % không được vượt quá 100" };
  }

  const maxDiscountAmount = parseOptionalPositiveNumber(body.max_discount_amount);
  if (maxDiscountAmount === undefined) {
    return { error: "max_discount_amount phải là số dương hoặc để trống" };
  }

  const minBookingAmount = parseNonNegativeNumber(body.min_booking_amount);
  if (minBookingAmount === undefined) {
    return { error: "min_booking_amount phải là số không âm hoặc để trống" };
  }

  const expiresAt = body.expires_at ? new Date(body.expires_at) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
    return { error: "expires_at không hợp lệ" };
  }

  const usageLimit = parseOptionalPositiveInt(body.usage_limit);
  if (usageLimit === undefined) {
    return { error: "usage_limit phải là số nguyên dương hoặc để trống" };
  }

  return {
    value: {
      code,
      discount_type: body.discount_type,
      discount_value: discountValue,
      max_discount_amount: maxDiscountAmount,
      min_booking_amount: minBookingAmount,
      expires_at: expiresAt.toISOString(),
      usage_limit: usageLimit,
    },
  };
}

// ======================
// ADMIN: CREATE
// ======================
exports.createCoupon = async (req, res) => {
  try {
    const { error, value } = validateCouponPayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const result = await pool.query(
      `INSERT INTO coupons
         (code, discount_type, discount_value, max_discount_amount, min_booking_amount, expires_at, usage_limit)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        value.code,
        value.discount_type,
        value.discount_value,
        value.max_discount_amount,
        value.min_booking_amount,
        value.expires_at,
        value.usage_limit,
      ]
    );

    res.status(201).json({ message: "Tạo mã giảm giá thành công", coupon: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "Mã giảm giá này đã tồn tại" });
    }
    console.error("CREATE COUPON ERROR:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// ======================
// ADMIN: UPDATE
// ======================
exports.updateCoupon = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Coupon id must be a positive integer" });

    const { error, value } = validateCouponPayload(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const result = await pool.query(
      `UPDATE coupons
       SET code = $1, discount_type = $2, discount_value = $3, max_discount_amount = $4,
           min_booking_amount = $5, expires_at = $6, usage_limit = $7
       WHERE id = $8
       RETURNING *`,
      [
        value.code,
        value.discount_type,
        value.discount_value,
        value.max_discount_amount,
        value.min_booking_amount,
        value.expires_at,
        value.usage_limit,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy mã giảm giá" });
    }

    res.json({ message: "Cập nhật mã giảm giá thành công", coupon: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ message: "Mã giảm giá này đã tồn tại" });
    }
    console.error("UPDATE COUPON ERROR:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// ======================
// ADMIN: ACTIVATE / DEACTIVATE (soft toggle — same is_hidden-style pattern
// used for reviews, so a coupon's usage history and code stay intact)
// ======================
exports.setCouponActive = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Coupon id must be a positive integer" });

    if (typeof req.body.active !== "boolean") {
      return res.status(400).json({ message: "active phải là true hoặc false" });
    }

    const result = await pool.query(
      "UPDATE coupons SET is_active = $1 WHERE id = $2 RETURNING *",
      [req.body.active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy mã giảm giá" });
    }

    res.json({
      message: req.body.active ? "Đã kích hoạt mã giảm giá" : "Đã tắt mã giảm giá",
      coupon: result.rows[0],
    });
  } catch (err) {
    console.error("SET COUPON ACTIVE ERROR:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};
