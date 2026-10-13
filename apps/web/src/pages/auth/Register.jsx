import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { Control, Field, FieldIcon, PasswordInput, PasswordMeter, PasswordRules, inputProps, usePasswordRules } from "../../components/auth/fields";
import GoogleSignIn from "../../components/auth/GoogleSignIn";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import { apiErrorText } from "../../utils/apiError";
import { postLoginPath } from "../../utils/authRedirect";
import { EMAIL_PATTERN } from "../../utils/format";
import { isStrongPassword } from "../../utils/password";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

// Which box an API refusal belongs under.
const FIELD_OF_CODE = { EMAIL_EXISTS: "email", INVALID_EMAIL: "email", WEAK_PASSWORD: "password" };

export default function Register() {
  const { t } = useTranslation("auth");
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const rules = usePasswordRules();
  useDocumentTitle(t("register.documentTitle"));

  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: "", general: "" }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = {
      name: form.name.trim() ? "" : t("errors.nameRequired"),
      email: EMAIL_PATTERN.test(form.email.trim()) ? "" : t("errors.invalidEmail"),
      password: isStrongPassword(form.password, rules) ? "" : form.password ? t("errors.passwordRule") : t("errors.passwordRequired"),
    };
    if (found.name || found.email || found.password) return setErrors(found);

    setBusy(true);
    try {
      await api.post("/register", { name: form.name.trim(), email: form.email.trim(), password: form.password });
      navigate(`/login${location.search}`, { state: { success: t("register.success"), email: form.email.trim() } });
    } catch (err) {
      const data = err.response?.data;
      const field = FIELD_OF_CODE[data?.code] || (data?.code === "TEXT_TOO_LONG" && data.params?.field);
      if (data?.code === "EMAIL_EXISTS") setErrors({ email: "exists" });
      else if (field && field in form) setErrors({ [field]: apiErrorText(err) });
      else setErrors({ general: apiErrorText(err, "auth:errors.registerFailed") });
    } finally {
      setBusy(false);
    }
  };

  const emailError =
    errors.email === "exists" ? (
      <Trans
        t={t}
        i18nKey="register.emailExists"
        components={{
          login: <Link to={`/login${location.search}`} state={{ email: form.email.trim() }} />,
          reset: <Link to="/forgot-password" state={{ email: form.email.trim() }} />,
        }}
      />
    ) : (
      errors.email
    );

  return (
    <form className="au__form" onSubmit={submit} noValidate aria-labelledby="register-title" data-testid="register-page">
      <h1 id="register-title">{t("register.title")}</h1>
      <p className="au__lead">{t("register.subtitle")}</p>

      {errors.general && (
        <div className="fx-alert fx-alert--danger" role="alert">
          <FieldIcon.Alert />
          <p>{errors.general}</p>
        </div>
      )}

      <GoogleSignIn
        busy={busy}
        setBusy={setBusy}
        onSignedIn={(user) => {
          login(user);
          navigate(postLoginPath(user, location.search), { replace: true });
        }}
        onError={({ message }) => setErrors({ general: message })}
      />

      <Field id="register-name" label={t("fields.name")} error={errors.name}>
        <Control invalid={Boolean(errors.name)}>
          <input {...inputProps("register-name", errors.name)} value={form.name} onChange={set("name")} autoComplete="name" maxLength={100} disabled={busy} />
        </Control>
      </Field>
      <Field id="register-email" label={t("fields.email")} error={emailError}>
        <Control invalid={Boolean(errors.email)}>
          <input {...inputProps("register-email", errors.email)} type="email" value={form.email} onChange={set("email")} placeholder={t("fields.emailPlaceholder")} autoComplete="email" maxLength={255} disabled={busy} />
        </Control>
      </Field>
      <Field
        id="register-password"
        label={t("fields.password")}
        error={errors.password}
        help={
          <>
            <PasswordMeter password={form.password} />
            <PasswordRules id="register-password-rules" password={form.password} />
          </>
        }
      >
        <PasswordInput id="register-password" error={errors.password} describedBy="register-password-rules" value={form.password} onChange={set("password")} autoComplete="new-password" disabled={busy} />
      </Field>

      <button type="submit" className={`g-btn g-btn--primary g-btn--lg g-btn--block${busy ? " is-loading" : ""}`} aria-busy={busy || undefined} disabled={busy}>
        <span>{t("register.create")}</span>
      </button>
      <p className="au__switch">
        {t("register.haveAccount")} <Link to={`/login${location.search}`}>{t("register.signIn")}</Link>
      </p>
    </form>
  );
}
