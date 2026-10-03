import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthCard, { AuthField, PasswordInput } from "../../components/auth/AuthCard";
import GoogleSignIn from "../../components/auth/GoogleSignIn";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import { apiErrorText } from "../../utils/apiError";
import { postLoginPath } from "../../utils/authRedirect";
import { isStrongPassword } from "../../utils/password";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

const EMAIL_PATTERN = /\S+@\S+\.\S+/;

export default function Register() {
  const { t } = useTranslation("auth");
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  useDocumentTitle(t("register.documentTitle"));

  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: "", general: "" }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return setErrors({ name: t("errors.nameRequired") });
    if (!EMAIL_PATTERN.test(form.email)) return setErrors({ email: t("errors.invalidEmail") });
    if (!isStrongPassword(form.password)) return setErrors({ password: t("errors.passwordRule") });
    if (form.password !== form.confirmPassword) return setErrors({ confirmPassword: t("errors.passwordMismatch") });

    setBusy(true);
    try {
      await api.post("/register", { name: form.name, email: form.email, password: form.password });
      navigate(`/login${location.search}`, { state: { success: t("register.success") } });
    } catch (err) {
      setErrors({ general: apiErrorText(err, "auth:errors.registerFailed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title={t("register.title")}
      subtitle={t("register.subtitle")}
      testId="register-page"
      footer={
        <>
          {t("register.haveAccount")}{" "}
          <Link className="auth-link" to={`/login${location.search}`}>{t("register.signIn")}</Link>
        </>
      }
    >
      <form className="auth-form" onSubmit={submit} noValidate>
        <AuthField id="register-name" label={t("fields.name")} error={errors.name}>
          <input id="register-name" className="g-input" value={form.name} onChange={set("name")} autoComplete="name" maxLength={100} disabled={busy} />
        </AuthField>
        <AuthField id="register-email" label={t("fields.email")} error={errors.email}>
          <input id="register-email" type="email" className="g-input" value={form.email} onChange={set("email")} autoComplete="email" maxLength={255} disabled={busy} />
        </AuthField>
        <AuthField id="register-password" label={t("fields.password")} error={errors.password}>
          <PasswordInput id="register-password" value={form.password} onChange={set("password")} autoComplete="new-password" invalid={Boolean(errors.password)} disabled={busy} />
        </AuthField>
        <AuthField id="register-confirm" label={t("fields.confirmPassword")} error={errors.confirmPassword}>
          <PasswordInput id="register-confirm" value={form.confirmPassword} onChange={set("confirmPassword")} autoComplete="new-password" invalid={Boolean(errors.confirmPassword)} disabled={busy} />
        </AuthField>
        <p className="g-note" style={{ margin: 0 }}>{t("errors.passwordRule")}</p>
        {errors.general && <p className="g-alert" role="alert">{errors.general}</p>}
        <button type="submit" className="g-btn g-btn--primary g-btn--block" disabled={busy}>
          {busy ? t("register.creating") : t("register.create")}
        </button>
      </form>

      <GoogleSignIn
        busy={busy}
        setBusy={setBusy}
        onSignedIn={(user) => {
          login(user);
          navigate(postLoginPath(user, location.search), { replace: true });
        }}
        onError={(message) => setErrors({ general: message })}
      />
    </AuthCard>
  );
}
