import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { Control, Field, FieldIcon, PasswordInput, PasswordMeter, PasswordRules, inputProps, usePasswordRules } from "../../components/auth/fields";
import api from "../../services/api";
import { apiErrorText } from "../../utils/apiError";
import { isStrongPassword } from "../../utils/password";
import { useAsyncData } from "../../utils/useAsyncData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

// Asks the API whether the link still works: { valid, email } or the reason
// it does not ({ reason: expired | used | invalid, createdAt?, expiresAt? }).
async function checkLink(token) {
  if (!token) return { reason: "invalid" };
  try {
    const res = await api.post("/reset-password/check", { token });
    return res.data;
  } catch (err) {
    if (err.response?.data?.code === "RESET_TOKEN_INVALID") return err.response.data;
    throw err;
  }
}

function formatTime(iso, lang) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString(lang === "en" ? "en-GB" : "vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    ...(sameDay ? {} : { day: "2-digit", month: "2-digit", year: "numeric" }),
  });
}

// The link cannot be used: expired (with its real times), used, or not a link.
function LinkProblem({ link }) {
  const { t, i18n } = useTranslation("auth");
  const reason = ["expired", "used"].includes(link.reason) ? link.reason : "invalid";
  const minutes = link.createdAt && link.expiresAt ? Math.round((new Date(link.expiresAt) - new Date(link.createdAt)) / 60000) : null;
  return (
    <div className="au__form" role="alert" data-testid={`reset-${reason}`}>
      <div className="au__big-ic is-bad">{reason === "expired" ? <ClockIcon /> : <FieldIcon.Alert />}</div>
      <h1>{t(`linkProblem.${reason}Title`)}</h1>
      <p className="au__lead">
        {reason === "expired" && minutes
          ? t("linkProblem.expiredText", { count: minutes, created: formatTime(link.createdAt, i18n.language), expired: formatTime(link.expiresAt, i18n.language) })
          : t(`linkProblem.${reason === "expired" ? "expiredShort" : `${reason}Text`}`)}
      </p>
      <Link to="/forgot-password" className="g-btn g-btn--primary g-btn--lg g-btn--block">{t("linkProblem.newLink")}</Link>
      <p className="au__switch"><Link to="/login">{t("common.backToLogin")}</Link></p>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="fx-icon">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

// Reached from the link in the password reset email (?token=...).
export default function ResetPassword() {
  const { t } = useTranslation("auth");
  useDocumentTitle(t("reset.documentTitle"));
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const rules = usePasswordRules();
  const { data: link, error: checkError, reload } = useAsyncData(`reset-link:${token}`, () => checkLink(token));

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [problem, setProblem] = useState(null);

  if (done) {
    return (
      <div className="au__form" role="status" data-testid="reset-done">
        <div className="au__big-ic is-ok"><FieldIcon.Check /></div>
        <h1>{t("done.title")}</h1>
        <p className="au__lead">{t("done.text")}</p>
        <Link to="/login" state={{ email: link?.email }} className="g-btn g-btn--primary g-btn--lg g-btn--block">{t("done.signIn")}</Link>
      </div>
    );
  }

  if (checkError) {
    return (
      <div className="au__form" role="alert">
        <h1>{t("reset.title")}</h1>
        <div className="fx-alert fx-alert--danger"><FieldIcon.Alert /><p>{apiErrorText(checkError, "auth:reset.checkFailed")}</p></div>
        <button type="button" className="g-btn g-btn--outline g-btn--lg g-btn--block" onClick={reload}>{t("reset.retry")}</button>
      </div>
    );
  }

  if (!link) {
    return (
      <div className="au__form" aria-busy="true">
        <h1>{t("reset.title")}</h1>
        <p className="au__lead" role="status">{t("reset.checking")}</p>
      </div>
    );
  }

  if (problem || !link.valid) return <LinkProblem link={problem || link} />;

  const strong = isStrongPassword(password, rules);

  const submit = async (event) => {
    event.preventDefault();
    const found = {
      password: strong ? "" : password ? t("errors.passwordRule") : t("errors.passwordRequired"),
      confirm: password && confirm !== password ? t("errors.passwordMismatch") : "",
    };
    if (found.password || found.confirm) return setErrors(found);
    setBusy(true);
    try {
      await api.post("/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      const data = err.response?.data;
      // The link stopped working while the page was open: say why.
      if (data?.code === "RESET_TOKEN_INVALID") setProblem(await checkLink(token).catch(() => ({ reason: "invalid" })));
      else if (data?.code === "WEAK_PASSWORD") setErrors({ password: apiErrorText(err) });
      else setErrors({ general: apiErrorText(err, "auth:reset.failed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="au__form" onSubmit={submit} noValidate aria-labelledby="reset-title" data-testid="reset-page">
      <h1 id="reset-title">{t("reset.title")}</h1>
      <p className="au__lead"><Trans t={t} i18nKey="reset.forAccount" values={{ email: link.email }} components={{ b: <b /> }} /></p>
      {/* Lets password managers file the new password under the right account. */}
      <input type="email" name="username" autoComplete="username" value={link.email} readOnly hidden />
      {errors.general && (
        <div className="fx-alert fx-alert--danger" role="alert"><FieldIcon.Alert /><p>{errors.general}</p></div>
      )}
      <Field
        id="reset-password"
        label={t("fields.newPassword")}
        error={errors.password}
        help={
          <>
            <PasswordMeter password={password} />
            <PasswordRules id="reset-password-rules" password={password} />
          </>
        }
      >
        <PasswordInput
          id="reset-password"
          error={errors.password}
          describedBy="reset-password-rules"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setErrors({}); }}
          autoComplete="new-password"
          disabled={busy}
        />
      </Field>
      <Field id="reset-confirm" label={t("fields.confirmPassword")} error={errors.confirm}>
        <Control invalid={Boolean(errors.confirm)}>
          <input
            {...inputProps("reset-confirm", errors.confirm)}
            type="password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setErrors((current) => ({ ...current, confirm: "" })); }}
            autoComplete="new-password"
            disabled={busy}
          />
        </Control>
      </Field>
      <button type="submit" className={`g-btn g-btn--primary g-btn--lg g-btn--block${busy ? " is-loading" : ""}`} aria-busy={busy || undefined} disabled={busy || !strong}>
        <span>{t("reset.submit")}</span>
      </button>
    </form>
  );
}
