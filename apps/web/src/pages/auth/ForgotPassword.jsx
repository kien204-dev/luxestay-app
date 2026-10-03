import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthCard, { AuthField } from "../../components/auth/AuthCard";
import api from "../../services/api";
import { apiErrorText, apiSuccessText } from "../../utils/apiError";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

export default function ForgotPassword() {
  const { t } = useTranslation("auth");
  useDocumentTitle(t("forgot.title"));
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState({ error: "", success: "" });

  const submit = async (event) => {
    event.preventDefault();
    if (!/\S+@\S+\.\S+/.test(email)) return setResult({ error: t("errors.invalidEmail"), success: "" });
    setBusy(true);
    try {
      const res = await api.post("/forgot-password", { email });
      setResult({ error: "", success: apiSuccessText(res.data, "auth:forgot.sent") });
    } catch (err) {
      setResult({ error: apiErrorText(err, "auth:forgot.failed"), success: "" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t("forgot.title")} subtitle={t("forgot.subtitle")} testId="forgot-page" footer={<Link className="auth-link" to="/login">{t("forgot.back")}</Link>}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <AuthField id="forgot-email" label={t("fields.email")}>
          <input id="forgot-email" type="email" className="g-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={busy} />
        </AuthField>
        {result.error && <p className="g-alert" role="alert">{result.error}</p>}
        {result.success && <p className="auth-success" role="status">{result.success}</p>}
        <button type="submit" className="g-btn g-btn--primary g-btn--block" disabled={busy}>
          {busy ? t("forgot.sending") : t("forgot.send")}
        </button>
      </form>
    </AuthCard>
  );
}
