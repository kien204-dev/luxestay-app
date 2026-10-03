// Labels, colours and small calculations shared by the "My bookings" page
// and its parts.

export const PAGE_SIZE = 5;

export function getStatusFilterOptions(t) {
  return [
    { value: "", label: t("myBookings:filters.statusOptions.all") },
    { value: "pending", label: t("myBookings:filters.statusOptions.pending") },
    { value: "confirmed", label: t("myBookings:filters.statusOptions.confirmed") },
    { value: "completed", label: t("myBookings:filters.statusOptions.completed") },
    { value: "cancelled", label: t("myBookings:filters.statusOptions.cancelled") },
  ];
}

export const STATUS_STYLE = {
  confirmed: { color: "#67e8b4", bg: "rgba(103,232,180,0.12)" },
  pending: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  cancelled: { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  completed: { color: "#9fa7ff", bg: "rgba(159,167,255,0.12)" },
};

export function getStatusLabel(t) {
  return {
    confirmed: t("myBookings:status.confirmed"),
    pending: t("myBookings:status.pending"),
    cancelled: t("myBookings:status.cancelled"),
    completed: t("myBookings:status.completed"),
  };
}

export const PAYMENT_STATUS_STYLE = {
  unpaid: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  pending: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  paid: { color: "#059669", bg: "rgba(5,150,105,0.12)" },
  failed: { color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
  refund_pending: { color: "#d97706", bg: "rgba(217,119,6,0.12)" },
  refunded: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

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

