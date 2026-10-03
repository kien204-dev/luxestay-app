import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Field } from "../../../components/admin/ui";
import { useToast } from "../../../context/ToastContext";
import { deleteDestinationImage, updateDestinationCredit, uploadDestinationImage } from "../../../services/destinationService";
import { apiErrorText, apiSuccessText } from "../../../utils/apiError";
import { IMAGE_TYPES, imageFileProblem } from "../../../utils/imageFile";
import { normalizeImageUrl, placeholderFor } from "../../../utils/imageUrl";

const CREDIT_FIELDS = [
  { key: "place", maxLength: 255 },
  { key: "author", maxLength: 255 },
  { key: "license", maxLength: 100 },
  { key: "licenseUrl", maxLength: 500, type: "url" },
  { key: "title", maxLength: 255 },
  { key: "sourceUrl", maxLength: 500, type: "url" },
];

const creditForm = (destination) => Object.fromEntries(CREDIT_FIELDS.map(({ key }) => [key, destination[key] || ""]));

// One destination: its photo (upload, replace, remove) and the credit the
// photo's licence asks for.
export default function DestinationRow({ destination, onChanged }) {
  const { t } = useTranslation("property");
  const toast = useToast();
  const [form, setForm] = useState(() => creditForm(destination));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = `dest-${encodeURIComponent(destination.name)}`;

  const run = async (work, fallbackKey) => {
    setBusy(true);
    setError("");
    try {
      toast.success(apiSuccessText(await work(), "property:saved"));
      onChanged();
    } catch (err) {
      setError(apiErrorText(err, fallbackKey));
    } finally {
      setBusy(false);
    }
  };

  const pick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const problem = imageFileProblem(file);
    if (!file) return;
    if (problem) return setError(t(problem));
    run(() => uploadDestinationImage(destination.name, file), "property:image.uploadFailed");
  };

  return (
    <section className="adm-panel adm-panel--padded" aria-label={destination.name} data-testid="destination-row">
      <div className="adm-two-col">
        <div>
          <img className="adm-thumb" style={{ width: "100%", height: "auto", aspectRatio: "4 / 3" }} src={normalizeImageUrl(destination.image, placeholderFor(destination.name, "place"))} alt={destination.name} />
          <div className="adm-actions" style={{ marginTop: 10 }}>
            <label className="adm-btn adm-btn--primary adm-btn--small" style={{ opacity: busy ? 0.6 : 1 }}>
              {destination.image ? t("image.replace") : t("image.upload")}
              <input type="file" accept={IMAGE_TYPES.join(",")} onChange={pick} disabled={busy} data-testid="destination-image-input" />
            </label>
            {destination.image && (
              <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" disabled={busy} onClick={() => run(() => deleteDestinationImage(destination.name), "property:image.removeFailed")}>
                {t("image.remove")}
              </button>
            )}
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(() => updateDestinationCredit(destination.name, form), "property:destinations.creditFailed");
          }}
        >
          <h2 style={{ marginBottom: 2 }}>{destination.name}</h2>
          <p className="adm-hint" style={{ margin: "0 0 14px" }}>
            {t("destinations.rooms", { count: destination.roomCount })}
            {destination.image ? "" : ` · ${t("destinations.noPhoto")}`}
          </p>
          {destination.image && (
            <>
              <div className="adm-form-grid">
                {CREDIT_FIELDS.map(({ key, ...input }) => (
                  <Field key={key} label={t(`destinations.fields.${key}`)} htmlFor={`${id}-${key}`}>
                    <input id={`${id}-${key}`} className="adm-input" value={form[key]} onChange={(e) => setForm((current) => ({ ...current, [key]: e.target.value }))} {...input} />
                  </Field>
                ))}
              </div>
              <p className="adm-hint">{t("destinations.creditHint")}</p>
              <button type="submit" className="adm-btn adm-btn--ghost" disabled={busy} style={{ marginTop: 10 }}>
                {t("destinations.saveCredit")}
              </button>
            </>
          )}
          <div style={{ marginTop: 10 }}><Alert>{error}</Alert></div>
        </form>
      </div>
    </section>
  );
}
