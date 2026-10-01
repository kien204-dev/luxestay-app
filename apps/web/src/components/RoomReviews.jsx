import { useCallback, useEffect, useState } from "react";
import { getRoomReviews } from "../services/reviewService";
import StarRating from "./StarRating";

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("vi-VN");
}

// Small "★ 4.5 (12 đánh giá)" badge for room cards. Fetches with limit=1 —
// the stats (averageRating/totalReviews) cover every non-hidden review for
// the room regardless of page size, so this stays a cheap call.
export function RoomRatingSummary({ roomId }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getRoomReviews(roomId, { limit: 1 })
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  if (!stats || stats.totalReviews === 0) {
    return <span style={{ color: "#94a3b8", fontSize: 12 }}>Chưa có đánh giá</span>;
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <StarRating value={stats.averageRating} size={13} />
      <span style={{ color: "#475569", fontSize: 12, fontWeight: 600 }}>
        {stats.averageRating.toFixed(1)} ({stats.totalReviews} đánh giá)
      </span>
    </span>
  );
}

const PAGE_SIZE = 5;

// Full paginated review list + rating summary, used inside the booking modal.
export default function RoomReviews({ roomId }) {
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState({ averageRating: 0, totalReviews: 0 });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Takes the target page explicitly rather than closing over the `page`
  // state, so this isn't "an effect that re-fetches whenever `page`
  // changes" (state driving an effect that sets that same state) — the
  // mount effect below only depends on `roomId`, and the pagination
  // buttons call this directly with the page they're switching to.
  const loadReviews = useCallback(
    (targetPage) => {
      setLoading(true);
      setError("");
      return getRoomReviews(roomId, { page: targetPage, limit: PAGE_SIZE })
        .then((result) => {
          setReviews(result.data);
          setStats({ averageRating: result.averageRating, totalReviews: result.totalReviews });
          setTotalPages(result.pagination.totalPages);
          setPage(targetPage);
        })
        .catch(() => {
          setReviews([]);
          setError("Không tải được đánh giá. Vui lòng thử lại.");
        })
        .finally(() => setLoading(false));
    },
    [roomId]
  );

  useEffect(() => {
    Promise.resolve().then(() => loadReviews(1));
  }, [roomId, loadReviews]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <StarRating value={stats.averageRating} size={16} />
        <span style={{ color: "#002366", fontWeight: 700, fontSize: 14 }}>
          {stats.averageRating.toFixed(1)}
        </span>
        <span style={{ color: "#64748b", fontSize: 13 }}>· {stats.totalReviews} đánh giá</span>
      </div>

      {loading ? (
        <p style={{ color: "#94a3b8", fontSize: 13 }}>Đang tải đánh giá...</p>
      ) : error ? (
        <p style={{ color: "#b91c1c", fontSize: 13 }}>
          {error}{" "}
          <button
            type="button"
            onClick={() => loadReviews(page)}
            style={{ background: "none", border: "none", color: "#002366", textDecoration: "underline", cursor: "pointer", fontSize: 13, padding: 0 }}
          >
            Thử lại
          </button>
        </p>
      ) : reviews.length === 0 ? (
        <p style={{ color: "#94a3b8", fontSize: 13 }}>Chưa có đánh giá nào cho phòng này.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {reviews.map((review) => (
            <div key={review.id} style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: 14 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                  gap: 8,
                }}
              >
                <strong style={{ color: "#002366", fontSize: 13 }}>{review.reviewer_name}</strong>
                <span style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap" }}>
                  {formatDate(review.created_at)}
                </span>
              </div>
              <StarRating value={review.rating} size={13} />
              {review.comment && (
                <p style={{ color: "#475569", fontSize: 13, margin: "6px 0 0", lineHeight: 1.6 }}>
                  {review.comment}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 16 }}>
          <button
            type="button"
            onClick={() => loadReviews(Math.max(1, page - 1))}
            disabled={page <= 1}
            style={{
              background: "none",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              cursor: page <= 1 ? "not-allowed" : "pointer",
              color: "#002366",
            }}
          >
            ← Trước
          </button>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            Trang {page}/{totalPages}
          </span>
          <button
            type="button"
            onClick={() => loadReviews(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            style={{
              background: "none",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              cursor: page >= totalPages ? "not-allowed" : "pointer",
              color: "#002366",
            }}
          >
            Sau →
          </button>
        </div>
      )}
    </div>
  );
}
