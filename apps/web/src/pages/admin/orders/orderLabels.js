// Booking state shared by the order list pieces.

export const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled"];
export const PAYMENT_STATUSES = ["unpaid", "pending", "paid", "failed", "refund_pending", "refunded"];

export const STATUS_TONE = { pending: "warning", confirmed: "success", completed: "info", cancelled: "danger" };
export const PAYMENT_TONE = { unpaid: "neutral", pending: "warning", paid: "success", failed: "danger", refund_pending: "warning", refunded: "neutral" };

export function bookingCode(id) {
  return `#BK-${String(id).padStart(4, "0")}`;
}

// The one money action that applies to a booking: record a desk payment, or
// confirm a refund has been sent.
export function paymentActionFor(order) {
  const payment = order.payment_status || "unpaid";
  if (payment === "refund_pending") return "refund";
  if (["pending", "confirmed", "completed"].includes(order.status) && ["unpaid", "pending", "failed"].includes(payment)) return "markPaid";
  return null;
}
