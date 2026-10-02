const pool = require("../db/db.js");
const { emitToAdmins } = require("./socket.js");
const { isEmailConfigured, sendAdminEmail } = require("./emailService.js");
const { getPropertySettings } = require("./propertySettings");

const REFUND_REASON_TEXT = {
  cancelled_by_guest: "khách hủy booking đã thanh toán",
  cancelled_by_admin: "quản trị hủy booking đã thanh toán",
  paid_after_cancellation: "tiền về sau khi booking đã hủy/hết hạn và phòng không còn trống",
};

function formatAmount(value) {
  return `${Number(value).toLocaleString("vi-VN")} đ`;
}

// Email is a convenience on top of the socket event and the booking's own
// refund_pending state (which is the durable record), so a mail failure is
// logged and never surfaces to the request that triggered it.
// subject is given without the "[Property name]" prefix; it is added here.
async function emailAdmins(subject, lines) {
  try {
    if (!isEmailConfigured()) return;
    const { name } = await getPropertySettings();

    const admins = await pool.query(
      "SELECT email FROM users WHERE role = 'admin' AND deleted_at IS NULL AND is_locked = FALSE"
    );
    const recipients = admins.rows.map((row) => row.email).filter(Boolean);
    if (recipients.length === 0) return;

    await sendAdminEmail({ to: recipients, subject: `[${name}] ${subject}`, text: lines.join("\n") });
  } catch (err) {
    console.error("ADMIN ALERT EMAIL FAILED:", err.message);
  }
}

// A booking now owes its guest money back. Fire-and-forget: call it after
// the transaction has committed and do not await it.
function notifyRefundPending(booking) {
  const reason = REFUND_REASON_TEXT[booking.refund_reason] || booking.refund_reason || "";

  emitToAdmins("booking:refund-pending", {
    id: booking.id,
    room_id: booking.room_id,
    total_price: booking.total_price,
    refund_reason: booking.refund_reason,
  });

  return emailAdmins(`Booking #${booking.id} cần hoàn tiền`, [
    `Booking #${booking.id} đang chờ hoàn tiền.`,
    `Số tiền: ${formatAmount(booking.total_price)}`,
    `Lý do: ${reason}`,
    "",
    "Sau khi đã chuyển tiền lại cho khách, mở trang Orders và bấm \"Xác nhận hoàn tiền\".",
  ]);
}

// A second successful payment arrived for a booking that was already paid.
function notifyDuplicatePayment(booking, payment) {
  emitToAdmins("payment:duplicate", {
    booking_id: booking.id,
    transaction_ref: payment.transaction_ref,
    amount: payment.amount,
  });

  return emailAdmins(`Booking #${booking.id} bị thanh toán hai lần`, [
    `Booking #${booking.id} đã được thanh toán trước đó, nhưng vừa có thêm một giao dịch thành công.`,
    `Mã giao dịch: ${payment.transaction_ref} (${payment.provider})`,
    `Số tiền cần hoàn lại: ${formatAmount(payment.amount)}`,
  ]);
}

module.exports = { notifyDuplicatePayment, notifyRefundPending };
