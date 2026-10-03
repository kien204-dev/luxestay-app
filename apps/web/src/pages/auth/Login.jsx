import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AuthCard, { AuthField, PasswordInput } from "../../components/auth/AuthCard";
import GoogleSignIn from "../../components/auth/GoogleSignIn";
import { useAuth } from "../../context/AuthContext";
import { useProperty } from "../../context/PropertyContext";
import { useToast } from "../../context/ToastContext";
import api from "../../services/api";
import { apiErrorText } from "../../utils/apiError";
import { postLoginPath } from "../../utils/authRedirect";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

const EMAIL_PATTERN = /\S+@\S+\.\S+/;

export default function Login() {
  const { t } = useTranslation("auth");
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { login } = useAuth();
  const property = useProperty();
  useDocumentTitle(t("login.documentTitle"));

  // A message handed over by the page that sent us here (after sign-up).
  const [notice] = useState(() => location.state?.success || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const done = (user) => navigate(postLoginPath(user, location.search), { replace: true });

  const submit = async (event) => {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email)) return setErrors({ email: t("errors.invalidEmail") });
    if (!password) return setErrors({ password: t("errors.passwordRequired") });
    setErrors({});
    setBusy(true);
    try {
      const res = await api.post("/login", { email, password });
      login(res.data.user);
      done(res.data.user);
    } catch (err) {
      setErrors({ general: apiErrorText(err, "auth:errors.wrongCredentials") });
    } finally {
      setBusy(false);
    }
  };

  const demo = property.demo?.accounts;

  return (
    <AuthCard
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      testId="login-page"
      footer={
        <>
          {t("login.noAccount")}{" "}
          <Link className="auth-link" to={`/register${location.search}`}>{t("login.createAccount")}</Link>
        </>
      }
    >
      {notice && <p className="auth-success" role="status" style={{ marginTop: 0 }}>{notice}</p>}
      {demo && (
        <div className="g-note" style={{ marginBottom: 14 }} data-testid="demo-accounts">
          <strong>{t("demo.title")}</strong>
          <ul>
            {demo.map((account) => (
              <li key={account.email}>
                {t(`demo.${account.role}`)}: <code>{account.email}</code> / <code>{account.password}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form className="auth-form" onSubmit={submit} noValidate>
        <AuthField id="login-email" label={t("fields.email")} error={errors.email}>
          <input id="login-email" type="email" className="g-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={Boolean(errors.email) || undefined} disabled={busy} />
        </AuthField>
        <AuthField id="login-password" label={t("fields.password")} error={errors.password}>
          <PasswordInput id="login-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" invalid={Boolean(errors.password)} disabled={busy} />
        </AuthField>
        <div className="auth-row">
          <span />
          <Link className="auth-link" to="/forgot-password">{t("login.forgot")}</Link>
        </div>
        {errors.general && <p className="g-alert" role="alert">{errors.general}</p>}
        <button type="submit" className="g-btn g-btn--primary g-btn--block" disabled={busy}>
          {busy ? t("login.signingIn") : t("login.signIn")}
        </button>
      </form>

      <GoogleSignIn
        busy={busy}
        setBusy={setBusy}
        onSignedIn={(user, linked) => {
          login(user);
          if (linked) toast.info(t("google.linked"));
          done(user);
        }}
        onError={(message) => setErrors({ general: message })}
      />
    </AuthCard>
  );
}
