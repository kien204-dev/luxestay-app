import { useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog, { CloseIcon } from "../../../components/Dialog";
import AxIcon from "../../../components/admin/AxIcon";
import { Alert } from "../../../components/admin/ax";
import { Control, Field, inputProps } from "../../../components/auth/fields";
import { createCoupon, updateCoupon } from "../../../services/couponService";
import { apiErrorText } from "../../../utils/apiError";
import { localDateString } from "../../../utils/date";
import { formatMoney } from "../../../utils/format";
import { dayMonth } from "../../../utils/adminFormat";

// The API's rule for a code (couponController).
const CODE_PATTERN = /^[A-Z0-9_-]{3,50}$/;
const text = (value) => (value != null ? String(Number(value)) : "");
const day = (value) => (value ? localDateString(new Date(value)) : "");

// A coupon starts at the beginning of its first day and ends at the end of
// its last day, in the admin's time.
const startOf = (date) => (date ? new Date(`${date}T00:00:00`).toISOString() : "");
const endOf = (date) => (date ? new Date(`${date}T23:59:59`).toISOString() : "");

// What a guest is told about the coupon, from its fields.
export function couponSummary(t, coupon, lang) {
  const value = Number(coupon.discount_value) || 0;
  const parts = [
    coupon.discount_type === "percent"
      ? coupon.max_discount_amount
        ? t("summary.percentMax", { value, max: formatMoney(coupon.max_discount_amount, lang) })
        : t("summary.percent", { value })
      : t("summary.fixed", { value: formatMoney(value, lang) }),
  ];
  if (Number(coupon.min_booking_amount) > 0) parts.push(t("summary.min", { amount: formatMoney(coupon.min_booking_amount, lang) }));
  return parts.join(" · ");
}

// Create or edit a coupon in a panel from the right. Only what the API
// stores and checks at checkout: code, percent or fixed amount, a cap for
// percent, a minimum booking total, first and last day, how many uses.
export default function CouponDrawer({ coupon, onClose, onSaved }) {
  const { t, i18n } = useTranslation("coupons");
  const lang = i18n.language;
  const [form, setForm] = useState(() => ({
    code: coupon?.code || "",
    discount_type: coupon?.discount_type || "percent",
    discount_value: text(coupon?.discount_value),
    max_discount_amount: text(coupon?.max_discount_amount),
    min_booking_amount: text(coupon?.min_booking_amount),
    starts: day(coupon?.starts_at),
    expires: day(coupon?.expires_at),
    usage_limit: coupon?.usage_limit ? String(coupon.usage_limit) : "",
  }));
  const [tried, setTried] = useState(false);
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: key === "code" ? event.target.value.toUpperCase() : event.target.value }));
  const percent = form.discount_type === "percent";

  const errors = {};
  if (!CODE_PATTERN.test(form.code.trim())) errors.code = t("errors.code");
  const value = Number(form.discount_value);
  if (!form.discount_value || !(value > 0)) errors.discount_value = t("errors.value");
  else if (percent && value > 100) errors.discount_value = t("errors.percent");
  if (percent && form.max_discount_amount && !(Number(form.max_discount_amount) > 0)) errors.max_discount_amount = t("errors.max");
  if (form.min_booking_amount && !(Number(form.min_booking_amount) >= 0)) errors.min_booking_amount = t("errors.min");
  if (!form.expires) errors.expires = t("errors.expires");
  else if (form.starts && form.expires < form.starts) errors.expires = t("errors.order");
  const limit = Number(form.usage_limit);
  if (form.usage_limit && !(Number.isInteger(limit) && limit > 0)) errors.usage_limit = t("errors.limit");
  else if (coupon && form.usage_limit && limit < coupon.used_count) errors.usage_limit = t("errors.limitUsed", { count: coupon.used_count });
  const shown = tried ? errors : {};
  const pastEnd = form.expires && form.expires < localDateString();

  const submit = async (event) => {
    event.preventDefault();
    setTried(true);
    setFailure("");
    if (Object.keys(errors).length) {
      document.getElementById(`coupon-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    setSaving(true);
    const payload = {
      code: form.code.trim(),
      discount_type: form.discount_type,
      discount_value: value,
      max_discount_amount: percent && form.max_discount_amount ? Number(form.max_discount_amount) : null,
      min_booking_amount: form.min_booking_amount ? Number(form.min_booking_amount) : null,
      starts_at: form.starts ? startOf(form.starts) : null,
      expires_at: endOf(form.expires),
      usage_limit: form.usage_limit ? limit : null,
    };
    try {
      if (coupon) await updateCoupon(coupon.id, payload);
      else await createCoupon(payload);
      onSaved(!coupon, payload.code);
    } catch (err) {
      setFailure(apiErrorText(err, "coupons:form.saveFailed"));
      setSaving(false);
    }
  };

  // "Guests will see…": the coupon as the checkout will apply it.
  const preview = () => {
    if (errors.discount_value || errors.code) return t("preview.incomplete");
    const parts = [couponSummary(t, { ...form, discount_value: value, max_discount_amount: percent ? form.max_discount_amount : null }, lang)];
    if (form.starts && form.expires) parts.push(t("preview.between", { from: dayMonth(form.starts, lang, true), to: dayMonth(form.expires, lang, true) }));
    else if (form.expires) parts.push(t("preview.until", { to: dayMonth(form.expires, lang, true) }));
    if (form.usage_limit && limit > 0) parts.push(t("preview.uses", { count: Math.max(0, limit - (coupon?.used_count || 0)) }));
    return t("preview.text", { code: form.code.trim(), rule: parts.join(", ") });
  };

  const close = () => !saving && onClose();
  const field = (name) => inputProps(`coupon-${name}`, shown[name]);

  return (
    <Dialog className="ax-drawer" onClose={close} aria-labelledby="coupon-title" data-testid="coupon-drawer">
      <form className="ax-drawer__form" onSubmit={submit} noValidate>
        <div className="ax-drawer__head">
          <div>
            <div className="ax-eyebrow">{t("form.eyebrow")}</div>
            <h2 id="coupon-title">{coupon ? t("form.editTitleCode", { code: coupon.code }) : t("form.addTitle")}</h2>
          </div>
          <button type="button" className="ax-iconbtn" aria-label={t("common:dialog.close")} onClick={close}>
            <CloseIcon />
          </button>
        </div>

        <div className="ax-drawer__body ax-drawer__body--form">
          <Field id="coupon-code" label={t("form.code")} error={shown.code} help={<p className="fx-help">{t("form.codeHint")}</p>}>
            <Control invalid={shown.code}>
              <input {...field("code")} className="ax-mono" value={form.code} maxLength={50} autoComplete="off" spellCheck={false} onChange={set("code")} data-autofocus />
            </Control>
          </Field>

          <fieldset className="ax-radiocards">
            <legend className="g-label">{t("form.type")}</legend>
            {["percent", "fixed"].map((kind) => (
              <label key={kind} className={`ax-radiocard${form.discount_type === kind ? " is-on" : ""}`}>
                <input type="radio" name="discount_type" value={kind} checked={form.discount_type === kind} onChange={set("discount_type")} />
                <span>
                  <b>{t(`form.types.${kind}`)}</b>
                  <small>{t(`form.types.${kind}Hint`)}</small>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="ax-g2">
            <Field id="coupon-discount_value" label={t("form.value")} error={shown.discount_value}>
              <Control invalid={shown.discount_value}>
                <input {...field("discount_value")} type="number" inputMode="decimal" min="0" value={form.discount_value} onChange={set("discount_value")} />
                <span className="ax-suffix">{percent ? "%" : t("form.currency")}</span>
              </Control>
            </Field>
            {percent ? (
              <Field id="coupon-max_discount_amount" label={<>{t("form.max")} <span className="ax-opt">{t("form.optional")}</span></>} error={shown.max_discount_amount}>
                <Control invalid={shown.max_discount_amount}>
                  <input {...field("max_discount_amount")} type="number" inputMode="numeric" min="0" value={form.max_discount_amount} onChange={set("max_discount_amount")} />
                  <span className="ax-suffix">{t("form.currency")}</span>
                </Control>
              </Field>
            ) : (
              <span />
            )}
          </div>

          <Field id="coupon-min_booking_amount" label={<>{t("form.min")} <span className="ax-opt">{t("form.optional")}</span></>} error={shown.min_booking_amount}>
            <Control invalid={shown.min_booking_amount}>
              <input {...field("min_booking_amount")} type="number" inputMode="numeric" min="0" value={form.min_booking_amount} onChange={set("min_booking_amount")} />
              <span className="ax-suffix">{t("form.currency")}</span>
            </Control>
          </Field>

          <div className="ax-g2">
            <Field id="coupon-starts" label={<>{t("form.starts")} <span className="ax-opt">{t("form.optional")}</span></>} help={<p className="fx-help">{t("form.startsHint")}</p>}>
              <Control>
                <input id="coupon-starts" type="date" value={form.starts} onChange={set("starts")} />
              </Control>
            </Field>
            <Field id="coupon-expires" label={t("form.expires")} error={shown.expires} help={pastEnd && !shown.expires ? <p className="fx-help ax-warn">{t("form.pastEnd")}</p> : null}>
              <Control invalid={shown.expires}>
                <input {...field("expires")} type="date" value={form.expires} min={form.starts || undefined} onChange={set("expires")} />
              </Control>
            </Field>
          </div>

          <Field
            id="coupon-usage_limit"
            label={<>{t("form.limit")} <span className="ax-opt">{t("form.optional")}</span></>}
            error={shown.usage_limit}
            help={coupon ? <p className="fx-help">{t("form.used", { count: coupon.used_count })}</p> : <p className="fx-help">{t("form.limitHint")}</p>}
          >
            <Control invalid={shown.usage_limit}>
              <input {...field("usage_limit")} type="number" inputMode="numeric" min="1" step="1" value={form.usage_limit} onChange={set("usage_limit")} />
              <span className="ax-suffix">{t("form.uses")}</span>
            </Control>
          </Field>

          <div className="ax-preview" aria-live="polite" data-testid="coupon-preview">
            <AxIcon name="eye" />
            <p>{preview()}</p>
          </div>
          {failure && <Alert>{failure}</Alert>}
        </div>

        <div className="ax-drawer__foot">
          <button type="button" className="g-btn g-btn--outline" onClick={close} disabled={saving}>
            {t("form.cancel")}
          </button>
          <button type="submit" className="g-btn g-btn--primary is-grow" disabled={saving} data-testid="coupon-save">
            {saving ? t("admin:saving") : coupon ? t("form.save") : t("form.create")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
