const firebaseAdmin = require("../services/firebaseAdmin");
const { FORGOT_PASSWORD_LIMIT } = require("../middleware/rateLimit");
const { describePasswordRules } = require("../utils/password");

// How long a password reset link works (RESET_TOKEN_TTL_MINUTES, 15 by
// default).
function getResetTokenTtlMinutes() {
  const ttl = Number(process.env.RESET_TOKEN_TTL_MINUTES || 15);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 15;
}

// What the sign-in pages show, taken from what the API really does: whether
// Google sign-in is on, how long a reset link lasts, the password rule, and
// how many reset emails one visitor may ask for.
function publicAuthOptions() {
  return {
    googleLogin: firebaseAdmin.isGoogleLoginConfigured(),
    resetLinkMinutes: getResetTokenTtlMinutes(),
    passwordRules: describePasswordRules(),
    forgotPassword: { ...FORGOT_PASSWORD_LIMIT },
  };
}

module.exports = { getResetTokenTtlMinutes, publicAuthOptions };
