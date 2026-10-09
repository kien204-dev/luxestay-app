import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getRoomReviews } from "../services/reviewService";
import { useAsyncData } from "../utils/useAsyncData";
import StarRating from "./StarRating";
import StateMessage from "./guest/StateMessage";
import { StarIcon } from "./guest/icons";

// "4.5 out of 5", written the way the language writes decimals.
export function formatRating(value, language) {
  return Number(value).toLocaleString(language === "en" ? "en-US" : "vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Initials of a (shortened) reviewer name, for the round badge beside it.
export function initialsOf(name) {
  const words = String(name || "").replace(/\./g, "").split(/\s+/).filter(Boolean);
  return [words[0], words.length > 1 ? words.at(-1) : ""].map((word) => Array.from(word || "")[0] || "").join("").toUpperCase();
}

// Small "★ 4.5 · 12 reviews" line for room cards. Asks for one review: the
// stats cover every visible review whatever the page size. A room nobody has
// reviewed shows nothing, or "no reviews yet" where `showEmpty` asks for it.
export function RoomRatingSummary({ roomId, showEmpty = false }) {
  const { t, i18n } = useTranslation("site");
  const { data } = useAsyncData(`rating:${roomId}`, () => getRoomReviews(roomId, { limit: 1 }));

  if (!data || data.totalReviews === 0) {
    return showEmpty && data ? <span className="review-muted">{t("reviews.none")}</span> : null;
  }
  return (
    <span className="review-summary">
      <StarIcon />
      {formatRating(data.averageRating, i18n.language)} · {t("reviews.count", { count: data.totalReviews })}
    </span>
  );
}

const PAGE_SIZE = 4;

// The room's reviews: the score with how the stars are spread, then the
// reviews a page at a time. A room without reviews says so.
export default function RoomReviews({ roomId }) {
  const { t, i18n } = useTranslation("site");
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsyncData(`reviews:${roomId}:${page}`, () => getRoomReviews(roomId, { page, limit: PAGE_SIZE }));
  const reviews = data?.data || [];
  const totalPages = data?.pagination?.totalPages || 1;
  const locale = i18n.language === "en" ? "en-US" : "vi-VN";

  if (loading && !data) return <p className="review-muted" aria-busy="true">{t("reviews.loading")}</p>;
  if (error) {
    return (
      <p className="g-error">
        {t("reviews.loadFailed")}{" "}
        <button type="button" className="review-link" onClick={reload}>{t("reviews.retry")}</button>
      </p>
    );
  }
  if (data.totalReviews === 0) {
    return <StateMessage compact title={t("reviews.empty")} text={t("reviews.emptyHint")} testId="reviews-empty" />;
  }

  return (
    <div className="room-reviews" data-testid="room-reviews">
      <div className="review-top">
        <p className="review-score">
          <b>{formatRating(data.averageRating, i18n.language)}</b>
          <span>{t("reviews.outOfFive", { count: data.totalReviews })}</span>
        </p>
        {data.ratingCounts && (
          <ul className="review-bars">
            {[5, 4, 3, 2, 1].map((stars) => (
              <li key={stars}>
                <span>{t("common:stars", { count: stars })}</span>
                <span className="review-bar" aria-hidden="true">
                  <i style={{ width: `${(100 * data.ratingCounts[stars]) / data.totalReviews}%` }} />
                </span>
                <b>{data.ratingCounts[stars]}</b>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="review-list">
        {reviews.map((review) => (
          <li key={review.id}>
            <div className="review-who">
              <span aria-hidden="true">{initialsOf(review.reviewer_name)}</span>
              <div>
                <b>{review.reviewer_name}</b>
                <small>{new Date(review.created_at).toLocaleDateString(locale, { month: "long", year: "numeric" })}</small>
              </div>
            </div>
            <StarRating value={review.rating} size={13} />
            {review.comment && <p>{review.comment}</p>}
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="pagination">
          <button type="button" className="g-btn g-btn--outline g-btn--small" onClick={() => setPage(page - 1)} disabled={page <= 1}>{t("reviews.previous")}</button>
          <span>{t("reviews.page", { page, total: totalPages })}</span>
          <button type="button" className="g-btn g-btn--outline g-btn--small" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>{t("reviews.next")}</button>
        </div>
      )}
    </div>
  );
}
