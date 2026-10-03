import { useTranslation } from "react-i18next";
import Icon from "../../utils/icon";
import "../../styles/admin.css";

// Building blocks shared by the admin pages. Styling lives in
// styles/admin.css (theme variables only); text comes from the caller or the
// "admin" namespace.

export function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="adm-page-header">
      <div>
        <h1 className="adm-title">{title}</h1>
        {subtitle && <p className="adm-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="adm-actions">{actions}</div>}
    </header>
  );
}

export function RefreshButton({ onClick, loading }) {
  const { t } = useTranslation("admin");
  return (
    <button type="button" className="adm-icon-btn" onClick={onClick} disabled={loading} title={t("refresh")} aria-label={t("refresh")}>
      <Icon.Refresh />
    </button>
  );
}

export function Alert({ children }) {
  if (!children) return null;
  return (
    <div role="alert" className="adm-alert">
      {children}
    </div>
  );
}

export function KpiCard({ label, value, sub, icon: MainIcon, tone = "", loading }) {
  return (
    <div className="adm-panel adm-kpi">
      <div style={{ minWidth: 0 }}>
        <p className="adm-kpi-label">{label}</p>
        {loading ? <div className="luxe-skeleton" style={{ height: 26, width: 60, marginBottom: 8 }} /> : <p className="adm-kpi-value">{value}</p>}
        {sub && <p className="adm-kpi-sub">{sub}</p>}
      </div>
      {MainIcon && (
        <div className={`adm-kpi-icon ${tone ? `is-${tone}` : ""}`}>
          <MainIcon />
        </div>
      )}
    </div>
  );
}

export function Field({ label, htmlFor, hint, wide, children }) {
  return (
    <div className={`adm-field ${wide ? "is-wide" : ""}`}>
      {label && (
        <label className="adm-label" htmlFor={htmlFor}>
          {label}
        </label>
      )}
      {children}
      {hint && <p className="adm-hint">{hint}</p>}
    </div>
  );
}

export function Badge({ tone = "neutral", dot, children, ...rest }) {
  return (
    <span className={`adm-badge adm-badge--${tone}`} {...rest}>
      {dot && <span className="adm-dot" />}
      {children}
    </span>
  );
}

export function Avatar({ name, id = 0, src }) {
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(-2)
    .toUpperCase();
  return <div className={`adm-avatar ${id % 4 ? `is-v${id % 4}` : ""}`}>{src ? <img src={src} alt="" /> : initials}</div>;
}

// Close on the backdrop or Escape, unless busy.
export function Modal({ title, onClose, busy, wide, children, footer, labelledBy }) {
  return (
    <div className="adm-modal-backdrop" onClick={() => !busy && onClose?.()} onKeyDown={(e) => e.key === "Escape" && !busy && onClose?.()}>
      <div className={`adm-modal ${wide ? "adm-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={(e) => e.stopPropagation()}>
        {title && <h3 id={labelledBy}>{title}</h3>}
        <div className="adm-modal-body">{children}</div>
        {footer && <div className="adm-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push("gap-start");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push("gap-end");
  pages.push(total);
  return pages;
}

// "Showing 1–20 of 135" plus page buttons.
export function Pagination({ page, totalPages, total, pageSize, onChange, testId }) {
  const { t } = useTranslation("admin");
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="adm-pagination" data-testid={testId}>
      <p style={{ margin: 0 }}>
        {t("pagination.showing", { from, to, total })}
        {totalPages > 1 && <span> · {t("pagination.page", { page, totalPages })}</span>}
      </p>
      {totalPages > 1 && (
        <div className="adm-pages">
          <button type="button" className="adm-page" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label={t("pagination.previous")}>
            <Icon.ChevronLeft />
          </button>
          {pageNumbers(page, totalPages).map((n) =>
            typeof n === "number" ? (
              <button key={n} type="button" className={`adm-page ${n === page ? "is-current" : ""}`} onClick={() => onChange(n)} aria-current={n === page ? "page" : undefined}>
                {n}
              </button>
            ) : (
              <span key={n} className="adm-page-gap">
                …
              </span>
            )
          )}
          <button type="button" className="adm-page" onClick={() => onChange(page + 1)} disabled={page >= totalPages} aria-label={t("pagination.next")}>
            <Icon.ChevronRight />
          </button>
        </div>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 5, columns = 5 }) {
  return Array.from({ length: rows }, (_, i) => (
    <tr key={i}>
      <td colSpan={columns}>
        <div className="luxe-skeleton" style={{ height: 16, width: `${60 + ((i * 13) % 35)}%` }} />
      </td>
    </tr>
  ));
}

export function LanguageSwitch({ className = "adm-lang" }) {
  const { i18n, t } = useTranslation("common");
  const languages = Object.keys(i18n.options.resources || {});
  return (
    <div className={className} role="group" aria-label={t("language.label")}>
      {languages.map((lng) => (
        <button key={lng} type="button" className={i18n.resolvedLanguage === lng ? "is-active" : ""} aria-pressed={i18n.resolvedLanguage === lng} onClick={() => i18n.changeLanguage(lng)}>
          {lng.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
