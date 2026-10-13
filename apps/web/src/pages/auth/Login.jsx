import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Control, Field, FieldIcon, PasswordInput, inputProps } from "../../components/auth/fields";
import GoogleSignIn from "../../components/auth/GoogleSignIn";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import api from "../../services/api";
import { apiErrorText } from "../../utils/apiError";
import { postLoginPath } from "../../utils/authRedirect";
import { EMAIL_PATTERN } from "../../utils/format";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

export default function Login() {
  const { t } = useTranslation("auth");
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { login } = useAuth();
  useDocumentTitle(t("login.documentTitle"));

  // A message handed over by the page that sent us here (after sign-up).
  const [notice] = useState(() => location.state?.success || "");
  const [email, setEmail] = useState(() => location.state?.email || "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  // An admin pressed "Continue with Google": { email } of that Google account.
  const [adminNotice, setAdminNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const done = (user) => navigate(postLoginPath(user, location.search), { replace: true });
  const edit = (setter, key) => (event) => {
    setter(event.target.value);
    setErrors((current) => ({ ...current, [key]: "", general: "" }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = {
      email: EMAIL_PATTERN.test(email.trim()) ? "" : t("errors.invalidEmail"),
      password: password ? "" : t("errors.passwordRequired"),
    };
    if (found.email || found.password) return setErrors(found);
    setErrors({});
    setAdminNotice(null);
    setBusy(true);
    try {
      const res = await api.post("/login", { email: email.trim(), password });
      login(res.data.user);
      done(res.data.user);
    } catch (err) {
      // Which of the two was wrong is not said (on purpose): the message goes
      // under the password, the box a visitor retypes.
      if (err.response?.data?.code === "INVALID_CREDENTIALS") setErrors({ password: t("errors.wrongCredentials") });
      else setErrors({ general: apiErrorText(err, "auth:errors.wrongCredentials") });
    } finally {
      setBusy(false);
    }
  };

  const googleFailed = ({ code, message, email: googleEmail }) => {
    if (code === "GOOGLE_ADMIN_PASSWORD_REQUIRED") {
      setErrors({});
      setAdminNotice({ email: googleEmail });
      if (googleEmail) setEmail(googleEmail);
    } else {
      setAdminNotice(null);
      setErrors({ general: message });
    }
  };

  return (
    <form className="au__form" onSubmit={submit} noValidate aria-labelledby="login-title" data-testid="login-page">
      <h1 id="login-title">{t("login.title")}</h1>
      <p className="au__lead">{t("login.subtitle")}</p>

      {notice && (
        <div className="fx-alert fx-alert--success" role="status">
          <FieldIcon.Check />
          <p>{notice}</p>
        </div>
      )}
      {adminNotice && (
        <div className="fx-alert fx-alert--warning" role="alert" data-testid="admin-notice">
          <FieldIcon.Lock />
          <p>
            <b>{t("adminNotice.title")}</b>{" "}
            {adminNotice.email ? t("adminNotice.withEmail", { email: adminNotice.email }) : t("adminNotice.withoutEmail")}
          </p>
        </div>
      )}
      {errors.general && (
        <div className="fx-alert fx-alert--danger" role="alert">
          <FieldIcon.Alert />
          <p>{errors.general}</p>
        </div>
      )}

      <GoogleSignIn
        busy={busy}
        setBusy={setBusy}
        onSignedIn={(user, linked) => {
          login(user);
          if (linked) toast.info(t("google.linked"));
          done(user);
        }}
        onError={googleFailed}
      />

      <Field id="login-email" label={t("fields.email")} error={errors.email}>
        <Control icon={<FieldIcon.Mail />} invalid={Boolean(errors.email)}>
          <input {...inputProps("login-email", errors.email)} type="email" value={email} onChange={edit(setEmail, "email")} placeholder={t("fields.emailPlaceholder")} autoComplete="email" disabled={busy} />
        </Control>
      </Field>
      <Field
        id="login-password"
        label={t("fields.password")}
        aside={<Link to="/forgot-password" state={{ email: email.trim() }}>{t("login.forgot")}</Link>}
        error={errors.password}
      >
        <PasswordInput id="login-password" icon={<FieldIcon.Lock />} error={errors.password} value={password} onChange={edit(setPassword, "password")} autoComplete="current-password" disabled={busy} />
      </Field>

      <button type="submit" className={`g-btn g-btn--primary g-btn--lg g-btn--block${busy ? " is-loading" : ""}`} aria-busy={busy || undefined} disabled={busy}>
        <span>{t("login.signIn")}</span>
      </button>
      <p className="au__switch">
        {t("login.noAccount")} <Link to={`/register${location.search}`}>{t("login.createAccount")}</Link>
      </p>
    </form>
  );
}
