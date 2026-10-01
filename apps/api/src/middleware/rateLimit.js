const { rateLimit } = require("express-rate-limit");

const commonOptions = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { message: "Too many requests. Please try again later." },
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

const forgotPasswordRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5,
});

const resetPasswordRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  limit: 10,
});

const uploadRateLimit = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  limit: 30,
});

module.exports = {
  apiRateLimit,
  forgotPasswordRateLimit,
  loginRateLimit,
  registerRateLimit,
  resetPasswordRateLimit,
  uploadRateLimit,
};
