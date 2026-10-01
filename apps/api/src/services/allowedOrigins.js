// Shared by the REST CORS config (server.js) and the Socket.io CORS config
// (services/socket.js) so the two never drift out of sync.
const allowedOrigins = new Set(
  [
    process.env.CLIENT_URL,
    process.env.FRONTEND_URL,
    process.env.NODE_ENV !== "production" ? "http://localhost:5173" : null,
  ]
    .filter(Boolean)
    .map((origin) => origin.replace(/\/$/, ""))
);

module.exports = { allowedOrigins };
