import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Field, Modal } from "../../../components/admin/ui";
import { createCoupon, updateCoupon } from "../../../services/couponService";
import { apiErrorText } from "../../../utils/apiError";

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time with no zone suffix,
// so build it from local getters rather than toISOString().
function toDateTimeLocal(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const text = (value) => (value != null ? String(value) : "");

// Create a coupon, or edit one (`coupon` set). Calls onSaved(created).
export default function CouponFormModal({ coupon, onClose, onSaved }) {
  const { t } = useTranslation("coupons");
  const [form, setForm] = useState(() => ({
    code: coupon?.code || "",
    discount_type: coupon?.discount_type || "percent",
    discount_value: text(coupon?.discount_value),
    max_discount_amount: text(coupon?.max_discount_amount),
    min_booking_amount: text(coupon?.min_booking_amount),
    expires_at: coupon ? toDateTimeLocal(coupon.expires_at) : "",
    usage_limit: text(coupon?.usage_limit),
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    const payload = {
      ...form,
      max_discount_amount: form.max_discount_amount || undefined,
      min_booking_amount: form.min_booking_amount || undefined,
      usage_limit: form.usage_limit || undefined,
    };
    try {
      if (coupon) await updateCoupon(coupon.id, payload);
      else await createCoupon(payload);
      onSaved(!coupon);
    } catch (err) {
      setError(apiErrorText(err, "coupons:form.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const unit = form.discount_type === "percent" ? "%" : "đ";

  return (
    <Modal title={coupon ? t("form.editTitle") : t("form.addTitle")} onClose={onClose} busy={saving} labelledBy="coupon-form-title">
      <form onSubmit={submit} className="adm-modal-body">
        <Field label={t("form.code")} htmlFor="coupon-code" hint={t("form.codeHint")}>
          <input id="coupon-code" className="adm-input" value={form.code} onChange={set("code")} placeholder="SUMMER2026" required />
        </Field>
        <div className="adm-form-grid">
          <Field label={t("form.type")} htmlFor="coupon-type">
            <select id="coupon-type" className="adm-select" value={form.discount_type} onChange={set("discount_type")}>
              <option value="percent">{t("type.percent")}</option>
              <option value="fixed">{t("type.fixed")}</option>
            </select>
          </Field>
          <Field label={t("form.value", { unit })} htmlFor="coupon-value">
            <input id="coupon-value" type="number" min="0" step="any" className="adm-input" value={form.discount_value} onChange={set("discount_value")} required />
          </Field>
          <Field label={t("form.maxDiscount")} htmlFor="coupon-max">
            <input id="coupon-max" type="number" min="0" className="adm-input" value={form.max_discount_amount} onChange={set("max_discount_amount")} placeholder={t("form.noLimit")} />
          </Field>
          <Field label={t("form.minAmount")} htmlFor="coupon-min">
            <input id="coupon-min" type="number" min="0" className="adm-input" value={form.min_booking_amount} onChange={set("min_booking_amount")} placeholder={t("form.noMinimum")} />
          </Field>
          <Field label={t("form.expires")} htmlFor="coupon-expires">
            <input id="coupon-expires" type="datetime-local" className="adm-input" value={form.expires_at} onChange={set("expires_at")} required />
          </Field>
          <Field label={t("form.usageLimit")} htmlFor="coupon-limit">
            <input id="coupon-limit" type="number" min="1" step="1" className="adm-input" value={form.usage_limit} onChange={set("usage_limit")} placeholder={t("form.noLimit")} />
          </Field>
        </div>

        <Alert>{error}</Alert>

        <div className="adm-modal-footer">
          <button type="submit" className="adm-btn adm-btn--primary" disabled={saving}>
            {saving ? t("admin:saving") : coupon ? t("admin:save") : t("form.create")}
          </button>
          <button type="button" className="adm-btn adm-btn--muted" onClick={onClose} disabled={saving}>
            {t("admin:cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
