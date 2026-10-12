import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Field, FieldIcon, PasswordInput, PasswordMeter, PasswordRules, usePasswordRules } from "../../components/auth/fields";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { changeCurrentUserPassword } from "../../services/userService";
import { apiErrorText } from "../../utils/apiError";
import { isStrongPassword } from "../../utils/password";

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

// Change the password, knowing the current one. The API signs every other
// session out (token_version) and keeps this one.
export default function PasswordForm() {
  const { t } = useTranslation("account");
  const tAuth = useTranslation("auth").t;
  const toast = useToast();
  const rules = usePasswordRules();
  const { user, updateCurrentUser } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: "", general: "" }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = {
      currentPassword: form.currentPassword ? "" : t("password.currentRequired"),
      newPassword: isStrongPassword(form.newPassword, rules) ? "" : form.newPassword ? tAuth("errors.passwordRule") : tAuth("errors.passwordRequired"),
      confirmPassword: form.newPassword && form.confirmPassword !== form.newPassword ? tAuth("errors.passwordMismatch") : "",
    };
    if (Object.values(found).some(Boolean)) return setErrors(found);

    setBusy(true);
    try {
      await changeCurrentUserPassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm(EMPTY);
      updateCurrentUser({ must_change_password: false });
      toast.success(t("password.changed"));
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === "CURRENT_PASSWORD_WRONG") setErrors({ currentPassword: apiErrorText(err) });
      else if (code === "WEAK_PASSWORD") setErrors({ newPassword: apiErrorText(err) });
      else setErrors({ general: apiErrorText(err, "account:password.failed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="ac-card" onSubmit={submit} noValidate aria-labelledby="password-title" data-testid="password-form">
      <div className="ac-card__h">
        <h2 id="password-title">{t("password.title")}</h2>
        <p>{t("password.subtitle")}</p>
      </div>
      <div className="ac-card__b ac-card__b--narrow">
        {user?.must_change_password && (
          <div className="fx-alert fx-alert--warning" role="status" data-testid="must-change"><FieldIcon.Lock /><p>{t("password.mustChange")}</p></div>
        )}
        {errors.general && (
          <div className="fx-alert fx-alert--danger" role="alert"><FieldIcon.Alert /><p>{errors.general}</p></div>
        )}
        {/* Lets password managers file the new password under this account. */}
        <input type="email" name="username" autoComplete="username" value={user?.email || ""} readOnly hidden />
        <Field id="password-current" label={t("password.current")} error={errors.currentPassword}>
          <PasswordInput id="password-current" error={errors.currentPassword} value={form.currentPassword} onChange={set("currentPassword")} disabled={busy} autoComplete="current-password" />
        </Field>
        <Field
          id="password-new"
          label={t("password.new")}
          error={errors.newPassword}
          help={
            <>
              <PasswordMeter password={form.newPassword} />
              <PasswordRules id="password-new-rules" password={form.newPassword} />
            </>
          }
        >
          <PasswordInput id="password-new" error={errors.newPassword} describedBy="password-new-rules" value={form.newPassword} onChange={set("newPassword")} disabled={busy} autoComplete="new-password" />
        </Field>
        <Field id="password-confirm" label={t("password.confirm")} error={errors.confirmPassword}>
          <PasswordInput id="password-confirm" error={errors.confirmPassword} value={form.confirmPassword} onChange={set("confirmPassword")} disabled={busy} autoComplete="new-password" />
        </Field>
      </div>
      <div className="ac-card__f">
        <button type="button" className="g-btn g-btn--ghost" onClick={() => { setForm(EMPTY); setErrors({}); }} disabled={busy}>{t("password.cancel")}</button>
        <button type="submit" className={`g-btn g-btn--primary${busy ? " is-loading" : ""}`} aria-busy={busy || undefined} disabled={busy}>
          <span>{t("password.submit")}</span>
        </button>
      </div>
    </form>
  );
}
