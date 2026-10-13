const { rateLimit } = require("express-rate-limit");
const { apiMessage } = require("../utils/apiMessages");

const commonOptions = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: apiMessage("TOO_MANY_REQUESTS"),
};

// Payment gateways call the IPN endpoints from their own servers; throttling
// those would make a gateway retry or drop a payment confirmation.
const IPN_PATHS = new Set(["/payments/vnpay/ipn", "/payments/momo/ipn"]);

// Broad ceiling for the whole API. The tighter per-route limits (login,
// register, password reset) still apply on top of it.
const apiRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 300,
  skip: (req) => process.env.NODE_ENV === "test" || IPN_PATHS.has(req.path),
});

const loginRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000,
  limit: 10,
});

const registerRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  limit: 20,
});

// Published to the web app (config/auth.js), whose "send again" button
// follows it.
const FORGOT_PASSWORD_LIMIT = { limit: 5, windowMinutes: 60 };

const forgotPasswordRateLimit = rateLimit({
  ...commonOptions,
  windowMs: FORGOT_PASSWORD_LIMIT.windowMinutes * 60 * 1000,
  limit: FORGOT_PASSWORD_LIMIT.limit,
});

const resetPasswordRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  limit: 10,
});

// Opening a reset link checks it first (see routes/auth.js).
const resetCheckRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  limit: 30,
});

// Requests that check the current password (changing it, or the email):
// limited like the login form, so My account cannot be used to guess it.
// Saves that do not send a password are not counted.
const passwordCheckRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip: (req) => process.env.NODE_ENV === "test" || !req.body?.currentPassword,
});

const uploadRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  limit: 30,
});

module.exports = {
  apiRateLimit,
  FORGOT_PASSWORD_LIMIT,
  forgotPasswordRateLimit,
  loginRateLimit,
  passwordCheckRateLimit,
  registerRateLimit,
  resetCheckRateLimit,
  resetPasswordRateLimit,
  uploadRateLimit,
};
