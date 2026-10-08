import { useTranslation } from "react-i18next";
import { signInWithPopup } from "firebase/auth";
import { auth, isFirebaseConfigured, provider } from "../../firebase";
import api from "../../services/api";
import { getGoogleAuthErrorMessage, logGoogleAuthError } from "../../utils/googleAuthError";

// Google's logo, in Google's colours (not the property's theme).
const GOOGLE_LOGO = [
  ["#EA4335", "M24 9.5c3.54 0 6.68 1.22 9.17 3.6l6.85-6.85C35.9 2.27 30.37 0 24 0 14.64 0 6.44 5.48 2.7 13.44l7.98 6.2C12.4 13.02 17.7 9.5 24 9.5z"], // theme-ignore
  ["#34A853", "M24 48c6.37 0 11.73-2.1 15.64-5.7l-7.3-5.67c-2.03 1.37-4.64 2.18-8.34 2.18-6.3 0-11.6-3.52-13.32-8.64l-7.98 6.2C6.44 42.52 14.64 48 24 48z"], // theme-ignore
  ["#4A90E2", "M46.1 24.5c0-1.64-.14-3.21-.4-4.73H24v9.02h12.4c-.54 2.9-2.2 5.36-4.7 7.02l7.3 5.67c4.27-3.93 6.7-9.73 6.7-16.98z"], // theme-ignore
  ["#FBBC05", "M10.68 28.17c-.43-1.28-.68-2.65-.68-4.17s.25-2.89.68-4.17l-7.98-6.2C1.66 16.6 1 20.2 1 24s.66 7.4 1.7 10.37l7.98-6.2z"], // theme-ignore
];

// "Continue with Google". Disabled (with a note) when the site has no
// Firebase configuration. onSignedIn(user, linked) / onError(message).
export default function GoogleSignIn({ busy, setBusy, onSignedIn, onError }) {
  const { t } = useTranslation("auth");

  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await signInWithPopup(auth, provider);
      const res = await api.post("/google-login", { idToken: await result.user.getIdToken() });
      onSignedIn(res.data.user, res.data.linked);
    } catch (err) {
      logGoogleAuthError(err);
      onError(getGoogleAuthErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="auth-divider">{t("common.or")}</div>
      <button type="button" className="auth-google" onClick={signIn} disabled={busy || !isFirebaseConfigured} title={isFirebaseConfigured ? undefined : t("google.notConfigured")}>
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
          {GOOGLE_LOGO.map(([fill, d]) => (
            <path key={fill} fill={fill} d={d} />
          ))}
        </svg>
        {t("google.button")}
      </button>
      {!isFirebaseConfigured && <p className="adm-hint" style={{ textAlign: "center", color: "var(--ink-muted)" }}>{t("google.notConfigured")}</p>}
    </>
  );
}
