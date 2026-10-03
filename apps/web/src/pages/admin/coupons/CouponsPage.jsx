import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, PageHeader, SkeletonRows } from "../../../components/admin/ui";
import ConfirmModal from "../../../components/ConfirmModal";
import { useToast } from "../../../context/ToastContext";
import { listCoupons, setCouponActive } from "../../../services/couponService";
import { apiErrorText } from "../../../utils/apiError";
import { formatMoney } from "../../../utils/format";
import Icon from "../../../utils/icon";
import { useAsyncData } from "../../../utils/useAsyncData";
import useIsMobile from "../../../utils/useIsMobile";
import CouponFormModal from "./CouponFormModal";

// Admin: coupon codes guests can apply when booking.
export default function CouponsPage() {
  const { t, i18n } = useTranslation("coupons");
  const toast = useToast();
  const isMobile = useIsMobile();
  const { data, loading, error, reload, setData } = useAsyncData("coupons", listCoupons);
  const coupons = data || [];
  const [editing, setEditing] = useState(null); // null | "new" | coupon
  const [toDisable, setToDisable] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const lang = i18n.language;

  const value = (c) => (c.discount_type === "percent" ? `${Number(c.discount_value)}%` : formatMoney(c.discount_value, lang));
  const usage = (c) => `${c.used_count} / ${c.usage_limit ?? "∞"}`;
  const expires = (c) => new Date(c.expires_at).toLocaleString(lang === "en" ? "en-US" : "vi-VN");
  const status = (c) => <Badge tone={c.is_active ? "success" : "danger"}>{c.is_active ? t("status.active") : t("status.inactive")}</Badge>;

  const toggle = async (coupon, active) => {
    setBusyId(coupon.id);
    try {
      await setCouponActive(coupon.id, active);
      setData((list) => list.map((c) => (c.id === coupon.id ? { ...c, is_active: active } : c)));
      toast.success(active ? t("toast.activated") : t("toast.deactivated"));
    } catch (err) {
      toast.error(apiErrorText(err, "coupons:actionFailed"));
    } finally {
      setBusyId(null);
      setToDisable(null);
    }
  };
  // Turning a code off can strand a guest mid-checkout, so that is confirmed;
  // turning it back on is harmless.
  const requestToggle = (coupon) => (coupon.is_active ? setToDisable(coupon) : toggle(coupon, true));

  const actions = (c) => (
    <>
      <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" onClick={() => setEditing(c)}>
        {t("admin:edit")}
      </button>
      <button type="button" className="adm-btn adm-btn--muted adm-btn--small" onClick={() => requestToggle(c)} disabled={busyId === c.id}>
        {c.is_active ? t("actions.deactivate") : t("actions.activate")}
      </button>
    </>
  );

  return (
    <div data-testid="coupons-page">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <button type="button" className="adm-btn adm-btn--primary" onClick={() => setEditing("new")}>
            <Icon.Tag />
            {t("add")}
          </button>
        }
      />

      <Alert>{error ? apiErrorText(error, "admin:loadFailed") : ""}</Alert>

      <div className="adm-panel" style={{ overflow: "hidden" }}>
        {!loading && coupons.length === 0 ? (
          <p className="adm-empty">{t("empty")}</p>
        ) : isMobile ? (
          <div className="adm-cards">
            {coupons.map((c) => (
              <div key={c.id} className="adm-card">
                <div className="adm-card-row">
                  <strong style={{ color: "var(--color-text-primary)" }}>{c.code}</strong>
                  {status(c)}
                </div>
                <div>{t("mobileLine", { value: value(c), usage: usage(c) })}</div>
                <div className="adm-cell-sub">{t("expiresOn", { date: expires(c) })}</div>
                <div className="adm-card-actions">{actions(c)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  {["code", "type", "value", "usage", "expires", "status"].map((column) => (
                    <th key={column}>{t(`columns.${column}`)}</th>
                  ))}
                  <th className="is-right">{t("columns.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <SkeletonRows rows={4} columns={7} />
                ) : (
                  coupons.map((c) => (
                    <tr key={c.id}>
                      <td className="is-strong" style={{ color: "var(--color-text-primary)" }}>{c.code}</td>
                      <td>{t(`type.${c.discount_type}`)}</td>
                      <td>{value(c)}</td>
                      <td>{usage(c)}</td>
                      <td>{expires(c)}</td>
                      <td>{status(c)}</td>
                      <td className="is-right"><div className="adm-row-actions">{actions(c)}</div></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <CouponFormModal
          coupon={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(created) => {
            setEditing(null);
            toast.success(created ? t("toast.created") : t("toast.updated"));
            reload();
          }}
        />
      )}

      <ConfirmModal
        open={Boolean(toDisable)}
        title={t("confirm.title")}
        message={t("confirm.message", { code: toDisable?.code })}
        confirmLabel={t("actions.deactivate")}
        tone="danger"
        loading={Boolean(toDisable) && busyId === toDisable.id}
        onConfirm={() => toggle(toDisable, false)}
        onCancel={() => setToDisable(null)}
      />
    </div>
  );
}
