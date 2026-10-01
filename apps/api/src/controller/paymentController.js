const crypto = require("node:crypto");
const pool = require("../db/db.js");
const { syncRoomStatus } = require("./bookingController.js");
const vnpayService = require("../services/vnpayService.js");
const momoService = require("../services/momoService.js");
const { APP_NAME } = require("../config/brand");

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

function generateTransactionRef(bookingId) {
  const random = crypto.randomBytes(3).toString("hex");
  return `LX${bookingId}${Date.now()}${random}`.toUpperCase();
}

async function confirmBookingAfterPayment(client, bookingId) {
  const result = await client.query(
    `UPDATE bookings SET status = 'confirmed', expires_at = NULL
     WHERE id = $1 AND status = 'pending'
     RETURNING room_id`,
    [bookingId]
  );

  if (result.rows.length > 0) {
    await syncRoomStatus(client, result.rows[0].room_id);
  }
}

// User initiates an online payment for one of their own pending bookings.
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

    const booking = bookingResult.rows[0];

    if (req.user.role !== "admin" && booking.user_id !== req.user.id) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Bạn không có quyền thanh toán booking này" });
    }

    if (booking.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: `Không thể thanh toán booking đang ở trạng thái "${booking.status}"`,
      });
    }

    if (booking.payment_status === "paid") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Booking này đã được thanh toán" });
    }

    // Only one payment attempt should be "live" per booking at a time.
    await client.query(
      "UPDATE payments SET status = 'cancelled', updated_at = NOW() WHERE booking_id = $1 AND status = 'pending'",
      [bookingId]
    );

    const transactionRef = generateTransactionRef(bookingId);
    const amount = Number(booking.total_price);

    await client.query(
      `INSERT INTO payments (booking_id, provider, transaction_ref, amount, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [bookingId, provider, transactionRef, amount]
    );

    await client.query(
      "UPDATE bookings SET payment_status = 'pending' WHERE id = $1",
      [bookingId]
    );

    let payUrl;
    const orderInfo = `Thanh toan booking #${bookingId} - ${APP_NAME}`;

    if (provider === "vnpay") {
      const expiresAt = booking.expires_at ? new Date(booking.expires_at) : null;
      payUrl = vnpayService.buildVnpayPayUrl({
        amount,
        transactionRef,
        orderInfo,
        ipAddr: req.ip,
        expiresAt,
      });
    } else {
      payUrl = await momoService.createMomoPayUrl({
        amount,
        transactionRef,
        orderInfo,
      });
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Đã tạo yêu cầu thanh toán",
      payUrl,
      transactionRef,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("CREATE PAYMENT ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi tạo yêu cầu thanh toán" });
  } finally {
    if (client) client.release();
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
              b.user_id AS booking_user_id, b.status AS booking_status
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
    });
  } catch (err) {
    console.error("GET PAYMENT BY REF ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi lấy trạng thái thanh toán" });
  }
};

// VNPay calls this server-to-server (GET, query params). The response body
// shape (RspCode/Message) is dictated by VNPay's protocol, not our own API
// convention — VNPay retries the IPN if it doesn't get a recognized ack.
exports.vnpayIpn = async (req, res) => {
  const { valid, params } = vnpayService.verifyVnpaySignature(req.query);

  if (!valid) {
    return res.json({ RspCode: "97", Message: "Invalid signature" });
  }

  const transactionRef = params.vnp_TxnRef;
  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const paymentResult = await client.query(
      "SELECT * FROM payments WHERE transaction_ref = $1 FOR UPDATE",
      [transactionRef]
    );

    if (paymentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.json({ RspCode: "01", Message: "Order not found" });
    }

    const payment = paymentResult.rows[0];
    const receivedAmount = Number(params.vnp_Amount) / 100;

    if (Math.round(receivedAmount) !== Math.round(Number(payment.amount))) {
      await client.query("ROLLBACK");
      return res.json({ RspCode: "04", Message: "Invalid amount" });
    }

    if (payment.status !== "pending") {
      await client.query("ROLLBACK");
      return res.json({ RspCode: "02", Message: "Order already confirmed" });
    }

    const isSuccess = params.vnp_ResponseCode === "00" && params.vnp_TransactionStatus === "00";

    await client.query(
      `UPDATE payments SET status = $1, provider_transaction_id = $2, raw_callback = $3, updated_at = NOW()
       WHERE id = $4`,
      [isSuccess ? "success" : "failed", params.vnp_TransactionNo || null, JSON.stringify(params), payment.id]
    );

    await client.query(
      "UPDATE bookings SET payment_status = $1 WHERE id = $2",
      [isSuccess ? "paid" : "failed", payment.booking_id]
    );

    if (isSuccess) {
      await confirmBookingAfterPayment(client, payment.booking_id);
    }

    await client.query("COMMIT");

    return res.json({ RspCode: "00", Message: "Confirm Success" });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("VNPAY IPN ERROR:", err);
    return res.json({ RspCode: "99", Message: "Unknown error" });
  } finally {
    if (client) client.release();
  }
};

// MoMo calls this server-to-server (POST, JSON body). MoMo does not mandate
// a specific ack body — any 2xx means "received", so we use our own
// {message} convention rather than mirroring VNPay's RspCode format.
exports.momoIpn = async (req, res) => {
  if (!momoService.isMomoEnabled()) {
    return res.status(404).json({ message: "MoMo payments are not enabled" });
  }

  const { valid } = momoService.verifyMomoSignature(req.body);

  if (!valid) {
    return res.status(400).json({ message: "Invalid signature" });
  }

  const transactionRef = req.body.orderId;
  let client;

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const paymentResult = await client.query(
      "SELECT * FROM payments WHERE transaction_ref = $1 FOR UPDATE",
      [transactionRef]
    );

    if (paymentResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Order not found" });
    }

    const payment = paymentResult.rows[0];

    if (payment.status !== "pending") {
      await client.query("ROLLBACK");
      return res.status(204).end();
    }

    const isSuccess = Number(req.body.resultCode) === 0;

    await client.query(
      `UPDATE payments SET status = $1, provider_transaction_id = $2, raw_callback = $3, updated_at = NOW()
       WHERE id = $4`,
      [isSuccess ? "success" : "failed", req.body.transId ? String(req.body.transId) : null, JSON.stringify(req.body), payment.id]
    );

    await client.query(
      "UPDATE bookings SET payment_status = $1 WHERE id = $2",
      [isSuccess ? "paid" : "failed", payment.booking_id]
    );

    if (isSuccess) {
      await confirmBookingAfterPayment(client, payment.booking_id);
    }

    await client.query("COMMIT");

    return res.status(204).end();
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("MOMO IPN ERROR:", err);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    if (client) client.release();
  }
};
