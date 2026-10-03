import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Field } from "../../components/admin/ui";
import { useAuth } from "../../context/AuthContext";
import { changeCurrentUserPassword } from "../../services/userService";
import { apiErrorText, apiSuccessText } from "../../utils/apiError";
import { isStrongPassword } from "../../utils/password";

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

// Change the password, knowing the current one.
export default function PasswordForm() {
  const { t } = useTranslation("account");
  const { user, updateCurrentUser } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ error: "", success: "" });
  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setMessage({ error: "", success: "" });
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.currentPassword || !form.newPassword) return setMessage({ error: t("password.required"), success: "" });
    if (!isStrongPassword(form.newPassword)) return setMessage({ error: t("password.rule"), success: "" });
    if (form.newPassword !== form.confirmPassword) return setMessage({ error: t("password.mismatch"), success: "" });

    setBusy(true);
    try {
      const result = await changeCurrentUserPassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm(EMPTY);
      updateCurrentUser({ must_change_password: false });
      setMessage({ error: "", success: apiSuccessText(result, "account:password.changed") });
    } catch (err) {
      setMessage({ error: apiErrorText(err, "account:password.failed"), success: "" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="adm-panel adm-panel--padded" data-testid="password-form">
      <h2>{t("password.title")}</h2>
      {user?.must_change_password && <p className="adm-note" style={{ margin: "0 0 16px" }}>{t("password.mustChange")}</p>}

      <Alert>{message.error}</Alert>
      {message.success && <p className="adm-note" role="status" style={{ margin: "0 0 16px", color: "var(--color-success)" }}>{message.success}</p>}

      <div className="adm-form-grid">
        <Field label={t("password.current")} htmlFor="password-current">
          <input id="password-current" type="password" className="adm-input" value={form.currentPassword} onChange={set("currentPassword")} disabled={busy} autoComplete="current-password" />
        </Field>
        <Field label={t("password.new")} htmlFor="password-new">
          <input id="password-new" type="password" className="adm-input" value={form.newPassword} onChange={set("newPassword")} disabled={busy} autoComplete="new-password" />
        </Field>
        <Field label={t("password.confirm")} htmlFor="password-confirm">
          <input id="password-confirm" type="password" className="adm-input" value={form.confirmPassword} onChange={set("confirmPassword")} disabled={busy} autoComplete="new-password" />
        </Field>
      </div>
      <p className="adm-hint">{t("password.rule")}</p>
      <div className="adm-actions" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>{busy ? t("password.updating") : t("password.submit")}</button>
      </div>
    </form>
  );
}
