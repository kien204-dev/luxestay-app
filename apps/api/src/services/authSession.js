const jwt = require("jsonwebtoken");

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "luxestay_session";
const AUTH_TOKEN_TTL = process.env.AUTH_TOKEN_TTL || "1d";
const AUTH_COOKIE_MAX_AGE_MS = Number(process.env.AUTH_COOKIE_MAX_AGE_MS) || 24 * 60 * 60 * 1000;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function cookieSecure() {
  if (process.env.AUTH_COOKIE_SECURE !== undefined) {
    return process.env.AUTH_COOKIE_SECURE === "true";
  }
  return isProduction();
}

function cookieSameSite() {
  const configured = process.env.AUTH_COOKIE_SAME_SITE;
  const value = configured || (isProduction() ? "none" : "lax");
  return ["lax", "strict", "none"].includes(value) ? value : "lax";
}

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: cookieSameSite(),
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  };
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;

  const match = header
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function signAuthToken(user) {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required");

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: Number(user.token_version) || 0,
    },
    process.env.JWT_SECRET,
    { algorithm: "HS256", expiresIn: AUTH_TOKEN_TTL }
  );
}

function setAuthCookie(res, user) {
  res.cookie(AUTH_COOKIE_NAME, signAuthToken(user), getAuthCookieOptions());
}

function clearAuthCookie(res) {
  const { maxAge: _maxAge, ...options } = getAuthCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAME, options);
}

function readAuthToken(req) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string") {
    const [scheme, token] = authHeader.split(" ");
    if (scheme === "Bearer" && token) return { token, source: "bearer" };
  }

  const cookieToken = readCookie(req, AUTH_COOKIE_NAME);
  return cookieToken ? { token: cookieToken, source: "cookie" } : null;
}

module.exports = {
  AUTH_COOKIE_NAME,
  clearAuthCookie,
  getAuthCookieOptions,
  readAuthToken,
  setAuthCookie,
  signAuthToken,
};
