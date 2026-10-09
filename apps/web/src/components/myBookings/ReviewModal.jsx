import { useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog, { CloseIcon } from "../Dialog";
import { StarIcon } from "../guest/icons";
import { createReview } from "../../services/reviewService";
import { apiErrorText, apiSuccessText } from "../../utils/apiError";
import { formatDate } from "../../utils/format";

// The API's own limit (reviewController.js).
const MAX_COMMENT_LENGTH = 2000;
const dateOf = (value) => String(value).slice(0, 10);

// Stars (required) and a comment (optional) for a finished stay. The form
// says what is wrong next to the field; what the API refuses is shown above
// the buttons and the text typed so far stays.
export default function ReviewModal({ booking, toast, onClose, onSubmitted }) {
  const { t, i18n } = useTranslation("myBookings");
  const lang = i18n.language;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState("");

  const tooLong = comment.trim().length > MAX_COMMENT_LENGTH;
  const ratingMissing = tried && !rating;
  const close = () => !submitting && onClose();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setTried(true);
    if (!rating || tooLong) return;

    setSubmitting(true);
    setError("");
    try {
      const res = await createReview(booking.room_id, {
        booking_id: booking.id,
        rating,
        comment: comment.trim() || undefined,
      });
      toast.success(apiSuccessText(res, "myBookings:errors.reviewSuccess"));
      onSubmitted({ rating, comment: comment.trim() });
    } catch (err) {
      setError(apiErrorText(err, "myBookings:errors.reviewFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog onClose={close} aria-labelledby="review-title" data-testid="review-dialog">
      <form onSubmit={handleSubmit} noValidate style={{ display: "contents" }}>
        <div className="ui-dialog-head">
          <div>
            <span className="room-location">{booking.room_name} · {formatDate(dateOf(booking.check_in), lang)} → {formatDate(dateOf(booking.check_out), lang)}</span>
            <h2 id="review-title">{t("reviewModal.question")}</h2>
          </div>
          <button type="button" className="ui-button ui-button--icon" aria-label={t("common:dialog.close")} onClick={close} disabled={submitting}>
            <CloseIcon />
          </button>
        </div>

        <div className="ui-dialog-body review-form">
          <fieldset aria-describedby="review-stars-message">
            <legend>{t("reviewModal.starsLabel")}</legend>
            <div className="star-input">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className={n <= rating ? "is-on" : ""}>
                  <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} />
                  <span className="sr-only">{t("common:stars", { count: n })}</span>
                  <StarIcon />
                </label>
              ))}
            </div>
            <p id="review-stars-message" className={ratingMissing ? "g-error" : "checkout-help"} role={ratingMissing ? "alert" : undefined} data-testid="review-stars-message">
              {ratingMissing ? t("errors.reviewRatingRequired") : rating ? t("reviewModal.chosen", { count: rating }) : t("reviewModal.chooseStars")}
            </p>
          </fieldset>

          <div className="g-field">
            <label className="g-label" htmlFor="review-comment">{t("reviewModal.commentLabel")}</label>
            <textarea
              id="review-comment"
              className="g-input"
              rows={4}
              value={comment}
              placeholder={t("reviewModal.commentPlaceholder")}
              aria-invalid={tooLong ? "true" : undefined}
              aria-describedby="review-comment-message"
              onChange={(e) => setComment(e.target.value)}
            />
            <p id="review-comment-message" className={tooLong ? "g-error" : "checkout-help"} role={tooLong ? "alert" : undefined}>
              {tooLong
                ? t("reviewModal.tooLong", { max: MAX_COMMENT_LENGTH, count: comment.trim().length })
                : t("reviewModal.publicNote")}
            </p>
          </div>

          {error && <p className="g-alert" role="alert">{error}</p>}
        </div>

        <div className="ui-dialog-foot">
          <button type="button" className="ui-button ui-button--secondary" onClick={onClose} disabled={submitting}>{t("reviewModal.cancel")}</button>
          <button type="submit" className="ui-button ui-button--primary" disabled={submitting}>
            {submitting ? t("reviewModal.submitting") : t("reviewModal.submit")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
