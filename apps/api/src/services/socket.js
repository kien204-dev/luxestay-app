const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const pool = require("../db/db.js");
const { AUTH_COOKIE_NAME } = require("./authSession.js");
const { allowedOrigins } = require("./allowedOrigins.js");

let io = null;

function parseCookieToken(cookieHeader, name) {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

// Mounted on the same HTTP server the Express app already listens on (not a
// separate port/process) — called once from server.js's real startup path,
// and once from the test harness right after its own app.listen(0, ...).
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        return callback(null, allowedOrigins.has(origin.replace(/\/$/, "")));
      },
      credentials: true,
    },
  });

  // Mirrors authMiddleware.verifyToken's checks (signature, revoked
  // token_version, locked/deleted account) — a socket connection doesn't get
  // to skip any of that just because it isn't a normal HTTP request.
  io.use(async (socket, next) => {
    try {
      const token = parseCookieToken(socket.handshake.headers.cookie, AUTH_COOKIE_NAME);
      if (!token) return next(new Error("unauthorized"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
      const userId = Number(decoded.id);
      if (!Number.isInteger(userId) || userId <= 0) return next(new Error("unauthorized"));

      const result = await pool.query(
        "SELECT id, role, token_version, deleted_at, is_locked FROM users WHERE id = $1",
        [userId]
      );
      const user = result.rows[0];
      if (!user || user.deleted_at || user.is_locked) return next(new Error("unauthorized"));

      const tokenVersion = Number(decoded.tokenVersion);
      const currentVersion = Number(user.token_version) || 0;
      if (!Number.isInteger(tokenVersion) || tokenVersion !== currentVersion) {
        return next(new Error("unauthorized"));
      }

      socket.data.userId = user.id;
      socket.data.role = user.role;
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    // Only admins join the room booking:created is broadcast to — a
    // regular guest connecting successfully (valid session) still never
    // receives admin-only booking events.
    if (socket.data.role === "admin") {
      socket.join("admins");
    }
  });

  return io;
}

// Called only after a booking's transaction has committed — never earlier —
// so admins are never notified about a booking that could still roll back.
function emitBookingCreated(booking) {
  if (!io) return;
  io.to("admins").emit("booking:created", booking);
}

function getIO() {
  return io;
}

module.exports = { initSocket, emitBookingCreated, getIO };
