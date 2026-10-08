import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field } from "../../../components/admin/ui";
import Icon from "../../../utils/icon";
import { updateSettings } from "../../../services/settingsService";
import { apiErrorText } from "../../../utils/apiError";

// The two lists and the texts of each row, in the order they are typed.
// Limits match the API's (settingsController.js).
const LISTS = [
  {
    key: "amenities",
    maxRows: 12,
    columns: [
      { key: "name", label: "amenityName", maxLength: 80 },
      { key: "description", label: "amenityDescription", maxLength: 160 },
    ],
  },
  {
    key: "nearbyPlaces",
    maxRows: 8,
    columns: [
      { key: "name", label: "placeName", maxLength: 80 },
      { key: "note", label: "placeNote", maxLength: 120 },
      { key: "distance", label: "placeDistance", maxLength: 30 },
    ],
  },
];

const toForm = (stored) => ({
  heroTitle: stored?.heroTitle ?? "",
  heroSubtitle: stored?.heroSubtitle ?? "",
  amenities: stored?.amenities ?? [],
  nearbyPlaces: stored?.nearbyPlaces ?? [],
});

// Rows of short texts with add/remove. The column names sit above the first
// row; every input also carries its own label for screen readers.
function ListEditor({ list, rows, onChange }) {
  const { t } = useTranslation("property");
  const setCell = (index, key, value) => onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const emptyRow = Object.fromEntries(list.columns.map((column) => [column.key, ""]));

  return (
    <Field label={t(`home.${list.key}`)} hint={t(`home.${list.key}Hint`)} wide>
      <div className="adm-modal-body" data-testid={`home-${list.key}`}>
        {rows.map((row, index) => (
          <div key={index} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {list.columns.map((column) => (
              <input
                key={column.key}
                className="adm-input"
                style={{ flex: column.key === "distance" ? "1 1 110px" : "2 1 180px", width: "auto" }}
                aria-label={t("home.rowField", { label: t(`home.${column.label}`), index: index + 1 })}
                placeholder={t(`home.${column.label}`)}
                maxLength={column.maxLength}
                value={row[column.key] ?? ""}
                onChange={(event) => setCell(index, column.key, event.target.value)}
              />
            ))}
            <button
              type="button"
              className="adm-icon-btn is-danger"
              aria-label={t("home.removeRow", { index: index + 1 })}
              title={t("home.removeRow", { index: index + 1 })}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <Icon.Trash />
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="adm-btn adm-btn--ghost adm-btn--small"
            disabled={rows.length >= list.maxRows}
            onClick={() => onChange([...rows, emptyRow])}
          >
            {t("home.addRow")}
          </button>
        </div>
      </div>
    </Field>
  );
}

// What the home page says about the property: its headline and the
// Amenities and Location sections. Empty texts fall back to the site's
// neutral wording (shown as the hint); an empty list hides its section.
export default function HomeContentForm({ settings, onSaved, onError }) {
  const { t } = useTranslation("property");
  const [form, setForm] = useState(() => toForm(settings.stored));
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await updateSettings(form);
      setForm(toForm(saved.stored));
      onSaved(saved);
    } catch (err) {
      onError(apiErrorText(err, "property:form.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="adm-panel adm-panel--padded" aria-label={t("home.title")} data-testid="home-content-form">
      <h2>{t("home.title")}</h2>
      <p className="adm-hint" style={{ margin: "-6px 0 18px" }}>{t("home.subtitle")}</p>
      <div className="adm-form-grid">
        <Field label={t("home.heroTitle")} htmlFor="property-heroTitle" hint={t("form.default", { value: t("site:home.heroTitle") })} wide>
          <input
            id="property-heroTitle"
            name="heroTitle"
            className="adm-input"
            maxLength={120}
            value={form.heroTitle}
            onChange={(event) => set("heroTitle", event.target.value)}
          />
        </Field>
        <Field label={t("home.heroSubtitle")} htmlFor="property-heroSubtitle" hint={t("form.default", { value: t("site:home.heroSubtitle") })} wide>
          <textarea
            id="property-heroSubtitle"
            name="heroSubtitle"
            className="adm-textarea"
            maxLength={300}
            value={form.heroSubtitle}
            onChange={(event) => set("heroSubtitle", event.target.value)}
          />
        </Field>
        {LISTS.map((list) => (
          <ListEditor key={list.key} list={list} rows={form[list.key]} onChange={(rows) => set(list.key, rows)} />
        ))}
      </div>
      <div className="adm-actions" style={{ marginTop: 20 }}>
        <button type="submit" className="adm-btn adm-btn--primary" disabled={saving}>
          {saving ? t("admin:saving") : t("home.save")}
        </button>
      </div>
    </form>
  );
}
