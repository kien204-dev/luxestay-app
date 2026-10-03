import i18n from "../i18n";
import { apiErrorText } from "./apiError";

// Firebase error codes with a translation in auth.json (google.errors.*).
const KNOWN_CODES = [
  "auth/unauthorized-domain",
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/invalid-api-key",
  "auth/network-request-failed",
];

export function getGoogleAuthErrorMessage(error) {
  // The API answered (e.g. the account is locked): show its message.
  if (error?.response) return apiErrorText(error, "auth:google.errors.generic");

  const code = error?.code;
  if (KNOWN_CODES.includes(code)) return `${i18n.t(`auth:google.errors.${code.replace("auth/", "")}`)} (${code})`;
  if (code?.startsWith("auth/")) return i18n.t("auth:google.errors.withCode", { code });
  return i18n.t("auth:google.errors.generic");
}

export function logGoogleAuthError(error) {
  console.error("Google sign-in failed", {
    code: error?.code,
    message: error?.message,
    apiStatus: error?.response?.status,
    apiCode: error?.response?.data?.code,
  });
}
