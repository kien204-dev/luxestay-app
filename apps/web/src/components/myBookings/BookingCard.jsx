import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RoomImage } from "../guest/RoomCard";
import GuestIcon from "../guest/icons";
import { useToast } from "../../context/ToastContext";
import { downloadBookingReceipt } from "../../services/bookingService";
import { addDays, formatDate, formatMoney, nightsBetween } from "../../utils/format";
import { placeholderFor } from "../../utils/imageUrl";
import { canCancelOnline, canPayOnline, getPaymentStatusLabel, getStatusLabel, PAYMENT_TONE, STATUS_TONE } from "./helpers";

const dateOf = (value) => String(value).slice(0, 10);

// The line under a booking that says what happens next, from its real state:
// how long the room is held, until when it can be cancelled for free, where
// a refund stands.
function useNote(booking, policy) {
  const { t, i18n } = useTranslation("myBookings");
  const lang = i18n.language;
  const day = (value) => formatDate(dateOf(value), lang);
  const { status, payment_status: payment } = booking;

  if (status === "pending" && booking.expires_at) {
    const until = new Date(booking.expires_at).toLocaleString(lang === "en" ? "en-US" : "vi-VN", { dateStyle: "short", timeStyle: "short" });
    return { tone: "warning", text: t("card.note.heldUntil", { time: until }) };
  }
  if (status === "confirmed" && payment === "paid" && policy) {
    const deadline = addDays(dateOf(booking.check_in), -(Number(policy.freeCancellationDays) || 0));
    return deadline >= policy.today
      ? { tone: "success", text: t("card.note.freeUntil", { date: formatDate(deadline, lang) }) }
      : { tone: "", text: t("card.note.windowPassed") };
  }
  if (status === "confirmed" && payment !== "paid") return { tone: "", text: t("card.note.payOnlineOrDesk") };
  if (status === "completed") return { tone: "", text: t("card.note.completed", { date: day(booking.check_out) }) };
  if (payment === "refund_pending") return { tone: "info", text: t("card.note.refundPending") };
  if (payment === "refunded") return { tone: "info", text: booking.refunded_at ? t("card.note.refundedOn", { date: day(booking.refunded_at) }) : t("card.note.refunded") };
  if (status === "cancelled") return { tone: "", text: booking.cancelled_at ? t("card.note.cancelledOn", { date: day(booking.cancelled_at) }) : t("card.note.cancelled") };
  return null;
}

// One booking: what and when, its state, what it cost, and what the guest
// can do with it now. The actions are offered by the same rules the API
// applies (helpers.js); the API still has the last word.
export default function BookingCard({ booking: b, policy, onDetails, onPay, onCancel, onReview }) {
  const { t, i18n } = useTranslation("myBookings");
  const lang = i18n.language;
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const note = useNote(b, policy);

  const checkIn = dateOf(b.check_in);
  const checkOut = dateOf(b.check_out);
  const nights = nightsBetween(checkIn, checkOut);
  const refund = b.payment_status === "refund_pending" || b.payment_status === "refunded";
  const totalLabel = refund ? (b.payment_status === "refunded" ? t("card.refunded") : t("card.refundAmount")) : b.payment_status === "paid" ? t("card.paid") : t("card.totalLocked");

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadBookingReceipt(b.id, lang);
    } catch {
      toast.error(t("card.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <article className="my-booking-card" data-testid={`booking-${b.id}`}>
      <div className="guest-photo my-booking-image">
        <RoomImage src={b.room_image} alt="" fallback={placeholderFor(b.room_name || b.room_id)} width={440} height={330} />
      </div>

      <div className="my-booking-main">
        <div className="my-booking-top">
          <span className={`status-badge is-${STATUS_TONE[b.status] || "neutral"}`}>{getStatusLabel(t)[b.status] || b.status}</span>
          {b.payment_status && b.payment_status !== "unpaid" && (
            <span className={`status-badge is-plain is-${PAYMENT_TONE[b.payment_status] || "neutral"}`}>{getPaymentStatusLabel(t)[b.payment_status]}</span>
          )}
          <span className="my-booking-code">#{String(b.id).padStart(4, "0")}</span>
        </div>
        <h2>{b.room_name}</h2>
        <p className="my-booking-meta">
          <b>{formatDate(checkIn, lang)} → {formatDate(checkOut, lang)}</b> · {t("detailModal.nightsValue", { count: nights })} · {t("detailModal.guestsValue", { count: b.guests })}
          {b.room_type ? ` · ${b.room_type}` : ""}
        </p>

        {refund && (
          <div className="refund-progress" aria-label={t("card.refundProgress")}>
            <div aria-hidden="true"><i className="is-on" /><i className="is-on" /><i className={b.payment_status === "refunded" ? "is-on" : ""} /></div>
            <ol>
              <li className="is-on">{t("card.refundCancelled")}</li>
              <li className="is-on">{t("card.refundProcessing")}</li>
              <li className={b.payment_status === "refunded" ? "is-on" : ""}>{t("card.refundDone")}</li>
            </ol>
          </div>
        )}

        {note && (
          <p className={`my-booking-note${note.tone ? ` is-${note.tone}` : ""}`}>
            <GuestIcon.Clock small />
            {note.text}
          </p>
        )}
      </div>

      <div className="my-booking-side">
        <div className="my-booking-total">
          <span>{totalLabel}</span>
          <b>{formatMoney(b.total_price, lang)}</b>
        </div>
        <div className="my-booking-actions">
          {canPayOnline(b) && (
            <button type="button" className="g-btn g-btn--primary" onClick={() => onPay(b)}>{t("card.pay")}</button>
          )}
          {b.status === "completed" && !b.has_review && (
            <button type="button" className="g-btn g-btn--primary" onClick={() => onReview(b)}>{t("card.reviewThisRoom")}</button>
          )}
          {b.has_review && <span className="status-badge is-plain is-brass">{t("card.reviewed")}</span>}
          <button type="button" className="g-btn g-btn--outline" onClick={() => onDetails(b)}>{t("card.details")}</button>
          <button type="button" className="g-btn g-btn--outline" onClick={handleDownload} disabled={downloading}>
            <GuestIcon.Download small />
            {t("card.downloadReceipt")}
          </button>
          {(b.status === "completed" || b.status === "cancelled") && (
            <Link className="g-btn g-btn--outline" to={`/rooms/${b.room_id}`}>{t("card.bookAgain")}</Link>
          )}
          {canCancelOnline(b, policy) && (
            <button type="button" className="g-btn g-btn--ghost is-danger" onClick={() => onCancel(b)}>{t("card.cancelBooking")}</button>
          )}
        </div>
      </div>
    </article>
  );
}
