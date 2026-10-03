import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthCard, { AuthField, PasswordInput } from "../../components/auth/AuthCard";
import api from "../../services/api";
import { apiErrorText, apiSuccessText } from "../../utils/apiError";
import { isStrongPassword } from "../../utils/password";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

// Reached from the link in the password reset email (?token=...).
export default function ResetPassword() {
  const { t } = useTranslation("auth");
  useDocumentTitle(t("reset.title"));
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState({ error: "", success: "" });

  const submit = async (event) => {
    event.preventDefault();
    if (!token) return setResult({ error: t("reset.invalidLink"), success: "" });
    if (!isStrongPassword(password)) return setResult({ error: t("errors.passwordRule"), success: "" });
    if (password !== confirm) return setResult({ error: t("errors.passwordMismatch"), success: "" });
    setBusy(true);
    try {
      const res = await api.post("/reset-password", { token, password });
      setResult({ error: "", success: apiSuccessText(res.data, "auth:reset.done") });
      setPassword("");
      setConfirm("");
    } catch (err) {
      setResult({ error: apiErrorText(err, "auth:reset.failed"), success: "" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t("reset.title")} subtitle={t("reset.subtitle")} testId="reset-page" footer={<Link className="auth-link" to="/login">{t("forgot.back")}</Link>}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <AuthField id="reset-password" label={t("fields.newPassword")}>
          <PasswordInput id="reset-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" disabled={busy} />
        </AuthField>
        <AuthField id="reset-confirm" label={t("fields.confirmPassword")}>
          <PasswordInput id="reset-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" disabled={busy} />
        </AuthField>
        <p className="g-note" style={{ margin: 0 }}>{t("errors.passwordRule")}</p>
        {result.error && <p className="g-alert" role="alert">{result.error}</p>}
        {result.success && <p className="auth-success" role="status">{result.success}</p>}
        <button type="submit" className="g-btn g-btn--primary g-btn--block" disabled={busy}>
          {busy ? t("reset.saving") : t("reset.submit")}
        </button>
      </form>
    </AuthCard>
  );
}
