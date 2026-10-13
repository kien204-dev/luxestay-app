import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AxIcon from "../../../components/admin/AxIcon";
import { Crumbs, EmptyState, Pager, Skel } from "../../../components/admin/ax";
import StarRating from "../../../components/StarRating";
import { initials } from "../../../layout/admin/AccountMenu";
import { useToast } from "../../../context/ToastContext";
import { listReviews, setReviewHidden } from "../../../services/reviewService";
import { apiErrorText } from "../../../utils/apiError";
import { bookingCode } from "../../../utils/bookingCode";
import { formatNumber, momentText } from "../../../utils/adminFormat";
import { useAsyncData } from "../../../utils/useAsyncData";
import { useDocumentTitle } from "../../../utils/useDocumentTitle";

const PAGE_SIZE = 20;
const FILTERS = [
  { key: "all", params: {} },
  { key: "five", params: { stars: "5" }, count: (s) => s.five },
  { key: "low", params: { stars: "low" }, count: (s) => s.low },
  { key: "hidden", params: { hidden: "true" }, count: (s) => s.hidden },
];

// Admin: guests' reviews, newest first, searched by guest, room, text or
// booking code and filtered by stars or hidden; a switch shows or hides
// each one on the guest site. Reviews are never edited or answered here.
export default function ReviewsPage() {
  const { t, i18n } = useTranslation("orders");
  const lang = i18n.language;
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.find((item) => item.key === params.get("filter")) || FILTERS[0];
  const q = params.get("q") || "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [text, setText] = useState(q);
  const [busyId, setBusyId] = useState(null);
  useDocumentTitle(t("reviews.pageTitle"));

  const update = (changes) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, String(value)) : next.delete(key)));
      if (!("page" in changes)) next.delete("page");
      return next;
    }, { replace: true });

  useEffect(() => {
    if (text.trim() === q) return undefined;
    const timer = setTimeout(() => update({ q: text.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const query = { page, limit: PAGE_SIZE, ...filter.params, ...(q && { q }) };
  const { data, error, loading, reload, setData } = useAsyncData(`reviews:${JSON.stringify(query)}`, () => listReviews(query));
  const reviews = data?.data || [];
  const summary = data?.summary;

  const toggle = async (review) => {
    setBusyId(review.id);
    try {
      await setReviewHidden(review.id, !review.is_hidden);
      setData((current) => ({
        ...current,
        data: current.data.map((item) => (item.id === review.id ? { ...item, is_hidden: !review.is_hidden } : item)),
        summary: current.summary && { ...current.summary, hidden: current.summary.hidden + (review.is_hidden ? -1 : 1) },
      }));
      toast.success(review.is_hidden ? t("reviews.shownToast") : t("reviews.hiddenToast"));
    } catch (err) {
      toast.error(apiErrorText(err, "orders:actionFailed"));
    } finally {
      setBusyId(null);
    }
  };

  let content;
  if (error && !data) {
    content = (
      <EmptyState error icon="alert" title={t("reviews.errorTitle")} actions={<button type="button" className="g-btn g-btn--primary" onClick={reload}>{t("admin:retry")}</button>} testId="reviews-error">
        {apiErrorText(error, "admin:loadFailed")}
      </EmptyState>
    );
  } else if (!data) {
    content = (
      <div className="ax-skelrows" aria-busy="true" data-testid="reviews-loading">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="ax-skelrev">
            <Skel width={32} height={32} style={{ borderRadius: "50%" }} />
            <div style={{ flex: 1 }}>
              <Skel variant="text" width="40%" />
              <Skel variant="text" width="85%" />
              <Skel variant="text" width="30%" />
            </div>
            <Skel width={44} height={26} />
          </div>
        ))}
      </div>
    );
  } else if (reviews.length === 0) {
    const filtered = Boolean(q) || filter.key !== "all";
    content = (
      <EmptyState
        icon="reviews"
        title={q ? t("reviews.noMatchTerm", { term: q }) : filtered ? t("reviews.noMatch") : t("reviews.empty")}
        actions={filtered ? <button type="button" className="g-btn g-btn--outline" onClick={() => { setText(""); update({ q: "", filter: "" }); }}>{t("reviews.clear")}</button> : null}
        testId="reviews-empty"
      >
        {filtered ? t("reviews.noMatchHelp") : t("reviews.emptyHelp")}
      </EmptyState>
    );
  } else {
    content = (
      <ul className="ax-reviews" data-testid="reviews-list">
        {reviews.map((review) => (
          <li key={review.id} className={`ax-review${review.is_hidden ? " is-hidden" : ""}`} data-testid="review-row">
            <span className="ax-avatar ax-avatar--sm" aria-hidden="true">{initials(review.user_name)}</span>
            <div className="ax-review__main">
              <div className="ax-review__meta">
                <b>{review.user_name}</b>
                <span className="ax-muted">{momentText(review.created_at, lang)}</span>
                <StarRating value={review.rating} size={14} color="var(--brass)" />
                <span className={`ax-badge${review.is_hidden ? " ax-badge--neutral ax-badge--outline" : " ax-badge--success"}`}>
                  {review.is_hidden ? t("reviews.hidden") : t("reviews.visible")}
                </span>
              </div>
              <p className={`ax-review__text${review.comment ? "" : " is-empty"}`}>{review.comment || t("reviews.noComment")}</p>
              <p className="ax-review__room">
                {review.room_name}
                {review.booking_id && (
                  <>
                    {" · "}
                    <Link to={`/admin/orders?booking=${review.booking_id}`}>{bookingCode(review.booking_id)}</Link>
                  </>
                )}
              </p>
            </div>
            <label className="ax-switch ax-review__switch">
              <span>{review.is_hidden ? t("reviews.off") : t("reviews.on")}</span>
              <input
                type="checkbox"
                role="switch"
                checked={!review.is_hidden}
                disabled={busyId === review.id}
                aria-label={t("reviews.toggleLabel", { name: review.user_name, room: review.room_name })}
                onChange={() => toggle(review)}
                data-testid="review-toggle"
              />
            </label>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="ax-screen" data-testid="reviews-page">
      <div className="ax-head">
        <div>
          <Crumbs current={t("reviews.pageTitle")} />
          <h1>{t("reviews.pageTitle")}</h1>
          <p>
            {summary
              ? [
                  summary.average != null ? t("reviews.average", { value: formatNumber(summary.average, lang, 2) }) : null,
                  t("reviews.total", { count: summary.total }),
                  t("reviews.hiddenCount", { count: summary.hidden }),
                ].filter(Boolean).join(" · ")
              : t("reviews.pageSubtitle")}
          </p>
        </div>
      </div>

      <section className="ax-tablewrap" aria-label={t("reviews.listLabel")} aria-busy={loading}>
        <div className="ax-tablebar">
          <div className="fx-control ax-tsearch">
            <AxIcon name="search" />
            <input type="search" aria-label={t("reviews.search")} placeholder={t("reviews.searchPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="ax-chipset" role="group" aria-label={t("reviews.filterLabel")}>
            {FILTERS.map((item) => (
              <button key={item.key} type="button" className="ax-chip" aria-pressed={filter.key === item.key} onClick={() => update({ filter: item.key === "all" ? "" : item.key })} data-testid={`review-filter-${item.key}`}>
                {t(`reviews.filters.${item.key}`)}
                {summary && item.count && ` · ${item.count(summary)}`}
              </button>
            ))}
          </div>
        </div>
        <div className="ax-tablebody">{content}</div>
        {data && reviews.length > 0 && (
          <Pager
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            total={data.pagination.total}
            limit={data.pagination.limit}
            onPage={(next) => update({ page: next })}
            ofText={t("reviews.of", { count: data.pagination.total })}
            testId="reviews-pagination"
          />
        )}
      </section>
    </div>
  );
}
