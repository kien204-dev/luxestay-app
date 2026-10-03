import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createReview } from "../../services/reviewService";
import StarRating from "../StarRating";
import { formatDate } from "./helpers";

export default function ReviewModal({ booking, toast, onClose, onSubmitted }) {
  const { t, i18n } = useTranslation("myBookings");
  const lang = i18n.language;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rating) {
      setError(t("myBookings:errors.reviewRatingRequired"));
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await createReview(booking.room_id, {
        booking_id: booking.id,
        rating,
        comment: comment.trim() || undefined,
      });
      toast.success(res.message || t("myBookings:errors.reviewSuccess"));
      onSubmitted({ rating, comment: comment.trim() });
    } catch (err) {
      setError(err.response?.data?.message || t("myBookings:errors.reviewFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={() => !submitting && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, var(--color-ink) 65%, transparent)",
        zIndex: 3300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--color-surface-light)",
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 24px 80px color-mix(in srgb, var(--color-ink) 25%, transparent)",
        }}
      >
        <h3 className="font-headline" style={{ margin: "0 0 6px", color: "var(--brand-primary)", fontSize: 20 }}>
          {t("myBookings:reviewModal.title", { roomName: booking.room_name })}
        </h3>
        <p style={{ margin: "0 0 20px", color: "var(--color-ink-muted)", fontSize: 13 }}>
          {formatDate(booking.check_in, lang)} → {formatDate(booking.check_out, lang)}
        </p>

        <label
          style={{
            display: "block",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--color-ink-muted)",
            marginBottom: 8,
            fontWeight: 700,
          }}
        >
          {t("myBookings:reviewModal.starsLabel")}
        </label>
        <div style={{ marginBottom: 20 }}>
          <StarRating value={rating} onChange={setRating} size={28} />
        </div>

        <label
          style={{
            display: "block",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--color-ink-muted)",
            marginBottom: 8,
            fontWeight: 700,
          }}
        >
          {t("myBookings:reviewModal.commentLabel")}
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={t("myBookings:reviewModal.commentPlaceholder")}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--color-line-light)",
            borderRadius: 8,
            outline: "none",
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
            boxSizing: "border-box",
            marginBottom: 16,
          }}
        />

        {error && (
          <div
            style={{
              background: "var(--color-danger-soft)",
              border: "1px solid color-mix(in srgb, var(--color-danger-strong) 30%, transparent)",
              borderRadius: 8,
              color: "var(--color-danger-strong)",
              fontSize: 12,
              marginBottom: 16,
              padding: "8px 10px",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 8,
              border: "1px solid var(--color-line-light)",
              background: "transparent",
              color: "var(--color-ink-muted)",
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {t("myBookings:reviewModal.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 8,
              border: "none",
              background: "var(--brand-primary)",
              color: "var(--color-surface-light)",
              fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? t("myBookings:reviewModal.submitting") : t("myBookings:reviewModal.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
