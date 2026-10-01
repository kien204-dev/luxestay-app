// Shared by the REST CORS config (server.js) and the Socket.io CORS config
// (services/socket.js) so the two never drift out of sync.

const DEFAULT_WEB_URL = "http://localhost:5173";

function normalizeOrigin(origin) {
  return origin.trim().replace(/\/+$/, "");
}

// "https://a.example, https://b.example/" -> ["https://a.example", "https://b.example"]
function parseOriginList(value) {
  return String(value || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

// Every origin the web app may be opened from:
//   CLIENT_URL / FRONTEND_URL  the main address (Docker sets both from PUBLIC_URL)
//   ALLOWED_ORIGINS            extra addresses, comma separated (a tunnel, a
//                              second domain, localhost next to a public one)
function buildAllowedOrigins(env = process.env) {
  return new Set([
    ...parseOriginList(env.CLIENT_URL),
    ...parseOriginList(env.FRONTEND_URL),
    ...parseOriginList(env.ALLOWED_ORIGINS),
    ...(env.NODE_ENV !== "production" ? [DEFAULT_WEB_URL] : []),
  ]);
}

// The address links are built with (password reset emails, the page a
// payment gateway sends the guest back to).
function getPublicWebUrl(env = process.env) {
  return parseOriginList(env.FRONTEND_URL)[0] || parseOriginList(env.CLIENT_URL)[0] || DEFAULT_WEB_URL;
}

const allowedOrigins = buildAllowedOrigins();

module.exports = { allowedOrigins, buildAllowedOrigins, getPublicWebUrl, parseOriginList };
