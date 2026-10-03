import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getRoomReviews } from "../services/reviewService";
import { useAsyncData } from "../utils/useAsyncData";
import StarRating from "./StarRating";

// Small "★ 4.5 (12 reviews)" badge for room cards. Asks for one review: the
// stats cover every visible review whatever the page size.
export function RoomRatingSummary({ roomId }) {
  const { t } = useTranslation("site");
  const { data } = useAsyncData(`rating:${roomId}`, () => getRoomReviews(roomId, { limit: 1 }));

  if (!data || data.totalReviews === 0) return <span className="review-muted">{t("reviews.none")}</span>;
  return (
    <span className="review-summary">
      <StarRating value={data.averageRating} size={13} />
      <span>
        {data.averageRating.toFixed(1)} ({t("reviews.count", { count: data.totalReviews })})
      </span>
    </span>
  );
}

const PAGE_SIZE = 5;

// The room's reviews, a page at a time, with the rating summary.
export default function RoomReviews({ roomId }) {
  const { t, i18n } = useTranslation("site");
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsyncData(`reviews:${roomId}:${page}`, () => getRoomReviews(roomId, { page, limit: PAGE_SIZE }));
  const reviews = data?.data || [];
  const totalPages = data?.pagination?.totalPages || 1;
  const locale = i18n.language === "en" ? "en-US" : "vi-VN";

  return (
    <div className="room-reviews">
      {data && (
        <div className="review-summary" style={{ marginBottom: 16 }}>
          <StarRating value={data.averageRating} size={16} />
          <strong>{data.averageRating.toFixed(1)}</strong>
          <span className="review-muted">· {t("reviews.count", { count: data.totalReviews })}</span>
        </div>
      )}

      {loading && !data ? (
        <p className="review-muted">{t("reviews.loading")}</p>
      ) : error ? (
        <p className="g-error">
          {t("reviews.loadFailed")}{" "}
          <button type="button" className="review-link" onClick={reload}>{t("reviews.retry")}</button>
        </p>
      ) : reviews.length === 0 ? (
        <p className="review-muted">{t("reviews.empty")}</p>
      ) : (
        <ul className="review-list">
          {reviews.map((review) => (
            <li key={review.id}>
              <div className="review-head">
                <strong>{review.reviewer_name}</strong>
                <span className="review-muted">{new Date(review.created_at).toLocaleDateString(locale)}</span>
              </div>
              <StarRating value={review.rating} size={13} />
              {review.comment && <p>{review.comment}</p>}
            </li>
          ))}
        </ul>
      )}

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
