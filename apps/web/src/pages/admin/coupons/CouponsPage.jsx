import { useState } from "react";
import { useTranslation } from "react-i18next";
import AxIcon from "../../../components/admin/AxIcon";
import { Crumbs, EmptyState, Skel } from "../../../components/admin/ax";
import ConfirmModal from "../../../components/ConfirmModal";
import { useToast } from "../../../context/ToastContext";
import { listCoupons, setCouponActive } from "../../../services/couponService";
import { apiErrorText } from "../../../utils/apiError";
import { localDateString } from "../../../utils/date";
import { formatMoney } from "../../../utils/format";
import { compactMoney, formatNumber, rangeText } from "../../../utils/adminFormat";
import { useAsyncData } from "../../../utils/useAsyncData";
import { useDocumentTitle } from "../../../utils/useDocumentTitle";
import { PHONE_QUERY, useMedia } from "../../../utils/useMedia";
import CouponDrawer, { couponSummary } from "./CouponDrawer";
import { FILTERS, STATE_TONE, couponState, matchesFilter } from "./couponState";

function Usage({ coupon }) {
  const { t, i18n } = useTranslation("coupons");
  const used = coupon.used_count || 0;
  const limit = coupon.usage_limit;
  const share = limit ? Math.min(1, used / limit) : 0;
  return (
    <div className="ax-usage">
      <span className={`ax-usage__bar${limit ? "" : " is-open"}`} aria-hidden="true">
        <i style={{ width: `${share * 100}%` }} />
      </span>
      <span className="ax-usage__t">
        {limit ? t("usage.of", { used: formatNumber(used, i18n.language), limit: formatNumber(limit, i18n.language) }) : t("usage.open", { used: formatNumber(used, i18n.language) })}
      </span>
    </div>
  );
}

// Admin: every coupon with how much of it is used, where it stands
// (worked out from its dates, uses and switch), a switch to stop or resume
// it, and a panel to create or edit one. Switching off keeps the coupon
// and its history; a booking cancelled or expired gives its use back.
export default function CouponsPage() {
  const { t, i18n } = useTranslation("coupons");
  const lang = i18n.language;
  const toast = useToast();
  const phone = useMedia(PHONE_QUERY);
  const { data, error, reload, setData } = useAsyncData("coupons", listCoupons);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | coupon
  const [toDisable, setToDisable] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [now] = useState(() => Date.now());
  useDocumentTitle(t("title"));

  const coupons = (data || []).map((coupon) => ({ ...coupon, state: couponState(coupon, now) }));
  const needle = search.trim().toUpperCase();
  const shown = coupons.filter((coupon) => matchesFilter(coupon.state, filter) && (!needle || coupon.code.includes(needle)));
  const countOf = (key) => coupons.filter((coupon) => matchesFilter(coupon.state, key)).length;
  const totalUses = coupons.reduce((sum, coupon) => sum + (coupon.used_count || 0), 0);
  const totalDiscount = coupons.reduce((sum, coupon) => sum + (coupon.discount_total || 0), 0);

  const toggle = async (coupon, active) => {
    setBusyId(coupon.id);
    try {
      const result = await setCouponActive(coupon.id, active);
      setData((current) => current.map((item) => (item.id === coupon.id ? { ...item, ...result.coupon } : item)));
      toast.success(active ? t("toast.activated", { code: coupon.code }) : t("toast.deactivated", { code: coupon.code }));
    } catch (err) {
      toast.error(apiErrorText(err, "coupons:actionFailed"));
    } finally {
      setBusyId(null);
      setToDisable(null);
    }
  };

  const period = (coupon) => {
    const end = localDateString(new Date(coupon.expires_at));
    return coupon.starts_at ? rangeText(localDateString(new Date(coupon.starts_at)), end, lang) : t("period.until", { date: rangeText(end, end, lang) });
  };
  const value = (coupon) => (coupon.discount_type === "percent" ? `${Number(coupon.discount_value)}%` : formatMoney(coupon.discount_value, lang));
  const badge = (coupon) => <span className={`ax-badge ax-badge--${STATE_TONE[coupon.state]}`}>{t(`state.${coupon.state}`)}</span>;
  const switchFor = (coupon) => (
    <label className="ax-switch">
      <input
        type="checkbox"
        role="switch"
        checked={coupon.is_active}
        disabled={busyId === coupon.id}
        aria-label={t(coupon.is_active ? "toggle.off" : "toggle.on", { code: coupon.code })}
        onChange={() => (coupon.is_active ? setToDisable(coupon) : toggle(coupon, true))}
        data-testid="coupon-toggle"
      />
    </label>
  );
  const editButton = (coupon) => (
    <button type="button" className="g-btn g-btn--small ax-btn-sm ax-btn-ghost" onClick={() => setEditing(coupon)} aria-label={t("editCode", { code: coupon.code })}>
      {t("edit")}
    </button>
  );

  let content;
  if (error && !data) {
    content = (
      <EmptyState error icon="alert" title={t("states.errorTitle")} actions={<button type="button" className="g-btn g-btn--primary" onClick={reload}>{t("admin:retry")}</button>} testId="coupons-error">
        {apiErrorText(error, "admin:loadFailed")}
      </EmptyState>
    );
  } else if (!data) {
    content = (
      <div className="ax-skelrows" aria-busy="true" data-testid="coupons-loading">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="ax-skelrow">
            <Skel variant="text" width={160} />
            <Skel variant="text" width={70} />
            <Skel height={6} width={170} />
            <Skel variant="text" width={150} />
            <Skel width={90} height={24} style={{ marginLeft: "auto" }} />
          </div>
        ))}
      </div>
    );
  } else if (shown.length === 0) {
    content = (
      <EmptyState
        icon="coupons"
        title={coupons.length ? t("states.noneHere") : t("states.none")}
        actions={
          <>
            {coupons.length > 0 && (
              <button type="button" className="g-btn g-btn--outline" onClick={() => { setFilter("all"); setSearch(""); }}>
                {t("states.clear")}
              </button>
            )}
            <button type="button" className="g-btn g-btn--primary" onClick={() => setEditing("new")}>{t("add")}</button>
          </>
        }
        testId="coupons-empty"
      >
        {coupons.length ? t("states.noneHereHelp") : t("states.noneHelp")}
      </EmptyState>
    );
  } else if (phone) {
    content = (
      <div className="ax-ocards" data-testid="coupons-cards">
        {shown.map((coupon) => (
          <div key={coupon.id} className="ax-ocard ax-ccard">
            <span className="ax-ocard__r1">
              <b className="ax-mono">{coupon.code}</b>
              {badge(coupon)}
            </span>
            <span className="ax-ocard__meta">{couponSummary(t, coupon, lang)}</span>
            <Usage coupon={coupon} />
            <span className="ax-ocard__meta">{period(coupon)}</span>
            <span className="ax-ocard__r3">
              {switchFor(coupon)}
              {editButton(coupon)}
            </span>
          </div>
        ))}
      </div>
    );
  } else {
    content = (
      <table className="ax-table" data-testid="coupons-table">
        <thead>
          <tr>
            <th scope="col">{t("columns.code")}</th>
            <th scope="col" className="is-num">{t("columns.value")}</th>
            <th scope="col">{t("columns.usage")}</th>
            <th scope="col">{t("columns.period")}</th>
            <th scope="col">{t("columns.state")}</th>
            <th scope="col">{t("columns.active")}</th>
            <th scope="col" className="ax-hide-md"><span className="sr-only">{t("columns.actions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((coupon) => (
            <tr key={coupon.id} data-testid="coupon-row">
              <td className="ax-wrapcell">
                <button type="button" className="ax-codebtn ax-mono" onClick={() => setEditing(coupon)} aria-label={t("editCode", { code: coupon.code })}>
                  {coupon.code}
                </button>
                <div className="ax-sub">{couponSummary(t, coupon, lang)}</div>
              </td>
              <td className="is-num">{value(coupon)}</td>
              <td><Usage coupon={coupon} /></td>
              <td>{period(coupon)}</td>
              <td>{badge(coupon)}</td>
              <td>{switchFor(coupon)}</td>
              <td className="is-right ax-hide-md">{editButton(coupon)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const saved = compactMoney(totalDiscount, lang);

  return (
    <div className="ax-screen" data-testid="coupons-page">
      <div className="ax-head">
        <div>
          <Crumbs current={t("title")} />
          <h1>{t("title")}</h1>
          <p>
            {data
              ? [t("head.codes", { count: coupons.length }), t("head.uses", { count: totalUses }), t("head.saved", { amount: `${saved.value} ${saved.unit}` })].join(" · ")
              : t("head.loading")}
          </p>
        </div>
        <div className="ax-actions">
          <button type="button" className="g-btn g-btn--primary" onClick={() => setEditing("new")} data-testid="coupon-add">
            <AxIcon name="plus" small />
            {t("add")}
          </button>
        </div>
      </div>

      <section className="ax-tablewrap" aria-label={t("listLabel")}>
        <div className="ax-tablebar">
          <div className="fx-control ax-tsearch">
            <AxIcon name="search" />
            <input type="search" aria-label={t("search")} placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="ax-chipset" role="group" aria-label={t("filterLabel")}>
            {FILTERS.map((key) => (
              <button key={key} type="button" className="ax-chip" aria-pressed={filter === key} onClick={() => setFilter(key)} data-testid={`coupon-filter-${key}`}>
                {t(`filter.${key}`)}
                {data && ` · ${key === "all" ? coupons.length : countOf(key)}`}
              </button>
            ))}
          </div>
        </div>
        <div className={phone ? "ax-tablebody ax-tablebody--cards" : "ax-tablebody"}>{content}</div>
      </section>

      {editing && (
        <CouponDrawer
          coupon={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(created, code) => {
            setEditing(null);
            toast.success(created ? t("toast.created", { code }) : t("toast.updated", { code }));
            reload();
          }}
        />
      )}

      <ConfirmModal
        open={Boolean(toDisable)}
        title={t("confirmDisable.title", { code: toDisable?.code })}
        message={t("confirmDisable.message")}
        confirmLabel={t("confirmDisable.action")}
        loading={Boolean(toDisable) && busyId === toDisable.id}
        onConfirm={() => toggle(toDisable, false)}
        onCancel={() => setToDisable(null)}
      />
    </div>
  );
}
