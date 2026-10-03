import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../context/ToastContext";
import { downloadBookingReceipt } from "../../services/bookingService";
import { normalizeImageUrl, useFallbackImage } from "../../utils/imageUrl";
import StarRating from "../StarRating";
import { STATUS_STYLE, PAYMENT_STATUS_STYLE, getStatusLabel, getPaymentStatusLabel, formatMoney, formatDate } from "./helpers";

// One booking in the list: what was booked, its state, and the actions that
// apply to it right now (details, pay, cancel, review).
export default function BookingCard({ booking: b, cancelling, submittedReview, onDetails, onPay, onCancel, onReview }) {
  const { t, i18n } = useTranslation("myBookings");
  const lang = i18n.language;
  const statusLabel = getStatusLabel(t);
  const paymentStatusLabel = getPaymentStatusLabel(t);
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadBookingReceipt(b.id, lang);
    } catch (err) {
      toast.error(err.response?.data?.message || t("myBookings:card.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };
    const style = STATUS_STYLE[b.status] || STATUS_STYLE.pending;
    const pmtStyle = PAYMENT_STATUS_STYLE[b.payment_status] || PAYMENT_STATUS_STYLE.unpaid;
    const canCancel = ["pending", "confirmed"].includes(b.status);

  return (
    <div
      className="my-booking-card"
      style={{
        background: "var(--color-surface-light)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 2px 12px color-mix(in srgb, var(--color-ink) 6%, transparent)",
        display: "grid",
        gridTemplateColumns: "140px 1fr auto",
        gap: 0,
      }}
    >
      <div
        className="my-booking-image"
        style={{
          minHeight: 120,
          overflow: "hidden",
        }}
      >
        <img
          src={normalizeImageUrl(b.room_image)}
          alt={b.room_name || "Room"}
          onError={useFallbackImage}
          style={{
            width: "100%",
            height: "100%",
            minHeight: 120,
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
      <div style={{ padding: "20px 24px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "capitalize",
              color: style.color,
              background: style.bg,
            }}
          >
            {statusLabel[b.status] || b.status}
          </span>
          <span style={{ color: "var(--color-ink-muted)", fontSize: 12 }}>
            #{String(b.id).padStart(4, "0")}
          </span>
          {b.payment_status && b.payment_status !== "unpaid" && (
            <span
              style={{
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                color: pmtStyle.color,
                background: pmtStyle.bg,
              }}
            >
              {paymentStatusLabel[b.payment_status] || b.payment_status}
            </span>
          )}
        </div>
        <h3
          style={{
            margin: "0 0 6px",
            color: "var(--brand-primary)",
            fontSize: 18,
          }}
        >
          {b.room_name}
        </h3>
        <p style={{ margin: "0 0 8px", color: "var(--color-ink-muted)", fontSize: 13 }}>
          {b.room_type}
          {b.room_capacity ? ` · ${t("myBookings:card.maxGuests", { count: b.room_capacity })}` : ""}
        </p>
        <p style={{ margin: 0, color: "var(--color-ink-muted)", fontSize: 14 }}>
          {formatDate(b.check_in, lang)} → {formatDate(b.check_out, lang)}
        </p>
      </div>
      <div
        className="my-booking-actions"
        style={{
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <strong style={{ color: "var(--brand-accent)", fontSize: 18 }}>
          {formatMoney(b.total_price, lang)}
        </strong>
        <span style={{ color: "var(--color-ink-muted)", fontSize: 11, textAlign: "right" }}>
          {t("myBookings:card.totalLocked")}
        </span>
        <button
          onClick={() => onDetails(b)}
          style={{
            padding: "8px 14px",
            background: "var(--brand-primary)",
            color: "var(--color-surface-light)",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {t("myBookings:card.details")}
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          data-testid="download-receipt"
          style={{
            padding: "8px 14px",
            background: "transparent",
            color: "var(--brand-primary)",
            border: "1px solid var(--brand-primary)",
            borderRadius: 6,
            cursor: downloading ? "not-allowed" : "pointer",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {downloading ? "…" : t("myBookings:card.downloadReceipt")}
        </button>
        {["pending", "confirmed"].includes(b.status) && ["unpaid", "failed", undefined].includes(b.payment_status) && (
          <button
            onClick={() => {
              onPay(b);
            }}
            style={{
              padding: "8px 14px",
              background: "var(--brand-accent)",
              color: "var(--color-ink)",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {t("myBookings:card.pay")}
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => onCancel(b.id)}
            disabled={cancelling}
            style={{
              padding: "8px 14px",
              background: "transparent",
              color: "var(--color-danger-strong)",
              border: "1px solid color-mix(in srgb, var(--color-danger-strong) 30%, transparent)",
              borderRadius: 6,
              cursor:
                cancelling ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {cancelling ? t("myBookings:card.cancelling") : t("myBookings:card.cancelBooking")}
          </button>
        )}
        {b.status === "completed" && (
          submittedReview ? (
            <div style={{ textAlign: "right" }}>
              <StarRating value={submittedReview.rating} size={13} />
              <p style={{ margin: "4px 0 0", color: "var(--color-ink-muted)", fontSize: 11 }}>
                {t("myBookings:card.reviewed")}
              </p>
            </div>
          ) : b.has_review ? (
            <span style={{ color: "var(--color-ink-muted)", fontSize: 11 }}>{t("myBookings:card.reviewed")}</span>
          ) : (
            <button
              onClick={() => onReview(b)}
              style={{
                padding: "8px 14px",
                background: "transparent",
                color: "var(--brand-accent)",
                border: "1px solid var(--brand-accent)",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {t("myBookings:card.reviewThisRoom")}
            </button>
          )
        )}
      </div>
    </div>
  );
}
