import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Field } from "../../components/admin/ui";
import { useAuth } from "../../context/AuthContext";
import { updateCurrentUserProfile, uploadAvatar } from "../../services/userService";
import { apiErrorText, apiSuccessText } from "../../utils/apiError";
import { IMAGE_TYPES, imageFileProblem } from "../../utils/imageFile";
import { normalizeImageUrl } from "../../utils/imageUrl";

export function toProfile(user) {
  return { name: user?.name || "", email: user?.email || "", phone: user?.phone || "", bio: user?.bio || "", avatar_url: user?.avatar_url || "" };
}

// Name, email, phone, bio and photo of the signed-in account.
export default function ProfileForm({ initial }) {
  const { t } = useTranslation("account");
  const { updateCurrentUser } = useAuth();
  const [saved, setSaved] = useState(initial);
  const [profile, setProfile] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ error: "", success: "" });
  const set = (key) => (event) => {
    setProfile((current) => ({ ...current, [key]: event.target.value }));
    setMessage({ error: "", success: "" });
  };
  const initials = (profile.name || profile.email || "?").split(" ").filter(Boolean).map((w) => w[0]).join("").slice(-2).toUpperCase();

  const changePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const problem = imageFileProblem(file);
    if (!file || problem) return problem && setMessage({ error: t(problem), success: "" });
    setUploading(true);
    try {
      const result = await uploadAvatar(file);
      setProfile((current) => ({ ...current, avatar_url: result.avatarUrl || "" }));
      setMessage({ error: "", success: t("profile.photoReady") });
    } catch (err) {
      setMessage({ error: apiErrorText(err, "account:profile.photoFailed"), success: "" });
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!profile.name.trim() || !profile.email.trim()) return setMessage({ error: t("profile.nameEmailRequired"), success: "" });
    setSaving(true);
    try {
      const result = await updateCurrentUserProfile(profile);
      const next = toProfile(result.user);
      setProfile(next);
      setSaved(next);
      updateCurrentUser(result.user);
      setMessage({ error: "", success: apiSuccessText(result, "account:profile.saved") });
    } catch (err) {
      setMessage({ error: apiErrorText(err, "account:profile.saveFailed"), success: "" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="adm-panel adm-panel--padded" data-testid="profile-form">
      <h2>{t("profile.title")}</h2>
      <p className="adm-hint" style={{ margin: "-6px 0 18px" }}>{t("profile.subtitle")}</p>

      <Alert>{message.error}</Alert>
      {message.success && <p className="adm-note" role="status" style={{ margin: "0 0 16px", color: "var(--color-success)" }}>{message.success}</p>}

      <div className="adm-two-col">
        <div style={{ textAlign: "center" }}>
          <div className="adm-avatar" style={{ width: 96, height: 96, borderRadius: 24, fontSize: 32, margin: "0 auto 12px" }}>
            {profile.avatar_url ? <img src={normalizeImageUrl(profile.avatar_url, "")} alt={t("profile.photo")} /> : initials}
          </div>
          <label className="adm-btn adm-btn--muted adm-btn--small" style={{ opacity: uploading || saving ? 0.6 : 1 }}>
            {uploading ? t("profile.uploading") : t("profile.changePhoto")}
            <input type="file" accept={IMAGE_TYPES.join(",")} onChange={changePhoto} disabled={uploading || saving} data-testid="avatar-input" />
          </label>
          <p className="adm-hint">{t("admin:image.types")}</p>
        </div>

        <div className="adm-form-grid">
          <Field label={t("profile.name")} htmlFor="profile-name">
            <input id="profile-name" className="adm-input" value={profile.name} onChange={set("name")} disabled={saving} maxLength={100} autoComplete="name" />
          </Field>
          <Field label={t("profile.email")} htmlFor="profile-email">
            <input id="profile-email" type="email" className="adm-input" value={profile.email} onChange={set("email")} disabled={saving} maxLength={255} autoComplete="email" />
          </Field>
          <Field label={t("profile.phone")} htmlFor="profile-phone">
            <input id="profile-phone" type="tel" className="adm-input" value={profile.phone} onChange={set("phone")} disabled={saving} maxLength={30} autoComplete="tel" />
          </Field>
          <Field label={t("profile.bio")} htmlFor="profile-bio" wide>
            <textarea id="profile-bio" className="adm-textarea" value={profile.bio} onChange={set("bio")} disabled={saving} maxLength={2000} />
          </Field>
          <div className="adm-actions is-wide" style={{ justifyContent: "flex-end", gridColumn: "1 / -1" }}>
            <button type="button" className="adm-btn adm-btn--muted" onClick={() => setProfile(saved)} disabled={saving}>{t("profile.reset")}</button>
            <button type="submit" className="adm-btn adm-btn--primary" disabled={saving || uploading}>{saving ? t("admin:saving") : t("profile.save")}</button>
          </div>
        </div>
      </div>
    </form>
  );
}
