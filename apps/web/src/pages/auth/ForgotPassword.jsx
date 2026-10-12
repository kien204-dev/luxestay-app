import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { Control, Field, FieldIcon, inputProps } from "../../components/auth/fields";
import { useProperty } from "../../context/PropertyContext";
import api from "../../services/api";
import { apiErrorText } from "../../utils/apiError";
import { EMAIL_PATTERN } from "../../utils/format";
import { formatCountdown, readRateLimit } from "../../utils/rateLimit";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

// Ticks once a second while `until` (ms since epoch) is in the future.
function useNow(until) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until || until <= Date.now()) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  return now;
}

// "Forgot password?" and, once sent, "Check your inbox". The answer is the
// same whether or not the email has an account (the API does not say). The
// "send again" button follows the API's own limit on reset emails: it waits
// only once that limit is used up, for as long as the API says.
export default function ForgotPassword() {
  const { t } = useTranslation("auth");
  const location = useLocation();
  const { auth } = useProperty();
  useDocumentTitle(t("forgot.documentTitle"));

  const [email, setEmail] = useState(() => location.state?.email || "");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState({ field: "", general: "" });
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const [limit, setLimit] = useState(null);
  // The clock only ticks while waiting; until its first tick, the moment the
  // answer came is "now".
  const now = Math.max(useNow(limit?.remaining === 0 ? limit.resetAt : null), limit?.at || 0);
  const waiting = limit?.remaining === 0 && limit.resetAt > now;

  const send = async (address) => {
    setBusy(true);
    setError({ field: "", general: "" });
    try {
      const res = await api.post("/forgot-password", { email: address });
      setLimit(readRateLimit(res));
      if (sentTo) setResent(true);
      setSentTo(address);
    } catch (err) {
      const state = readRateLimit(err.response);
      if (state) setLimit(state);
      if (sentTo && err.response?.status === 429) setResent(false);
      else setError({ field: "", general: apiErrorText(err, "auth:forgot.failed") });
    } finally {
      setBusy(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    const address = email.trim();
    if (!EMAIL_PATTERN.test(address)) return setError({ field: t("errors.invalidEmail"), general: "" });
    send(address);
  };

  const minutes = auth?.resetLinkMinutes;
  const limitNote = waiting && auth?.forgotPassword && (
    <p className="fx-help" data-testid="resend-limit">{t("sent.limitReached", { limit: auth.forgotPassword.limit, minutes: auth.forgotPassword.windowMinutes })}</p>
  );

  if (sentTo) {
    return (
      <div className="au__form" role="status" data-testid="forgot-sent">
        <div className="au__big-ic"><FieldIcon.Mail /></div>
        <h1>{t("sent.title")}</h1>
        <p className="au__lead">
          <Trans t={t} i18nKey="sent.text" values={{ email: sentTo, count: minutes }} components={{ b: <b /> }} />
        </p>
        <div className="fx-alert">
          <FieldIcon.Info />
          <p>{t("sent.spam")}</p>
        </div>
        {error.general && (
          <div className="fx-alert fx-alert--danger" role="alert">
            <FieldIcon.Alert />
            <p>{error.general}</p>
          </div>
        )}
        <button
          type="button"
          className={`g-btn g-btn--outline g-btn--lg g-btn--block${busy ? " is-loading" : ""}`}
          onClick={() => send(sentTo)}
          disabled={busy || waiting}
          data-testid="resend"
        >
          <span>{waiting ? t("sent.resendIn", { time: formatCountdown(limit.resetAt - now) }) : t("sent.resend")}</span>
        </button>
        {limitNote}
        {resent && !waiting && <p className="fx-help" role="status">{t("sent.resent")}</p>}
        <p className="au__switch">
          <button type="button" className="au__link-button" onClick={() => { setSentTo(""); setResent(false); }}>{t("sent.otherEmail")}</button>
          {" · "}
          <Link to="/login">{t("common.backToLogin")}</Link>
        </p>
      </div>
    );
  }

  return (
    <form className="au__form" onSubmit={submit} noValidate aria-labelledby="forgot-title" data-testid="forgot-page">
      <Link to="/login" className="au__back">← {t("common.backToLogin")}</Link>
      <h1 id="forgot-title">{t("forgot.title")}</h1>
      <p className="au__lead">{minutes ? t("forgot.subtitle", { count: minutes }) : t("forgot.subtitleNoTime")}</p>
      {error.general && (
        <div className="fx-alert fx-alert--danger" role="alert">
          <FieldIcon.Alert />
          <p>{error.general}</p>
        </div>
      )}
      <Field id="forgot-email" label={t("fields.email")} error={error.field}>
        <Control icon={<FieldIcon.Mail />} invalid={Boolean(error.field)}>
          <input
            {...inputProps("forgot-email", error.field)}
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError({ field: "", general: "" }); }}
            placeholder={t("fields.emailPlaceholder")}
            autoComplete="email"
            disabled={busy}
          />
        </Control>
      </Field>
      <button type="submit" className={`g-btn g-btn--primary g-btn--lg g-btn--block${busy ? " is-loading" : ""}`} aria-busy={busy || undefined} disabled={busy || waiting}>
        <span>{waiting ? t("sent.resendIn", { time: formatCountdown(limit.resetAt - now) }) : t("forgot.send")}</span>
      </button>
      {limitNote}
    </form>
  );
}
