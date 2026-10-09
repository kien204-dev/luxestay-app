// Labels, colours and small calculations shared by the "My bookings" page
// and its parts.

export const PAGE_SIZE = 5;

// Badge colours (the status-badge tones of booking.css).
export const STATUS_TONE = { pending: "warning", confirmed: "success", completed: "neutral", cancelled: "danger" };
export const PAYMENT_TONE = { pending: "warning", paid: "success", failed: "danger", refund_pending: "info", refunded: "neutral" };

// What the guest may do with a booking, by the rules the API applies
// (paymentController.createPayment, bookingController.cancelBooking). The
// buttons follow these; the API still decides.
export function canPayOnline(booking) {
  return ["pending", "confirmed"].includes(booking.status) && ["unpaid", "pending", "failed"].includes(booking.payment_status);
}

// A paid booking can only be cancelled online while its free-cancellation
// window is open; an unpaid one at any time.
export function canCancelOnline(booking, policy) {
  if (!["pending", "confirmed"].includes(booking.status)) return false;
  if (booking.payment_status !== "paid" || !policy) return true;
  const checkIn = new Date(`${String(booking.check_in).slice(0, 10)}T00:00:00Z`);
  const today = new Date(`${policy.today}T00:00:00Z`);
  return Math.round((checkIn - today) / 86400000) >= (Number(policy.freeCancellationDays) || 0);
}

export const STATUS_STYLE = {
  confirmed: { color: "var(--color-success-strong)", bg: "color-mix(in srgb, var(--color-success-strong) 12%, transparent)" },
  pending: { color: "var(--color-warning-strong)", bg: "color-mix(in srgb, var(--color-warning-strong) 12%, transparent)" },
  cancelled: { color: "var(--color-danger-strong)", bg: "color-mix(in srgb, var(--color-danger-strong) 12%, transparent)" },
  completed: { color: "var(--brand-primary)", bg: "color-mix(in srgb, var(--brand-primary) 12%, transparent)" },
};

export function getStatusLabel(t) {
  return {
    confirmed: t("myBookings:status.confirmed"),
    pending: t("myBookings:status.pending"),
    cancelled: t("myBookings:status.cancelled"),
    completed: t("myBookings:status.completed"),
  };
}

export function getPaymentStatusLabel(t) {
  return {
    unpaid: t("myBookings:paymentStatus.unpaid"),
    pending: t("myBookings:paymentStatus.pending"),
    paid: t("myBookings:paymentStatus.paid"),
    failed: t("myBookings:paymentStatus.failed"),
    refund_pending: t("myBookings:paymentStatus.refund_pending"),
    refunded: t("myBookings:paymentStatus.refunded"),
  };
}

export { formatMoney } from "../../utils/format";

export function formatDate(value, lang = "vi") {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(lang === "en" ? "en-US" : "vi-VN");
}

export function calculateNights(checkIn, checkOut) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

export function buildTimeline(booking, t) {
  const status = booking.status || "pending";
  const items = [
    {
      label: t("myBookings:timeline.created"),
      date: booking.created_at,
      active: true,
    },
  ];

  if (status === "cancelled") {
    items.push({
      label: t("myBookings:timeline.cancelled"),
      date: null,
      active: true,
      note: t("myBookings:timeline.cancelledNote"),
    });
  } else {
    items.push({
      label: status === "pending" ? t("myBookings:timeline.pending") : t("myBookings:timeline.confirmed"),
      date: status === "pending" ? null : booking.created_at,
      active: ["pending", "confirmed", "completed"].includes(status),
    });

    items.push({
      label: t("myBookings:timeline.checkIn"),
      date: booking.check_in,
      active: ["confirmed", "completed"].includes(status),
    });

    items.push({
      label: status === "completed" ? t("myBookings:timeline.checkOutCompleted") : t("myBookings:timeline.checkOut"),
      date: booking.check_out,
      active: status === "completed",
    });
  }

  return items;
}

