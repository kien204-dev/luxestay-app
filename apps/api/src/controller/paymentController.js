const crypto = require("node:crypto");
const pool = require("../db/db.js");
const {
  hasDateOverlap,
  syncRoomStatus,
  REFUND_REASONS,
  EXCLUSION_VIOLATION,
} = require("./bookingController.js");
const { reclaimCoupon } = require("./couponController.js");
const vnpayService = require("../services/vnpayService.js");
const momoService = require("../services/momoService.js");
const { notifyRefundPending, notifyDuplicatePayment } = require("../services/adminAlerts.js");
const { notifyBooking } = require("../services/bookingEmails.js");
const { todayInAppTimezone } = require("../utils/time.js");

// Read per request, not at load time, so the list follows the environment.
function getEnabledProviders() {
  return momoService.isMomoEnabled() ? ["vnpay", "momo"] : ["vnpay"];
}

// Public: lets the web app show only the payment buttons that will work.
exports.getPaymentProviders = (req, res) => {
  res.json({ providers: getEnabledProviders() });
};

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// What the guest sees as the payment description at the gateway. VNPay only
// accepts unaccented Vietnamese without special characters, so this is kept
// to plain letters, digits and spaces (no "#", no brand name that might
// carry accents or punctuation).
function buildOrderInfo(bookingId) {
  return `Thanh toan dat phong ${bookingId}`;
}
exports.buildOrderInfo = buildOrderInfo;

function generateTransactionRef(bookingId) {
  const random = crypto.randomBytes(3).toString("hex");
  return `LX${bookingId}${Date.now()}${random}`.toUpperCase();
}

// User initiates an online payment for one of their own bookings that still
// has money owed: waiting for payment, or already confirmed by the admin but
// not paid yet.
exports.createPayment = async (req, res) => {
  const bookingId = parseId(req.params.id);
  const { provider } = req.body;

  if (!bookingId) {
    return res.status(400).json({ message: "Booking id must be a positive integer" });
  }

  if (!getEnabledProviders().includes(provider)) {
    return res.status(400).json({ message: "Cổng thanh toán không hợp lệ" });
  }

  let client;
  let booking;
  let transactionRef;
  let amount;

  // Step 1: record the attempt. Committed before any gateway is contacted, so
  // no row lock or transaction is held open across a network call.
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const bookingResult = await client.query(
      "SELECT * FROM bookings WHERE id = $1 FOR UPDATE",
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Không tìm thấy booking" });
    }

    booking = bookingResult.rows[0];

    if (req.user.role !== "admin" && booking.user_id !== req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Bạn không có quyền thanh toán booking này" });
    }

    if (!["pending", "confirmed"].includes(booking.status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Không thể thanh toán booking đang ở trạng thái "${booking.status}"`,
      });
    }

    if (!["unpaid", "pending", "failed"].includes(booking.payment_status)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Booking này đã được thanh toán" });
    }

    amount = Number(booking.total_price);
    if (!Number.isFinite(amount) || amount <= 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Booking này không có khoản nào cần thanh toán" });
    }

    // Only one payment attempt should be "live" per booking at a time.
    await client.query(
      "UPDATE payments SET status = 'cancelled', updated_at = NOW() WHERE booking_id = $1 AND status = 'pending'",
      [bookingId]
    );

    transactionRef = generateTransactionRef(bookingId);

    await client.query(
      `INSERT INTO payments (booking_id, provider, transaction_ref, amount, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [bookingId, provider, transactionRef, amount]
    );

    await client.query(
      "UPDATE bookings SET payment_status = 'pending' WHERE id = $1",
      [bookingId]
    );

    await client.query("COMMIT");
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("CREATE PAYMENT ERROR:", err);
    return res.status(500).json({ message: "Lỗi server khi tạo yêu cầu thanh toán" });
  } finally {
    if (client) client.release();
  }

  // Step 2: ask the gateway for a pay URL.
  try {
    const orderInfo = buildOrderInfo(bookingId);
    let payUrl;

    if (provider === "vnpay") {
      payUrl = vnpayService.buildVnpayPayUrl({
        amount,
        transactionRef,
        orderInfo,
        ipAddr: req.ip,
        expiresAt: booking.expires_at ? new Date(booking.expires_at) : null,
      });
    } else {
      payUrl = await momoService.createMomoPayUrl({ amount, transactionRef, orderInfo });
    }

    return res.status(201).json({
      message: "Đã tạo yêu cầu thanh toán",
      payUrl,
      transactionRef,
    });
  } catch (err) {
    console.error("CREATE PAYMENT GATEWAY ERROR:", err);

    // The guest never reached the gateway, so this attempt is dead: close it
    // and let them try again.
    try {
      await pool.query(
        "UPDATE payments SET status = 'failed', updated_at = NOW() WHERE transaction_ref = $1 AND status = 'pending'",
        [transactionRef]
      );
      await pool.query(
        "UPDATE bookings SET payment_status = 'failed' WHERE id = $1 AND payment_status = 'pending'",
        [bookingId]
      );
    } catch (cleanupErr) {
      console.error("CREATE PAYMENT CLEANUP ERROR:", cleanupErr);
    }

    return res.status(502).json({ message: "Không kết nối được cổng thanh toán. Vui lòng thử lại." });
  }
};

// Latest payment attempt for a booking, used by the frontend result page
// (polling) and MyBookings to show payment status.
exports.getPaymentForBooking = async (req, res) => {
  const bookingId = parseId(req.params.id);

  if (!bookingId) {
    return res.status(400).json({ message: "Booking id must be a positive integer" });
  }

  try {
    const bookingResult = await pool.query("SELECT * FROM bookings WHERE id = $1", [bookingId]);

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy booking" });
    }

    if (req.user.role !== "admin" && bookingResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ message: "Bạn không có quyền xem thanh toán của booking này" });
    }

    const result = await pool.query(
      `SELECT id, provider, transaction_ref, status, amount, currency, created_at, updated_at
       FROM payments WHERE booking_id = $1 ORDER BY id DESC LIMIT 1`,
      [bookingId]
    );

    res.json({ payment: result.rows[0] || null });
  } catch (err) {
    console.error("GET PAYMENT ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi lấy trạng thái thanh toán" });
  }
};

// Looked up by the frontend's payment-result page, which only has the
// gateway's correlation id (vnp_TxnRef / MoMo orderId) from the return-URL
// query params — those params are informational only (not signature
// verified), so this endpoint returns the server's own verified status
// rather than trusting anything the client passed in the URL.
exports.getPaymentByTransactionRef = async (req, res) => {
  const { ref } = req.params;

  if (!ref) {
    return res.status(400).json({ message: "Thiếu mã giao dịch" });
  }

  try {
    const result = await pool.query(
      `SELECT p.id, p.booking_id, p.provider, p.transaction_ref, p.status,
              p.amount, p.currency, p.created_at, p.updated_at,
              b.user_id AS booking_user_id, b.status AS booking_status,
              b.payment_status AS booking_payment_status
       FROM payments p
       JOIN bookings b ON b.id = p.booking_id
       WHERE p.transaction_ref = $1`,
      [ref]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy giao dịch" });
    }

    const row = result.rows[0];

    if (req.user.role !== "admin" && row.booking_user_id !== req.user.id) {
      return res.status(403).json({ message: "Bạn không có quyền xem giao dịch này" });
    }

    res.json({
      payment: {
        id: row.id,
        booking_id: row.booking_id,
        provider: row.provider,
        transaction_ref: row.transaction_ref,
        status: row.status,
        amount: row.amount,
        currency: row.currency,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      bookingStatus: row.booking_status,
      bookingPaymentStatus: row.booking_payment_status,
    });
  } catch (err) {
    console.error("GET PAYMENT BY REF ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi lấy trạng thái thanh toán" });
  }
};

// A cancelled or expired booking gets its room back only if the room is
// still bookable for those nights: not under maintenance, stay not over, and
// no other active booking on any of the nights. Caller holds the room lock.
async function canReviveBooking(client, booking) {
  const checkOut = String(booking.check_out).slice(0, 10);
  if (checkOut <= todayInAppTimezone()) return false;

  const room = await client.query(
    "SELECT status FROM rooms WHERE id = $1 FOR UPDATE",
    [booking.room_id]
  );
  if (room.rows.length === 0 || room.rows[0].status === "maintenance") return false;

  const taken = await hasDateOverlap(
    client,
    booking.room_id,
    String(booking.check_in).slice(0, 10),
    checkOut,
    booking.id
  );
  return !taken;
}

// Money has verifiably arrived for this booking. What that means depends on
// where the booking is by now. Returns what the admin should be told about,
// if anything.
async function applySuccessfulPayment(client, booking) {
  // Normal case: the guest paid while the booking was waiting.
  if (booking.status === "pending") {
    await client.query(
      "UPDATE bookings SET status = 'confirmed', payment_status = 'paid', expires_at = NULL WHERE id = $1",
      [booking.id]
    );
    await syncRoomStatus(client, booking.room_id);
    return { outcome: "confirmed" };
  }

  // Already confirmed by the admin (pay-later) or the stay is over.
  if (booking.status === "confirmed" || booking.status === "completed") {
    await client.query("UPDATE bookings SET payment_status = 'paid' WHERE id = $1", [booking.id]);
    return { outcome: "paid" };
  }

  // Cancelled: the booking expired or was cancelled while the guest was on
  // the gateway's page. Give the room back if it is still free; otherwise the
  // money has to go back.
  let revived = false;
  if (await canReviveBooking(client, booking)) {
    await client.query("SAVEPOINT revive_booking");
    try {
      await client.query(
        `UPDATE bookings
         SET status = 'confirmed', payment_status = 'paid', expires_at = NULL,
             cancelled_at = NULL, refund_reason = NULL
         WHERE id = $1`,
        [booking.id]
      );
      revived = true;
    } catch (err) {
      // The database's no-overlap constraint saw a booking the check missed.
      if (err.code !== EXCLUSION_VIOLATION) throw err;
      await client.query("ROLLBACK TO SAVEPOINT revive_booking");
    }
  }

  if (revived) {
    // Its coupon slot was handed back when it was cancelled; take it again.
    await reclaimCoupon(client, booking.coupon_id);
    await syncRoomStatus(client, booking.room_id);
    return { outcome: "revived" };
  }

  const result = await client.query(
    `UPDATE bookings
     SET payment_status = 'refund_pending', refund_reason = $2
     WHERE id = $1
     RETURNING *`,
    [booking.id, REFUND_REASONS.paidAfterCancellation]
  );
  return { outcome: "refund_pending", booking: result.rows[0] };
}

// Shared by both gateways' callbacks once the signature has been verified.
// Returns { code } describing what happened; each gateway maps that onto its
// own response format.
async function settlePayment({ transactionRef, receivedAmount, isSuccess, providerTransactionId, raw }) {
  let client;
  let afterCommit = null;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Lock order is booking first, then payment — the same order
    // createPayment uses — so the two can never deadlock each other.
    const lookup = await client.query(
      "SELECT booking_id FROM payments WHERE transaction_ref = $1",
      [transactionRef]
    );
    if (lookup.rows.length === 0) {
      await client.query("ROLLBACK");
      return { code: "not_found" };
    }

    const bookingResult = await client.query(
      "SELECT * FROM bookings WHERE id = $1 FOR UPDATE",
      [lookup.rows[0].booking_id]
    );
    const paymentResult = await client.query(
      "SELECT * FROM payments WHERE transaction_ref = $1 FOR UPDATE",
      [transactionRef]
    );
    const booking = bookingResult.rows[0];
    const payment = paymentResult.rows[0];

    if (Math.round(Number(receivedAmount)) !== Math.round(Number(payment.amount))) {
      await client.query("ROLLBACK");
      return { code: "amount_mismatch" };
    }

    // A callback repeated by the gateway: already recorded, nothing to redo.
    if (payment.status === "success" || payment.status === "failed") {
      await client.query("ROLLBACK");
      return { code: "already_processed" };
    }

    // Past this point the attempt is "pending", or "cancelled" because the
    // guest started a newer attempt — and then paid this one anyway.
    const wasLiveAttempt = payment.status === "pending";
    await client.query(
      `UPDATE payments SET status = $1, provider_transaction_id = $2, raw_callback = $3, updated_at = NOW()
       WHERE id = $4`,
      [isSuccess ? "success" : "failed", providerTransactionId, JSON.stringify(raw), payment.id]
    );

    if (!isSuccess) {
      // Only the live attempt failing changes what the booking shows.
      if (wasLiveAttempt) {
        await client.query(
          "UPDATE bookings SET payment_status = 'failed' WHERE id = $1 AND payment_status = 'pending'",
          [booking.id]
        );
      }
    } else if (["paid", "refund_pending", "refunded"].includes(booking.payment_status)) {
      // The booking was already paid for by another attempt: this money is
      // extra and has to be returned by hand.
      afterCommit = () => notifyDuplicatePayment(booking, { ...payment, status: "success" });
    } else {
      const applied = await applySuccessfulPayment(client, booking);
      if (applied.outcome === "refund_pending") {
        afterCommit = () => notifyRefundPending(applied.booking);
      } else {
        afterCommit = () => notifyBooking("confirmed", booking.id);
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    throw err;
  } finally {
    if (client) client.release();
  }

  // Admins are only told once the outcome is durable.
  if (afterCommit) afterCommit();
  return { code: "ok" };
}

// VNPay calls this server-to-server (GET, query params). The response body
// shape (RspCode/Message) is dictated by VNPay's protocol, not our own API
// convention — VNPay retries the IPN if it doesn't get a recognized ack.
exports.vnpayIpn = async (req, res) => {
  try {
    const { valid, params } = vnpayService.verifyVnpaySignature(req.query);

    if (!valid) {
      return res.json({ RspCode: "97", Message: "Invalid signature" });
    }

    const result = await settlePayment({
      transactionRef: params.vnp_TxnRef,
      receivedAmount: Number(params.vnp_Amount) / 100,
      isSuccess: params.vnp_ResponseCode === "00" && params.vnp_TransactionStatus === "00",
      providerTransactionId: params.vnp_TransactionNo || null,
      raw: params,
    });

    const responses = {
      ok: { RspCode: "00", Message: "Confirm Success" },
      not_found: { RspCode: "01", Message: "Order not found" },
      already_processed: { RspCode: "02", Message: "Order already confirmed" },
      amount_mismatch: { RspCode: "04", Message: "Invalid amount" },
    };
    return res.json(responses[result.code]);
  } catch (err) {
    console.error("VNPAY IPN ERROR:", err);
    return res.json({ RspCode: "99", Message: "Unknown error" });
  }
};

// MoMo calls this server-to-server (POST, JSON body). MoMo does not mandate
// a specific ack body — any 2xx means "received", so we use our own
// {message} convention rather than mirroring VNPay's RspCode format.
exports.momoIpn = async (req, res) => {
  if (!momoService.isMomoEnabled()) {
    return res.status(404).json({ message: "MoMo payments are not enabled" });
  }

  try {
    const { valid } = momoService.verifyMomoSignature(req.body);

    if (!valid) {
      return res.status(400).json({ message: "Invalid signature" });
    }

    const result = await settlePayment({
      transactionRef: req.body.orderId,
      receivedAmount: Number(req.body.amount),
      isSuccess: Number(req.body.resultCode) === 0,
      providerTransactionId: req.body.transId ? String(req.body.transId) : null,
      raw: req.body,
    });

    if (result.code === "not_found") {
      return res.status(404).json({ message: "Order not found" });
    }
    if (result.code === "amount_mismatch") {
      return res.status(400).json({ message: "Invalid amount" });
    }
    return res.status(204).end();
  } catch (err) {
    console.error("MOMO IPN ERROR:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
