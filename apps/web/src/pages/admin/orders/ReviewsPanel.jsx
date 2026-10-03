import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Pagination, SkeletonRows } from "../../../components/admin/ui";
import ConfirmModal from "../../../components/ConfirmModal";
import StarRating from "../../../components/StarRating";
import { useToast } from "../../../context/ToastContext";
import { listReviews, setReviewHidden } from "../../../services/reviewService";
import { apiErrorText } from "../../../utils/apiError";
import { useAsyncData } from "../../../utils/useAsyncData";

const PAGE_SIZE = 20;

// Guest reviews, newest first, with hide/show moderation.
export default function ReviewsPanel() {
  const { t, i18n } = useTranslation("orders");
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [roomFilter, setRoomFilter] = useState("");
  const [toToggle, setToToggle] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const { data, loading, error, setData } = useAsyncData(`reviews:${page}`, () => listReviews({ page, limit: PAGE_SIZE }));
  const reviews = useMemo(() => {
    const needle = roomFilter.trim().toLowerCase();
    const all = data?.data || [];
    return needle ? all.filter((review) => (review.room_name || "").toLowerCase().includes(needle)) : all;
  }, [data, roomFilter]);

  const confirmToggle = async () => {
    const target = toToggle;
    setBusyId(target.id);
    try {
      await setReviewHidden(target.id, !target.is_hidden);
      setData((current) => ({ ...current, data: current.data.map((r) => (r.id === target.id ? { ...r, is_hidden: !target.is_hidden } : r)) }));
      toast.success(target.is_hidden ? t("reviews.shownToast") : t("reviews.hiddenToast"));
    } catch (err) {
      toast.error(apiErrorText(err, "orders:actionFailed"));
    } finally {
      setBusyId(null);
      setToToggle(null);
    }
  };

  const pagination = data?.pagination;

  return (
    <div className="adm-panel" style={{ overflow: "hidden", marginTop: 28 }}>
      <div className="adm-toolbar">
        <h2 className="adm-panel-title" style={{ margin: 0 }}>{t("reviews.title")}</h2>
        <input className="adm-input" style={{ maxWidth: 260 }} type="search" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} placeholder={t("reviews.filter")} aria-label={t("reviews.filter")} />
      </div>

      <Alert>{error ? apiErrorText(error, "admin:loadFailed") : ""}</Alert>

      {!loading && reviews.length === 0 ? (
        <p className="adm-empty">{roomFilter ? t("reviews.noMatch") : t("reviews.empty")}</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>{t("reviews.columns.room")}</th>
                <th>{t("reviews.columns.author")}</th>
                <th>{t("reviews.columns.rating")}</th>
                <th>{t("reviews.columns.comment")}</th>
                <th>{t("reviews.columns.date")}</th>
                <th>{t("reviews.columns.status")}</th>
                <th className="is-right">{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data ? (
                <SkeletonRows rows={4} columns={7} />
              ) : (
                reviews.map((review) => (
                  <tr key={review.id}>
                    <td>{review.room_name}</td>
                    <td>
                      <div style={{ color: "var(--color-text-primary)" }}>{review.user_name}</div>
                      <div className="adm-cell-sub">{review.user_email}</div>
                    </td>
                    <td><StarRating value={review.rating} size={14} /></td>
                    <td style={{ maxWidth: 280 }}>{review.comment || "—"}</td>
                    <td>{new Date(review.created_at).toLocaleDateString(i18n.language === "en" ? "en-US" : "vi-VN")}</td>
                    <td><Badge tone={review.is_hidden ? "danger" : "success"}>{review.is_hidden ? t("reviews.hidden") : t("reviews.visible")}</Badge></td>
                    <td className="is-right">
                      <button type="button" className="adm-btn adm-btn--muted adm-btn--small" disabled={busyId === review.id} onClick={() => setToToggle(review)}>
                        {review.is_hidden ? t("reviews.show") : t("reviews.hide")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <Pagination page={page} totalPages={pagination.totalPages} total={pagination.total} pageSize={PAGE_SIZE} onChange={setPage} />
      )}

      <ConfirmModal
        open={Boolean(toToggle)}
        title={toToggle?.is_hidden ? t("reviews.showTitle") : t("reviews.hideTitle")}
        message={toToggle?.is_hidden ? t("reviews.showMessage") : t("reviews.hideMessage")}
        confirmLabel={toToggle?.is_hidden ? t("reviews.show") : t("reviews.hide")}
        tone={toToggle?.is_hidden ? "default" : "danger"}
        loading={Boolean(toToggle) && busyId === toToggle.id}
        onConfirm={confirmToggle}
        onCancel={() => setToToggle(null)}
      />
    </div>
  );
}
