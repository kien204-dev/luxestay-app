import { useTranslation } from "react-i18next";
import GuestIcon from "./icons";

// 1 … 4 5 6 … 12: the first and last page, and the ones around the current.
function pagesToShow(page, totalPages) {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  return sorted.flatMap((n, i) => (i > 0 && n - sorted[i - 1] > 1 ? ["gap", n] : [n]));
}

// Paging under a list. Wide screens get "showing 1–12 of 50" and numbered
// pages; phones get previous / "page 1 of 5" / next. Hidden with one page.
// `rangeKey` is the translation of "showing 1–12 of 50 rooms" for what is listed.
export default function Pagination({ page, totalPages, total, pageSize, onChange, rangeKey = "list.showing" }) {
  const { t } = useTranslation("site");
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className="pager" aria-label={t("list.pagination")}>
      <span className="pager-range">{t(rangeKey, { from, to, count: total })}</span>
      <ul>
        <li>
          <button type="button" className="pager-step" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t("list.previous")}>
            <GuestIcon.Previous small />
            <span>{t("list.previous")}</span>
          </button>
        </li>
        {pagesToShow(page, totalPages).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} className="pager-number" aria-hidden="true">…</li>
          ) : (
            <li key={item} className="pager-number">
              <button type="button" aria-current={item === page ? "page" : undefined} aria-label={t("list.goToPage", { page: item })} onClick={() => onChange(item)}>
                {item}
              </button>
            </li>
          )
        )}
        <li className="pager-position">{t("list.pageOf", { page, total: totalPages })}</li>
        <li>
          <button type="button" className="pager-step" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label={t("list.next")}>
            <span>{t("list.next")}</span>
            <GuestIcon.Next small />
          </button>
        </li>
      </ul>
    </nav>
  );
}
