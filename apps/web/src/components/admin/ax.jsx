import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AxIcon from "./AxIcon";

// Small pieces shared by the redesigned admin screens (admin-shell.css).

export function Crumbs({ current }) {
  const { t } = useTranslation("admin");
  return (
    <nav aria-label={t("crumbs.label")}>
      <ol className="ax-crumbs">
        <li><Link to="/admin">{t("crumbs.admin")}</Link></li>
        <li aria-current="page">{current}</li>
      </ol>
    </nav>
  );
}

export function Skel({ width, height, variant, style }) {
  return <span className={`ax-skel${variant ? ` ax-skel--${variant}` : ""}`} style={{ width, height, ...style }} aria-hidden="true" />;
}

// An empty or failed state: a picture, a title, a line, then actions.
export function EmptyState({ icon = "inbox", title, children, actions, error = false, compact = false, testId }) {
  return (
    <div className={`ax-empty${error ? " ax-empty--error" : ""}${compact ? " ax-empty--compact" : ""}`} role={error ? "alert" : undefined} data-testid={testId}>
      <div className="ax-empty__art"><AxIcon name={icon} /></div>
      <p className="ax-empty__t">{title}</p>
      {children && <p className="ax-empty__d">{children}</p>}
      {actions && <div className="ax-empty__a">{actions}</div>}
    </div>
  );
}

// ▲ 12,4% / ▼ 3,2% (or points). `value` is a signed number already in the
// unit shown; null shows nothing.
export function Delta({ value, text }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const direction = value > 0.0005 ? "up" : value < -0.0005 ? "down" : "flat";
  const mark = direction === "up" ? "▲" : direction === "down" ? "▼" : "■";
  return (
    <span className={`ax-delta${direction === "flat" ? "" : ` is-${direction}`}`}>
      <span aria-hidden="true">{mark}</span> {text}
    </span>
  );
}

export function Alert({ tone = "danger", title, children }) {
  return (
    <div className={`ax-alert${tone === "danger" ? "" : ` ax-alert--${tone}`}`} role={tone === "danger" ? "alert" : "status"}>
      <AxIcon name={tone === "info" ? "info" : "alert"} />
      <p>{title && <b>{title} </b>}{children}</p>
    </div>
  );
}

// Server-side pages: "Showing 1–20 of N …", then Previous, numbers with
// gaps, Next. `ofText` is the "of N bookings" part, worded by the caller.
export function Pager({ page, totalPages, total, limit, onPage, ofText, testId }) {
  const { t } = useTranslation("admin");
  const first = total ? (page - 1) * limit + 1 : 0;
  const last = Math.min(total, page * limit);
  const pages = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages.at(-1) !== "…") pages.push("…");
  }
  return (
    <nav className="ax-pager" aria-label={t("pager.label")} data-testid={testId}>
      <span>
        {t("pager.showing")} <b>{first}–{last}</b> {ofText}
      </span>
      <ul className="ax-pages">
        <li>
          <button type="button" className="ax-page ax-page--nav" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("pager.previous")}</button>
        </li>
        {pages.map((p, i) => (
          <li key={`${p}-${i}`}>
            {p === "…" ? (
              <span className="ax-page ax-page--gap" aria-hidden="true">…</span>
            ) : (
              <button type="button" className="ax-page" aria-current={p === page ? "page" : undefined} aria-label={t("pager.page", { page: p })} onClick={() => onPage(p)}>
                {p}
              </button>
            )}
          </li>
        ))}
        <li>
          <button type="button" className="ax-page ax-page--nav" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>{t("pager.next")}</button>
        </li>
      </ul>
    </nav>
  );
}
