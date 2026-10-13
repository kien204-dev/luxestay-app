// Booking state shared by the order list pieces.

export const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// The one money action that applies to a booking: record a desk payment, or
// confirm a refund has been sent.
export function paymentActionFor(order) {
  const payment = order.payment_status || "unpaid";
  if (payment === "refund_pending") return "refund";
  if (["pending", "confirmed", "completed"].includes(order.status) && ["unpaid", "pending", "failed"].includes(payment)) return "markPaid";
  return null;
}

// The API refuses to delete a booking once money has moved (its payments
// would go with it): such a booking is cancelled instead.
export function canDelete(order) {
  if (["paid", "refund_pending", "refunded"].includes(order.payment_status)) return false;
  if (order.paid_via) return false;
  return !(order.payments || []).some((payment) => payment.status === "success");
}
