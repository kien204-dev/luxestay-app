import { useTranslation } from "react-i18next";

// One word for where a booking stands, as the admin screens show it. A
// confirmed stay that includes today is "staying"; a cancelled booking whose
// money has to go back is "refund to send".
export function bookingState(booking, today) {
  if (booking.payment_status === "refund_pending") return "refundPending";
  if (booking.status === "confirmed" && today && booking.check_in <= today && booking.check_out > today) return "inHouse";
  return booking.status;
}

export const STATE_TONE = {
  pending: "warning",
  confirmed: "success",
  inHouse: "info",
  completed: "neutral",
  cancelled: "danger",
  refundPending: "info",
};

export default function BookingBadge({ booking, today, large = false }) {
  const { t } = useTranslation("admin");
  const state = bookingState(booking, today);
  return (
    <span className={`ax-badge ax-badge--${STATE_TONE[state] || "neutral"}${large ? " ax-badge--lg" : ""}`} data-state={state}>
      {t(`state.${state}`, { defaultValue: booking.status })}
    </span>
  );
}
