require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const { AUTH_COOKIE_NAME } = require("./src/services/authSession");
const { allowedOrigins } = require("./src/services/allowedOrigins");
const { globalErrorHandler } = require("./src/middleware/errorHandler");
const { initSocket } = require("./src/services/socket");
const { apiRateLimit } = require("./src/middleware/rateLimit");
const { getEnvProblems } = require("./src/config/env");
const { describeConfig } = require("./src/config/summary");
const pool = require("./src/db/db");
const { runBookingMaintenance } = require("./src/controller/bookingController");

const app = express();

const PORT = process.env.PORT || 3001;

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.replace(/\/$/, "");

    if (
      allowedOrigins.has(normalizedOrigin)
    ) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  optionsSuccessStatus: 204,
  // Content-Disposition isn't on the browser's default CORS-safelisted
  // response headers, so without this, frontend JS can't read the
  // server-suggested filename on a cross-origin download (e.g. the
  // dashboard export) — it silently falls back to a generic name instead.
  // The rate limit headers likewise: the "send again" button after a
  // password reset email counts down from them.
  exposedHeaders: ["Content-Disposition", "RateLimit", "RateLimit-Policy", "Retry-After"],
};

const userRoutes = require("./src/routes/userRoutes");
const authRoutes = require("./src/routes/auth");
const bookingRoutes = require("./src/routes/bookings");
const dashboardRoutes = require("./src/routes/dashboardRoutes");
const roomRoutes = require("./src/routes/roomRoutes");
const paymentRoutes = require("./src/routes/payments");
const reviewRoutes = require("./src/routes/reviews");
const couponRoutes = require("./src/routes/coupons");
const settingsRoutes = require("./src/routes/settings");
const destinationRoutes = require("./src/routes/destinations");

// Only trust X-Forwarded-* when the app really sits behind that many reverse
// proxies (e.g. 1 on Render or behind the bundled nginx). Trusting it without
// a proxy would let any client spoof its IP and dodge the rate limits.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS) || 0);
app.use(
  helmet({
    // Uploaded room photos and avatars are loaded by the web app from another
    // origin in development and split deployments.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // helmet's default (same-origin) would cut the page off from the Google
    // sign-in popup wherever an API response ends up as the page's policy;
    // this is the value the web server sends (nginx.conf, vercel.json).
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  })
);
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const usesAuthCookie = String(req.headers.cookie || "")
    .split(";")
    .some((item) => item.trim().startsWith(`${AUTH_COOKIE_NAME}=`));
  const origin = req.headers.origin?.replace(/\/$/, "");

  if (unsafeMethod && usesAuthCookie && origin && !allowedOrigins.has(origin)) {
    return res.status(403).json({ message: "Request origin is not allowed" });
  }

  return next();
});
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.use("/api", apiRateLimit);
app.use("/api", authRoutes);
app.use("/api", userRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/destinations", destinationRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "API không tồn tại",
  });
});

app.use(globalErrorHandler);

async function start() {
  const problems = getEnvProblems();
  if (problems.length > 0) {
    console.error("Cannot start: invalid configuration (see apps/api/.env.example)");
    problems.forEach((problem) => console.error(`  - ${problem}`));
    process.exit(1);
  }

  // What was actually loaded, so a wrong .env file or an overridden value is
  // visible at a glance. Secrets are reported as set/empty only.
  describeConfig().forEach((line) => console.log(line));

  try {
    await pool.query("SELECT 1");
  } catch (err) {
    console.error("Cannot start: database is unreachable:", err.message);
    process.exit(1);
  }

  const httpServer = app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
  initSocket(httpServer);
  startBookingMaintenanceJob();
  startDemoResetJob();
}

// DEMO_MODE with DEMO_RESET_INTERVAL_HOURS: put the sample data back on a
// timer (otherwise schedule `npm run demo:reset`).
function startDemoResetJob() {
  const { demoResetIntervalHours, isDemoMode } = require("./src/config/demo");
  const hours = demoResetIntervalHours();
  if (!isDemoMode() || !hours) return;

  const { resetDemo } = require("./src/scripts/demo-reset");
  setInterval(() => {
    resetDemo(pool).catch((err) => console.error("DEMO RESET FAILED:", err.message));
  }, hours * 60 * 60 * 1000).unref();
}

const BOOKING_MAINTENANCE_INTERVAL_MS = 60 * 1000;

// Expires unpaid bookings and completes finished stays on a timer, so state
// moves on even when nobody is using the site.
function startBookingMaintenanceJob() {
  const tick = () =>
    runBookingMaintenance({ force: true }).catch((err) =>
      console.error("BOOKING MAINTENANCE ERROR:", err.message)
    );

  tick();
  setInterval(tick, BOOKING_MAINTENANCE_INTERVAL_MS).unref();
}

if (require.main === module) {
  start();
}

module.exports = app;
