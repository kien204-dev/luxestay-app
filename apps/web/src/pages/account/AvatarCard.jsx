import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FieldError } from "../../components/auth/fields";
import { useToast } from "../../context/ToastContext";
import { updateCurrentUserProfile, uploadAvatar } from "../../services/userService";
import { apiErrorText } from "../../utils/apiError";
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from "../../utils/imageFile";
import { normalizeImageUrl } from "../../utils/imageUrl";

const MAX_MB = MAX_IMAGE_BYTES / 1024 / 1024;

export function initialsOf(name, email) {
  return (name || email || "?").split(" ").filter(Boolean).map((word) => word[0]).join("").slice(-2).toUpperCase();
}

function formatSize(bytes, lang) {
  const mb = bytes / 1024 / 1024;
  return `${mb.toLocaleString(lang === "en" ? "en-US" : "vi-VN", { maximumFractionDigits: 1 })} MB`;
}

// The profile photo: chosen, uploaded with a progress ring (cancellable),
// then saved on the account straight away, or removed. The size and type
// limits are the API's image pipeline's (utils/imageFile.js mirrors them).
// `saved` is the profile as stored; the photo is saved together with it so
// unsaved edits in the details form below are not sent along.
export default function AvatarCard({ saved, onSaved }) {
  const { t, i18n } = useTranslation("account");
  const toast = useToast();
  const input = useRef(null);
  const upload = useRef(null);
  // { name, size, progress } while a file is going up or being processed.
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  const save = async (avatarUrl, doneKey) => {
    const result = await updateCurrentUserProfile({ ...saved, avatar_url: avatarUrl });
    onSaved(result.user);
    toast.success(t(doneKey));
  };

  const choose = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) return setError(t("avatar.badType"));
    if (file.size > MAX_IMAGE_BYTES) return setError(t("avatar.tooLarge", { size: formatSize(file.size, i18n.language), mb: MAX_MB }));

    setError("");
    const controller = new AbortController();
    upload.current = controller;
    setBusy({ name: file.name, size: file.size, progress: 0 });
    try {
      const result = await uploadAvatar(file, {
        signal: controller.signal,
        onProgress: (progress) => setBusy((current) => current && { ...current, progress }),
      });
      await save(result.avatarUrl || "", "avatar.saved");
    } catch (err) {
      if (err.code !== "ERR_CANCELED") setError(apiErrorText(err, "account:avatar.failed"));
    } finally {
      upload.current = null;
      setBusy(null);
    }
  };

  const remove = async () => {
    setError("");
    setBusy({ removing: true });
    try {
      await save("", "avatar.removed");
    } catch (err) {
      setError(apiErrorText(err, "account:avatar.failed"));
    } finally {
      setBusy(null);
    }
  };

  const photo = saved.avatar_url ? normalizeImageUrl(saved.avatar_url, "") : "";
  const percent = busy?.progress !== undefined ? Math.round(busy.progress * 100) : 0;

  return (
    <section className="ac-card" aria-labelledby="avatar-title" data-testid="avatar-card">
      <div className="ac-card__h">
        <h2 id="avatar-title">{t("avatar.title")}</h2>
        <p>{t("avatar.subtitle")}</p>
      </div>
      <div className="ac-card__b">
        <div className="av">
          <div className="av__img">
            {photo ? <img src={photo} alt={t("avatar.alt", { name: saved.name })} /> : <span aria-hidden="true">{initialsOf(saved.name, saved.email)}</span>}
            {busy?.name && <span className="av__ring" style={{ "--progress": `${percent}%` }} aria-hidden="true" />}
          </div>
          <div className="av__b">
            {busy?.name ? (
              <p role="status" className="av__status" data-testid="avatar-progress">
                <b>{percent < 100 ? t("avatar.uploading", { name: busy.name, percent, size: formatSize(busy.size, i18n.language) }) : t("avatar.processing", { name: busy.name })}</b>
              </p>
            ) : error ? (
              <div role="alert" data-testid="avatar-error"><FieldError id="avatar-error">{error}</FieldError></div>
            ) : (
              <p>{t("avatar.rules", { mb: MAX_MB })}</p>
            )}
            <div className="av__acts">
              <button type="button" className="g-btn g-btn--outline g-btn--small" onClick={() => input.current?.click()} disabled={Boolean(busy)}>
                <UploadIcon />
                {photo ? t("avatar.change") : t("avatar.upload")}
              </button>
              <input ref={input} type="file" accept={IMAGE_TYPES.join(",")} onChange={choose} hidden data-testid="avatar-input" aria-describedby={error ? "avatar-error" : undefined} />
              {busy?.name && (
                <button type="button" className="g-btn g-btn--ghost g-btn--small" onClick={() => upload.current?.abort()}>{t("avatar.cancel")}</button>
              )}
              {photo && !busy && (
                <button type="button" className="g-btn g-btn--ghost g-btn--small ac-danger" onClick={remove}>{t("avatar.remove")}</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="fx-icon fx-icon--small">
      <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />
    </svg>
  );
}
