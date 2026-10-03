import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field } from "../../../components/admin/ui";
import { updateSettings } from "../../../services/settingsService";
import { apiErrorText } from "../../../utils/apiError";

const FIELDS = [
  { key: "name", type: "text", maxLength: 100, wide: true },
  { key: "phone", type: "tel", maxLength: 30 },
  { key: "email", type: "email", maxLength: 255 },
  { key: "address", type: "text", maxLength: 255, wide: true },
  { key: "checkInTime", type: "time" },
  { key: "checkOutTime", type: "time" },
  { key: "freeCancellationDays", type: "number", min: 0, max: 365 },
];

// A stored value of null means "not set here": the field is shown empty and
// the value that applies instead is given as a hint.
const toForm = (stored) => Object.fromEntries(FIELDS.map(({ key }) => [key, stored?.[key] ?? ""]));

// The property's identity and house rules. Saved values are used by the
// guest site, emails and PDF confirmations straight away.
export default function PropertyForm({ settings, onSaved, onError }) {
  const { t } = useTranslation("property");
  const [form, setForm] = useState(() => toForm(settings.stored));
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await updateSettings({ ...form, freeCancellationDays: form.freeCancellationDays === "" ? null : Number(form.freeCancellationDays) });
      setForm(toForm(saved.stored));
      onSaved(saved);
    } catch (err) {
      onError(apiErrorText(err, "property:form.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const fallback = (key) => {
    const value = settings.fallback[key];
    return value === "" || value == null ? t("form.noDefault") : String(value);
  };

  return (
    <form onSubmit={submit} className="adm-panel adm-panel--padded" aria-label={t("form.title")}>
      <h2>{t("form.title")}</h2>
      <p className="adm-hint" style={{ margin: "-6px 0 18px" }}>{t("form.subtitle")}</p>
      <div className="adm-form-grid">
        {FIELDS.map(({ key, wide, ...input }) => (
          <Field key={key} label={t(`fields.${key}`)} htmlFor={`property-${key}`} hint={t("form.default", { value: fallback(key) })} wide={wide}>
            <input
              id={`property-${key}`}
              name={key}
              className="adm-input"
              value={form[key]}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              {...input}
            />
          </Field>
        ))}
      </div>
      <div className="adm-actions" style={{ marginTop: 20 }}>
        <button type="submit" className="adm-btn adm-btn--primary" disabled={saving}>
          {saving ? t("admin:saving") : t("form.save")}
        </button>
      </div>
    </form>
  );
}
