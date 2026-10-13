import { useTranslation } from "react-i18next";
import BookingBadge, { bookingState } from "./BookingBadge";
import { bookingCode } from "../../utils/bookingCode";
import { formatMoney, nightsBetween } from "../../utils/format";
import { clock, stayText } from "../../utils/adminFormat";

// A booking as a card, for the phone: state and code, the guest, the room
// and dates, the total and whether it is paid. Waiting bookings show until
// when the room is held.
export default function OrderCard({ booking, today, onOpen }) {
  const { t, i18n } = useTranslation("admin");
  const lang = i18n.language;
  const state = bookingState(booking, today);
  const urgent = state === "pending" || state === "refundPending";
  const nights = nightsBetween(booking.check_in, booking.check_out);
  const expires = booking.status === "pending" && booking.expires_at ? booking.expires_at : null;
  const paid = booking.payment_status === "paid";

  return (
    <button type="button" className={`ax-ocard${urgent ? " is-urgent" : ""}`} onClick={() => onOpen(booking)} data-testid="order-card">
      <span className="ax-ocard__r1">
        <BookingBadge booking={booking} today={today} />
        <span className="ax-code">{bookingCode(booking.id)}</span>
      </span>
      <span className="ax-ocard__name">{booking.guest_name || booking.user_name}</span>
      <span className="ax-ocard__meta">
        {booking.room_name} · {stayText(booking.check_in, booking.check_out, lang)} · {t("card.nights", { count: nights })}
      </span>
      {expires && (
        <span className="ax-ocard__meta is-warn">{t("card.heldUntil", { time: clock(expires) })}</span>
      )}
      <span className="ax-ocard__r3">
        <span className="ax-ocard__tot">{formatMoney(booking.total_price, lang)}</span>
        <span className={`ax-ocard__pay${paid ? " is-paid" : ""}`}>{t(`card.payment.${booking.payment_status || "unpaid"}`)}</span>
      </span>
    </button>
  );
}
