import { useState } from "react";
import { useTranslation } from "react-i18next";
import AxIcon from "../../../components/admin/AxIcon";
import { Alert, Crumbs, EmptyState, Skel } from "../../../components/admin/ax";
import { FormSection, SaveBar, Stepper, useLeaveWarning } from "../../../components/admin/form";
import { Control, Field, inputProps } from "../../../components/auth/fields";
import { useProperty } from "../../../context/PropertyContext";
import { useToast } from "../../../context/ToastContext";
import { getAdminSettings, updateSettings } from "../../../services/settingsService";
import { apiErrorText, apiSuccessText } from "../../../utils/apiError";
import { useAsyncData } from "../../../utils/useAsyncData";
import { useDocumentTitle } from "../../../utils/useDocumentTitle";
import BrandImages from "./BrandImages";
import HomeLists from "./HomeLists";
import PropertyPreview from "./PropertyPreview";

// Everything one save sends, with the API's limits (settingsController).
const FIELDS = ["name", "heroTitle", "heroSubtitle", "phone", "email", "address", "checkInTime", "checkOutTime", "freeCancellationDays", "amenities", "nearbyPlaces"];
const LIMITS = { name: 100, heroTitle: 120, heroSubtitle: 300, phone: 30, email: 255, address: 255 };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s().]{6,30}$/;
const TABS = [
  { key: "info", fields: ["name", "heroTitle", "heroSubtitle", "phone", "email", "address"] },
  { key: "policy", fields: ["checkInTime", "checkOutTime", "freeCancellationDays"] },
  { key: "home", fields: ["amenities", "nearbyPlaces"] },
];

// A stored null means "not set here": the box is empty and what applies
// instead (settings.fallback) is shown under it.
const toForm = (stored) =>
  Object.fromEntries(FIELDS.map((key) => [key, key === "amenities" || key === "nearbyPlaces" ? stored?.[key] ?? [] : stored?.[key] ?? ""]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function validate(form, t) {
  const errors = {};
  const email = form.email.trim();
  const phone = form.phone.trim();
  if (email && !EMAIL_PATTERN.test(email)) errors.email = t("errors.email");
  if (phone && !PHONE_PATTERN.test(phone)) errors.phone = t("errors.phone");
  for (const list of ["amenities", "nearbyPlaces"]) {
    // A blank row is dropped on save; a row with text needs its name.
    const filled = form[list].filter((row) => Object.values(row).some((value) => String(value || "").trim()));
    if (filled.some((row) => !String(row.name || "").trim())) errors[list] = t("errors.rowName");
  }
  return errors;
}

// Admin: the property as guests see it, in three tabs (identity and brand,
// house rules, home page lists) saved together with the bar at the bottom,
// and a preview of the home page that follows the form as it is typed.
// Logo and home photo are saved as soon as they are uploaded.
export default function PropertyPage() {
  const { t } = useTranslation("property");
  const toast = useToast();
  const property = useProperty();
  const { data, error, reload, setData } = useAsyncData("admin-settings", getAdminSettings);
  const [tab, setTab] = useState("info");
  const [form, setForm] = useState(null);
  const [initial, setInitial] = useState(null);
  const [seen, setSeen] = useState(null);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  useDocumentTitle(t("title"));

  // The form starts from what is stored, and again after every save.
  if (data && data !== seen) {
    setSeen(data);
    const start = toForm(data.stored);
    setForm(start);
    setInitial(start);
  }

  const changes = form ? FIELDS.filter((key) => !same(form[key], initial[key])).length : 0;
  useLeaveWarning(changes > 0 || saving);
  const errors = form ? validate(form, t) : {};
  const shown = tried ? errors : {};
  const errorCount = tried ? Object.keys(errors).length : 0;
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const setText = (key) => (event) => set(key)(event.target.value);

  // The header, tab title and footer read the public settings: refresh
  // them so the admin area follows too.
  const applied = (result) => {
    setData(result);
    property.reload();
  };

  const submit = async (event) => {
    event.preventDefault();
    setTried(true);
    setFailure("");
    const wrong = Object.keys(errors);
    if (wrong.length) {
      const owner = TABS.find((item) => item.fields.includes(wrong[0]));
      if (owner) setTab(owner.key);
      setTimeout(() => document.getElementById(`property-${wrong[0]}`)?.focus(), 0);
      return;
    }
    setSaving(true);
    try {
      const values = Object.fromEntries(FIELDS.filter((key) => !same(form[key], initial[key])).map((key) => [key, form[key]]));
      if ("freeCancellationDays" in values) values.freeCancellationDays = values.freeCancellationDays === "" ? null : Number(values.freeCancellationDays);
      const result = await updateSettings(values);
      setTried(false);
      applied(result);
      toast.success(apiSuccessText(result, "property:saved"));
    } catch (err) {
      setFailure(apiErrorText(err, "property:form.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const head = (
    <div className="ax-head">
      <div>
        <Crumbs current={t("title")} />
        <h1>{t("title")}</h1>
        <p>{t("subtitle")}</p>
      </div>
      <div className="ax-actions">
        <a className="g-btn g-btn--outline" href="/" target="_blank" rel="noreferrer">
          <AxIcon name="external" small />
          {t("openSite")}
        </a>
      </div>
    </div>
  );

  if (!form) {
    return (
      <div className="ax-screen" data-testid="property-page">
        {head}
        {error ? (
          <EmptyState error icon="alert" title={t("states.errorTitle")} actions={<button type="button" className="g-btn g-btn--primary" onClick={reload}>{t("admin:retry")}</button>} testId="property-error">
            {apiErrorText(error, "admin:loadFailed")}
          </EmptyState>
        ) : (
          <div className="ax-propgrid" aria-busy="true" data-testid="property-loading">
            <div className="ax-card ax-card--pad ax-skelstack">
              <Skel variant="title" width="30%" />
              <Skel height={48} />
              <Skel height={48} />
              <Skel height={120} />
            </div>
            <Skel height={420} />
          </div>
        )}
      </div>
    );
  }

  const fallback = (key) => {
    const value = data.fallback[key];
    return value === "" || value == null ? t("form.noDefault") : String(value);
  };
  const defaultHint = (key, text = fallback(key)) => t("form.default", { value: text });
  const counted = (key, extra) => (
    <p className="fx-help">
      {[t("form.count", { count: form[key].length, max: LIMITS[key] }), extra].filter(Boolean).join(" · ")}
    </p>
  );
  const textField = (key, { type = "text", help, autoComplete = "off" } = {}) => (
    <Field id={`property-${key}`} label={t(`fields.${key}`)} error={shown[key]} help={help ?? <p className="fx-help">{defaultHint(key)}</p>}>
      <Control invalid={shown[key]}>
        <input {...inputProps(`property-${key}`, shown[key])} name={key} type={type} value={form[key]} maxLength={LIMITS[key]} autoComplete={autoComplete} onChange={setText(key)} />
      </Control>
    </Field>
  );

  // What is still missing for a complete guest site (logo, photo, contact).
  const effective = { ...data.effective, ...Object.fromEntries(["phone", "email", "address"].map((key) => [key, form[key].trim() || data.fallback[key] || ""])) };
  const missing = [
    !data.stored.logoUrl && "logo",
    !data.stored.heroImageUrl && "hero",
    !effective.phone && "phone",
    !effective.email && "email",
    !effective.address && "address",
  ].filter(Boolean);
  const tabErrors = (item) => item.fields.filter((key) => shown[key]).length;
  const usesDefaultDays = form.freeCancellationDays === "";

  return (
    <form className="ax-screen ax-editor" onSubmit={submit} noValidate aria-label={t("title")} data-testid="property-page">
      {head}
      <div className="ax-tabs" role="tablist" aria-label={t("tabs.label")}>
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`property-tab-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls="property-panel"
            className="ax-tab"
            onClick={() => setTab(item.key)}
            data-testid={`property-tab-${item.key}`}
          >
            {t(`tabs.${item.key}`)}
            {tabErrors(item) > 0 && <span className="ax-tab__n ax-tab__n--danger" aria-label={t("tabs.errors", { count: tabErrors(item) })}>{tabErrors(item)}</span>}
          </button>
        ))}
      </div>

      {missing.length > 0 && (
        <Alert tone="warning" title={t("missing.title")}>
          {t("missing.text", { items: missing.map((key) => t(`missing.items.${key}`)).join(", ") })}
        </Alert>
      )}

      <div className="ax-propgrid">
        <div className="ax-card ax-fcard ax-fcard--stack" role="tabpanel" id="property-panel" aria-labelledby={`property-tab-${tab}`} data-testid="home-content-form">
          {tab === "info" && (
            <>
              <FormSection id="property-general" title={t("sections.general")} description={t("sections.generalHint")}>
                {textField("name")}
                {textField("heroTitle", { help: counted("heroTitle", defaultHint("heroTitle", t("site:home.heroTitle"))) })}
                <Field id="property-heroSubtitle" label={t("fields.heroSubtitle")} help={counted("heroSubtitle")}>
                  <div className="fx-control">
                    <textarea id="property-heroSubtitle" name="heroSubtitle" rows={3} maxLength={LIMITS.heroSubtitle} value={form.heroSubtitle} placeholder={t("site:home.heroSubtitle")} onChange={setText("heroSubtitle")} />
                  </div>
                </Field>
              </FormSection>
              <FormSection id="property-brand" title={t("sections.brand")} description={t("sections.brandHint")}>
                <BrandImages settings={data} initial={property.initial} onSaved={applied} />
              </FormSection>
              <FormSection id="property-contact" title={t("sections.contact")} description={t("sections.contactHint")}>
                <div className="ax-g2">
                  {textField("phone", { type: "tel" })}
                  {textField("email", { type: "email" })}
                </div>
                {textField("address")}
              </FormSection>
            </>
          )}

          {tab === "policy" && (
            <>
              <FormSection id="property-times" title={t("sections.times")} description={t("sections.timesHint")}>
                <div className="ax-g2">
                  {["checkInTime", "checkOutTime"].map((key) => (
                    <Field key={key} id={`property-${key}`} label={t(`fields.${key}`)} help={<p className="fx-help">{defaultHint(key)}</p>}>
                      <Control>
                        <input id={`property-${key}`} name={key} type="time" value={form[key]} onChange={setText(key)} />
                      </Control>
                    </Field>
                  ))}
                </div>
              </FormSection>
              <FormSection id="property-cancel" title={t("sections.cancel")} description={t("sections.cancelHint")}>
                <label className="ax-switch ax-switch--field">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={usesDefaultDays}
                    onChange={(event) => set("freeCancellationDays")(event.target.checked ? "" : Number(data.effective.freeCancellationDays) || 0)}
                    data-testid="property-days-default"
                  />
                  {t("cancel.useDefault", { count: Number(data.fallback.freeCancellationDays) || 0 })}
                </label>
                {!usesDefaultDays && (
                  <Stepper
                    id="property-freeCancellationDays"
                    label={t("fields.freeCancellationDays")}
                    value={form.freeCancellationDays}
                    min={0}
                    max={365}
                    onChange={set("freeCancellationDays")}
                    help={<p className="fx-help">{t("cancel.after")}</p>}
                  />
                )}
              </FormSection>
            </>
          )}

          {tab === "home" && (
            <FormSection id="property-lists" title={t("sections.lists")} description={t("sections.listsHint")}>
              <HomeLists form={form} errors={shown} onChange={(key, rows) => set(key)(rows)} />
            </FormSection>
          )}
          {failure && <div className="ax-fcard__alert"><Alert>{failure}</Alert></div>}
        </div>

        <PropertyPreview form={form} settings={data} />
      </div>

      <SaveBar
        changes={changes}
        errors={errorCount}
        saving={saving}
        onCancel={() => {
          setForm(initial);
          setTried(false);
          setFailure("");
        }}
        cancelLabel={t("form.discard")}
        saveLabel={t("form.save")}
        testId="property-savebar"
      />
    </form>
  );
}
