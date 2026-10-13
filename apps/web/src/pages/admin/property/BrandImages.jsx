import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import AxIcon from "../../../components/admin/AxIcon";
import { FieldError } from "../../../components/auth/fields";
import { useToast } from "../../../context/ToastContext";
import { deleteHeroImage, deleteLogo, uploadHeroImage, uploadLogo } from "../../../services/settingsService";
import { apiErrorText, apiSuccessText } from "../../../utils/apiError";
import { IMAGE_TYPES, imageFileProblem } from "../../../utils/imageFile";
import { normalizeImageUrl } from "../../../utils/imageUrl";

// One image of the property (the logo, the home page photo): what is there,
// a button to upload or replace it (or drop a file on it) and one to remove
// it. These save at once: the server rotates, strips location data from and
// re-encodes the file.
function ImageSlot({ kind, value, empty, upload, remove, onSaved, label }) {
  const { t } = useTranslation("property");
  const toast = useToast();
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");

  const run = async (work, fallbackKey) => {
    setBusy(true);
    setError("");
    try {
      const result = await work();
      onSaved(result);
      toast.success(apiSuccessText(result, "property:saved"));
    } catch (err) {
      setError(apiErrorText(err, fallbackKey));
    } finally {
      setBusy(false);
    }
  };
  const take = (file) => {
    if (!file) return;
    const problem = imageFileProblem(file);
    if (problem) return setError(t(problem));
    return run(() => upload(file), "property:image.uploadFailed");
  };

  return (
    <div className="g-field">
      <span className="g-label" id={`${inputId}-l`}>{label}</span>
      <div
        className={`ax-brandimg ax-brandimg--${kind}${over ? " is-over" : ""}`}
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer?.types || []).includes("Files")) {
            event.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (!busy) take(event.dataTransfer.files?.[0]);
        }}
        data-testid={`${kind}-slot`}
      >
        <span className="ax-brandimg__box">
          {value ? <img src={normalizeImageUrl(value, "")} alt="" data-testid={`${kind}-preview`} /> : empty}
        </span>
        <div className="ax-brandimg__side">
          <div className="ax-brandimg__acts">
            <label htmlFor={inputId} className={`g-btn g-btn--outline g-btn--small${busy ? " is-busy" : ""}`}>
              <AxIcon name="upload" small />
              {busy ? t("admin:processing") : value ? t("image.replace") : t("image.upload")}
            </label>
            <input
              id={inputId}
              className="sr-only"
              type="file"
              accept={IMAGE_TYPES.join(",")}
              disabled={busy}
              aria-labelledby={`${inputId}-l`}
              onChange={(event) => {
                take(event.target.files?.[0]);
                event.target.value = "";
              }}
              data-testid={`${kind}-input`}
            />
            {value && (
              <button type="button" className="g-btn g-btn--small ax-btn-ghost" disabled={busy} onClick={() => run(remove, "property:image.removeFailed")}>
                {t("image.remove")}
              </button>
            )}
          </div>
          <p className="fx-help">{t(`${kind}.hint`)}</p>
          <FieldError id={`${inputId}-e`}>{error}</FieldError>
        </div>
      </div>
    </div>
  );
}

export default function BrandImages({ settings, initial, onSaved }) {
  const { t } = useTranslation("property");
  return (
    <>
      <ImageSlot
        kind="logo"
        label={t("logo.title")}
        value={settings.stored.logoUrl}
        empty={<span className="ax-brandimg__mark">{initial}</span>}
        upload={uploadLogo}
        remove={deleteLogo}
        onSaved={onSaved}
      />
      <ImageSlot
        kind="hero"
        label={t("hero.title")}
        value={settings.stored.heroImageUrl}
        empty={<span className="ax-brandimg__none">{t("hero.none")}</span>}
        upload={uploadHeroImage}
        remove={deleteHeroImage}
        onSaved={onSaved}
      />
      <p className="fx-help">{t("image.savedAtOnce")}</p>
    </>
  );
}
