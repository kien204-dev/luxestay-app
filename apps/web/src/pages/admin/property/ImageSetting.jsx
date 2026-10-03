import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiErrorText } from "../../../utils/apiError";
import { IMAGE_TYPES, imageFileProblem } from "../../../utils/imageFile";
import { normalizeImageUrl } from "../../../utils/imageUrl";

// One image kept in the property settings (the logo, the home page photo):
// preview, upload/replace, remove. upload(file) and remove() return the saved
// settings.
export default function ImageSetting({ title, hint, value, empty, upload, remove, onSaved, onError, previewStyle, testId }) {
  const { t } = useTranslation("property");
  const [busy, setBusy] = useState(false);

  const run = async (work, fallbackKey) => {
    setBusy(true);
    try {
      onSaved(await work());
    } catch (err) {
      onError(apiErrorText(err, fallbackKey));
    } finally {
      setBusy(false);
    }
  };

  const pick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const problem = imageFileProblem(file);
    if (!file) return;
    if (problem) return onError(t(problem));
    run(() => upload(file), "property:image.uploadFailed");
  };

  return (
    <section className="adm-panel adm-panel--padded" aria-label={title}>
      <h2>{title}</h2>
      <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div
          style={{ borderRadius: 14, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--color-navy-900)", color: "var(--color-text-muted)", fontSize: 14, ...previewStyle }}
        >
          {value ? <img src={normalizeImageUrl(value, "")} alt="" data-testid={`${testId}-preview`} style={{ width: "100%", height: "100%", objectFit: previewStyle?.objectFit || "cover" }} /> : empty}
        </div>
        <div style={{ flex: "1 1 240px" }}>
          <div className="adm-actions">
            <label className="adm-btn adm-btn--primary" style={{ opacity: busy ? 0.6 : 1 }}>
              {busy ? t("admin:processing") : value ? t("image.replace") : t("image.upload")}
              <input type="file" accept={IMAGE_TYPES.join(",")} onChange={pick} disabled={busy} data-testid={`${testId}-input`} />
            </label>
            {value && (
              <button type="button" className="adm-btn adm-btn--ghost" onClick={() => run(remove, "property:image.removeFailed")} disabled={busy}>
                {t("image.remove")}
              </button>
            )}
          </div>
          <p className="adm-hint">{hint}</p>
        </div>
      </div>
    </section>
  );
}
