import { useState } from "react";
import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { Control, Field, FieldIcon, PasswordInput, inputProps } from "../../components/auth/fields";
import { useToast } from "../../context/ToastContext";
import { updateCurrentUserProfile } from "../../services/userService";
import { apiErrorText, apiSuccessText } from "../../utils/apiError";
import { EMAIL_PATTERN } from "../../utils/format";

// The API's phone check (apps/api/src/controller/userController.js).
const PHONE_PATTERN = /^[0-9+\-\s()]{8,20}$/;

export function toProfile(user) {
  return { name: user?.name || "", email: user?.email || "", phone: user?.phone || "", bio: user?.bio || "", avatar_url: user?.avatar_url || "" };
}

// Which box an API refusal belongs under.
const FIELD_OF_CODE = {
  INVALID_EMAIL: "email",
  EMAIL_EXISTS: "email",
  PASSWORD_NOT_SET: "email",
  INVALID_PHONE: "phone",
  CURRENT_PASSWORD_REQUIRED: "currentPassword",
  CURRENT_PASSWORD_WRONG: "currentPassword",
};

// The fields the account has: name, email, phone and the "about you" text.
// `saved` is what is stored; edits stay here until "Save changes". A new
// email needs the current password (the API checks it, ends the other
// sessions and tells the old address); an account made by Google sign-in
// (`passwordSet` false) is asked to set a password first.
export default function ProfileForm({ saved, passwordSet = true, onSaved }) {
  const { t } = useTranslation("account");
  const toast = useToast();
  const [draft, setDraft] = useState(saved);
  const [currentPassword, setCurrentPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => {
    setDraft((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: "", general: "" }));
  };
  const changed = ["name", "email", "phone", "bio"].some((key) => draft[key] !== saved[key]);
  const emailChanged = draft.email.trim().toLowerCase() !== saved.email.toLowerCase();

  const submit = async (event) => {
    event.preventDefault();
    const found = {
      name: draft.name.trim() ? "" : t("profile.nameRequired"),
      email: EMAIL_PATTERN.test(draft.email.trim()) ? "" : t("profile.emailInvalid"),
      phone: !draft.phone.trim() || PHONE_PATTERN.test(draft.phone.trim()) ? "" : t("profile.phoneInvalid"),
      currentPassword: emailChanged && passwordSet && !currentPassword ? t("profile.currentPasswordRequired") : "",
    };
    if (emailChanged && !passwordSet) found.email = found.email || t("profile.noPasswordError");
    if (Object.values(found).some(Boolean)) return setErrors(found);

    setSaving(true);
    try {
      // The photo as stored: it is saved on its own, from the card above.
      const result = await updateCurrentUserProfile({ ...draft, avatar_url: saved.avatar_url, ...(emailChanged ? { currentPassword } : {}) });
      onSaved(result.user);
      setDraft(toProfile(result.user));
      setCurrentPassword("");
      toast.success(emailChanged ? apiSuccessText(result, "account:profile.emailChanged") : t("profile.saved"));
    } catch (err) {
      const data = err.response?.data;
      const field = FIELD_OF_CODE[data?.code] || (data?.code === "TEXT_TOO_LONG" && data.params?.field);
      if (field && (field in draft || field === "currentPassword")) setErrors({ [field]: apiErrorText(err) });
      else setErrors({ general: apiErrorText(err, "account:profile.saveFailed") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="ac-card" onSubmit={submit} noValidate aria-labelledby="profile-title" data-testid="profile-form">
      <div className="ac-card__h">
        <h2 id="profile-title">{t("profile.title")}</h2>
        <p>{t("profile.subtitle")}</p>
      </div>
      <div className="ac-card__b">
        {errors.general && (
          <div className="fx-alert fx-alert--danger" role="alert"><FieldIcon.Alert /><p>{errors.general}</p></div>
        )}
        <div className="ac-grid2">
          <Field id="profile-name" label={t("profile.name")} error={errors.name}>
            <Control invalid={Boolean(errors.name)}>
              <input {...inputProps("profile-name", errors.name)} value={draft.name} onChange={set("name")} disabled={saving} maxLength={100} autoComplete="name" />
            </Control>
          </Field>
          <Field id="profile-phone" label={t("profile.phone")} error={errors.phone}>
            <Control invalid={Boolean(errors.phone)}>
              <input {...inputProps("profile-phone", errors.phone)} type="tel" value={draft.phone} onChange={set("phone")} disabled={saving} maxLength={20} autoComplete="tel" />
            </Control>
          </Field>
        </div>
        <Field id="profile-email" label={t("profile.email")} error={errors.email}>
          <Control icon={<FieldIcon.Mail />} invalid={Boolean(errors.email)}>
            <input {...inputProps("profile-email", errors.email)} type="email" value={draft.email} onChange={set("email")} disabled={saving} maxLength={255} autoComplete="email" />
          </Control>
        </Field>
        {emailChanged && !passwordSet && (
          <div className="fx-alert fx-alert--warning" role="status" data-testid="email-needs-password">
            <FieldIcon.Lock />
            <p><Trans t={t} i18nKey="profile.noPassword" components={{ reset: <Link to="/forgot-password" state={{ email: saved.email }} /> }} /></p>
          </div>
        )}
        {emailChanged && passwordSet && (
          <Field id="profile-current-password" label={t("profile.currentPassword")} error={errors.currentPassword} help={<p className="fx-help" id="profile-current-password-help">{t("profile.currentPasswordHelp")}</p>}>
            <PasswordInput
              id="profile-current-password"
              error={errors.currentPassword}
              describedBy="profile-current-password-help"
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setErrors((current) => ({ ...current, currentPassword: "", general: "" })); }}
              disabled={saving}
              autoComplete="current-password"
            />
          </Field>
        )}
        <Field id="profile-bio" label={<>{t("profile.bio")} <span className="ac-opt">{t("profile.optional")}</span></>} error={errors.bio}>
          <Control invalid={Boolean(errors.bio)}>
            <textarea {...inputProps("profile-bio", errors.bio)} value={draft.bio} onChange={set("bio")} disabled={saving} maxLength={2000} rows={3} />
          </Control>
        </Field>
      </div>
      <div className="ac-card__f">
        <button type="button" className="g-btn g-btn--ghost" onClick={() => { setDraft(saved); setCurrentPassword(""); setErrors({}); }} disabled={saving || !changed}>{t("profile.reset")}</button>
        <button type="submit" className={`g-btn g-btn--primary${saving ? " is-loading" : ""}`} aria-busy={saving || undefined} disabled={saving}>
          <span>{t("profile.save")}</span>
        </button>
      </div>
    </form>
  );
}
