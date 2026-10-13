import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog, { CloseIcon } from "../../../components/Dialog";
import AxIcon from "../../../components/admin/AxIcon";
import { Alert } from "../../../components/admin/ax";
import { Control, Field, inputProps } from "../../../components/auth/fields";
import { deleteDestinationImage, updateDestinationCredit, uploadDestinationImage } from "../../../services/destinationService";
import { apiErrorText, apiSuccessText } from "../../../utils/apiError";
import { IMAGE_TYPES, imageFileProblem } from "../../../utils/imageFile";
import { normalizeImageUrl, placeholderFor } from "../../../utils/imageUrl";

// The credit fields and the API's limits (destinationController).
const CREDIT = { author: 255, sourceUrl: 500, license: 100, licenseUrl: 500, title: 255, place: 255, changes: 500 };
const URL_PATTERN = /^https?:\/\/\S+$/i;

// Licences the sample photos use, with where each one is written down;
// picking one fills its link when that is still empty.
export const LICENSES = {
  "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0",
  "CC BY-SA 2.0": "https://creativecommons.org/licenses/by-sa/2.0",
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0",
  CC0: "https://creativecommons.org/publicdomain/zero/1.0/",
};

const creditOf = (destination) => Object.fromEntries(Object.keys(CREDIT).map((key) => [key, destination[key] || ""]));
const sizeText = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// One destination's photo and the credit its licence asks for, in a panel
// from the right. A new photo is uploaded on save, together with its credit
// (the old photo's credit goes with it); removing the photo also waits for
// save. The credit shows on /credits once a licence is filled in.
export default function DestinationDrawer({ destination, onClose, onSaved }) {
  const { t } = useTranslation("property");
  const inputId = useId();
  const [initial] = useState(() => creditOf(destination));
  const [form, setForm] = useState(initial);
  const [file, setFile] = useState(null); // { file, url } picked, not uploaded yet
  const [removing, setRemoving] = useState(false);
  const [over, setOver] = useState(false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [failure, setFailure] = useState("");
  const [fileError, setFileError] = useState("");

  // The picked file is shown from memory until it is uploaded.
  useEffect(() => () => file && URL.revokeObjectURL(file.url), [file]);

  const hasPhoto = Boolean(file || (destination.image && !removing));
  const set = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "license" && LICENSES[value.trim()] && !current.licenseUrl.trim()) next.licenseUrl = LICENSES[value.trim()];
      return next;
    });
  };

  const errors = {};
  if (hasPhoto) {
    if (form.license.trim() && !form.author.trim()) errors.author = t("destinations.errors.author");
    for (const key of ["sourceUrl", "licenseUrl"]) {
      if (form[key].trim() && !URL_PATTERN.test(form[key].trim())) errors[key] = t("destinations.errors.url");
    }
  }
  const shown = tried ? errors : {};
  const creditChanged = Object.keys(CREDIT).some((key) => form[key].trim() !== initial[key]);
  const dirty = Boolean(file) || removing || (hasPhoto && creditChanged);

  const take = (picked) => {
    if (!picked) return;
    const problem = imageFileProblem(picked);
    if (problem) {
      setFileError(t(problem));
      return;
    }
    setFileError("");
    setFile({ file: picked, url: URL.createObjectURL(picked) });
    setRemoving(false);
  };

  const submit = async (event) => {
    event.preventDefault();
    setTried(true);
    setFailure("");
    if (Object.keys(errors).length) {
      document.getElementById(`dest-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    if (!dirty) return;
    setSaving(true);
    const credit = Object.fromEntries(Object.keys(CREDIT).map((key) => [key, form[key].trim()]));
    try {
      let result;
      if (file) {
        setProgress(0);
        result = await uploadDestinationImage(destination.name, file.file, credit, setProgress);
      } else if (removing) {
        result = await deleteDestinationImage(destination.name);
      } else {
        result = await updateDestinationCredit(destination.name, credit);
      }
      onSaved(apiSuccessText(result, "property:saved"));
    } catch (err) {
      setFailure(apiErrorText(err, file ? "property:image.uploadFailed" : removing ? "property:image.removeFailed" : "property:destinations.creditFailed"));
      setSaving(false);
      setProgress(null);
    }
  };

  const close = () => !saving && onClose();
  const field = (key, { type = "text", placeholder, list } = {}) => (
    <Field id={`dest-${key}`} label={t(`destinations.fields.${key}`)} error={shown[key]}>
      <Control invalid={shown[key]} disabled={!hasPhoto}>
        <input
          {...inputProps(`dest-${key}`, shown[key])}
          type={type}
          value={form[key]}
          maxLength={CREDIT[key]}
          placeholder={placeholder}
          list={list}
          disabled={!hasPhoto || saving}
          autoComplete="off"
          onChange={set(key)}
        />
      </Control>
    </Field>
  );

  const shownImage = file ? file.url : removing ? null : destination.image ? normalizeImageUrl(destination.image, placeholderFor(destination.name, "place")) : null;

  return (
    <Dialog className="ax-drawer" onClose={close} aria-labelledby="dest-title" data-testid="destination-drawer">
      <form className="ax-drawer__form" onSubmit={submit} noValidate>
        <div className="ax-drawer__head">
          <div>
            <div className="ax-eyebrow">{t("destinations.eyebrow")}</div>
            <h2 id="dest-title">{destination.name}</h2>
          </div>
          <button type="button" className="ax-iconbtn" aria-label={t("common:dialog.close")} onClick={close}>
            <CloseIcon />
          </button>
        </div>

        <div className="ax-drawer__body ax-drawer__body--form">
          {shownImage ? (
            <figure className="ax-dimg">
              <img src={shownImage} alt={file ? t("destinations.newPhotoAlt", { name: destination.name }) : t("destinations.currentAlt", { name: destination.name })} />
              <button
                type="button"
                className="ax-ptile__btn is-danger ax-dimg__x"
                aria-label={file ? t("destinations.dropNew") : t("destinations.removePhoto")}
                disabled={saving}
                onClick={() => (file ? setFile(null) : setRemoving(true))}
                data-testid="destination-remove"
              >
                <AxIcon name={file ? "close" : "trash"} small />
              </button>
              {file && (
                <figcaption>
                  <b>{t("destinations.newPhoto")}</b> {file.file.name} · {sizeText(file.file.size)}
                </figcaption>
              )}
            </figure>
          ) : (
            <div className="ax-dimg is-empty">
              <span>{removing ? t("destinations.willRemove") : t("destinations.noPhoto")}</span>
              {removing && (
                <button type="button" className="g-btn g-btn--small ax-btn-ghost" onClick={() => setRemoving(false)}>
                  {t("destinations.undo")}
                </button>
              )}
            </div>
          )}

          <div
            className={`ax-drop ax-drop--slim${over ? " is-over" : ""}`}
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
              if (!saving) take(event.dataTransfer.files?.[0]);
            }}
            data-testid="destination-dropzone"
          >
            <AxIcon name="upload" className="ax-drop__icon" />
            <p className="ax-drop__t">{over ? t("destinations.dropNow") : t("destinations.drop")}</p>
            <p className="ax-drop__d">
              {t("destinations.or")}{" "}
              <label htmlFor={inputId} className="ax-drop__pick">{t("destinations.pick")}</label>
              {" · "}
              {t("admin:image.types")}
            </p>
            <input
              id={inputId}
              className="sr-only"
              type="file"
              accept={IMAGE_TYPES.join(",")}
              disabled={saving}
              onChange={(event) => {
                take(event.target.files?.[0]);
                event.target.value = "";
              }}
              data-testid="destination-image-input"
            />
          </div>
          {fileError && <Alert>{fileError}</Alert>}
          {progress != null && (
            <div className="ax-ptile__bar" role="progressbar" aria-label={t("destinations.uploading")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}

          <Alert tone="warning">{file ? t("destinations.creditNew") : t("destinations.creditHint")}</Alert>

          {field("author", { placeholder: t("destinations.placeholders.author") })}
          {field("sourceUrl", { type: "url", placeholder: "https://" })}
          <div className="ax-g2">
            {field("license", { list: "dest-licenses", placeholder: t("destinations.placeholders.license") })}
            {field("licenseUrl", { type: "url", placeholder: "https://" })}
          </div>
          <datalist id="dest-licenses">
            {Object.keys(LICENSES).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <details className="ax-more">
            <summary>{t("destinations.more")}</summary>
            <div className="ax-more__b">
              {field("title")}
              {field("place")}
              {field("changes", { placeholder: t("destinations.placeholders.changes") })}
            </div>
          </details>
          {failure && <Alert>{failure}</Alert>}
        </div>

        <div className="ax-drawer__foot">
          <button type="button" className="g-btn g-btn--outline" onClick={close} disabled={saving}>
            {t("destinations.cancel")}
          </button>
          <button type="submit" className="g-btn g-btn--primary is-grow" disabled={saving || !dirty} data-testid="destination-save">
            {saving ? t("admin:saving") : t("destinations.save")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
