import { useTranslation } from "react-i18next";

export default function Pagination({ page, totalPages, onChange }) {
  const { t } = useTranslation("site");

  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label={t("list.pagination")}>
      <button
        type="button"
        className="g-btn g-btn--outline g-btn--small"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        ‹ {t("list.previous")}
      </button>
      <span>{t("list.pageOf", { page, total: totalPages })}</span>
      <button
        type="button"
        className="g-btn g-btn--outline g-btn--small"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        {t("list.next")} ›
      </button>
    </nav>
  );
}
