const { buildAllowedOrigins, getPublicWebUrl } = require("../services/allowedOrigins");
const { getAuthCookieOptions } = require("../services/authSession");
const { getVnpayConfig } = require("../services/vnpayService");
const { getMomoConfig, isMomoEnabled } = require("../services/momoService");
const { isEmailConfigured } = require("../services/emailService");
const { isGoogleLoginConfigured } = require("../services/firebaseAdmin");
const { getAppTimezone } = require("../utils/time");
const { describeStorage } = require("../services/storage");
const { demoResetIntervalHours, isDemoMode } = require("./demo");
const { APP_NAME } = require("./brand");

// Variables whose VALUE must never reach a log. They are only ever reported
// as "set" or "empty".
const SECRET_VARIABLES = [
  "DB_PASSWORD",
  "JWT_SECRET",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_PASSWORD",
  "VNPAY_TMN_CODE",
  "VNPAY_HASH_SECRET",
  "MOMO_PARTNER_CODE",
  "MOMO_ACCESS_KEY",
  "MOMO_SECRET_KEY",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "SEED_ADMIN_PASSWORD",
];

function presence(name) {
  return `${name}=${process.env[name] ? "set" : "empty"}`;
}

function onOff(enabled, detail) {
  return `${enabled ? "on" : "off"}${detail ? ` (${detail})` : ""}`;
}

function missing(names) {
  const absent = names.filter((name) => !process.env[name]);
  return absent.length ? `missing: ${absent.join(", ")}` : "";
}

// A URL is shown without anything that could be a credential in it.
function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value ? "(not a valid URL)" : "(none)";
  }
}

// Lines describing the configuration the API actually loaded: which file or
// variable won, what is switched on, where guests are sent. Safe to log —
// secrets appear as "set"/"empty" only.
function describeConfig() {
  const origins = buildAllowedOrigins();
  const cookie = getAuthCookieOptions();
  const vnpayMissing = missing(["VNPAY_TMN_CODE", "VNPAY_HASH_SECRET"]);
  const momoMissing = missing([
    "MOMO_PARTNER_CODE",
    "MOMO_ACCESS_KEY",
    "MOMO_SECRET_KEY",
    "MOMO_IPN_URL",
  ]);
  const vnpay = getVnpayConfig();
  const momo = getMomoConfig();

  return [
    `Configuration (${APP_NAME}, NODE_ENV=${process.env.NODE_ENV || "(unset)"})`,
    `  Web address        ${getPublicWebUrl()}`,
    `  Allowed origins    ${[...origins].join(", ") || "(none: every browser request that changes data will be refused)"}`,
    `  Trusted proxies    ${Number(process.env.TRUST_PROXY_HOPS) || 0}`,
    `  Session cookie     secure=${cookie.secure} sameSite=${cookie.sameSite}`,
    `  Timezone           ${getAppTimezone()}`,
    `  Database           ${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || ""}`,
    `  Uploads            ${describeStorage()}`,
    `  Email              ${onOff(isEmailConfigured())}`,
    `  Demo mode          ${onOff(isDemoMode(), isDemoMode() && demoResetIntervalHours() ? `reset every ${demoResetIntervalHours()} h` : "")}`,
    `  Google sign-in     ${onOff(isGoogleLoginConfigured())}`,
    `  VNPay              ${onOff(!vnpayMissing, vnpayMissing)}`,
    `    pay URL          ${safeUrl(vnpay.payUrl)}`,
    `    return URL       ${safeUrl(vnpay.returnUrl)}`,
    `  MoMo               ${onOff(isMomoEnabled() && !momoMissing, isMomoEnabled() ? momoMissing : "MOMO_ENABLED is not true")}`,
    ...(isMomoEnabled()
      ? [
          `    return URL       ${safeUrl(momo.redirectUrl)}`,
          `    IPN URL          ${safeUrl(momo.ipnUrl)}`,
        ]
      : []),
    `  Secrets            ${SECRET_VARIABLES.map(presence).join("  ")}`,
  ];
}

module.exports = { describeConfig, SECRET_VARIABLES };
