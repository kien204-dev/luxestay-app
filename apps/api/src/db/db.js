require("dotenv").config({ quiet: true });

const { Pool, types } = require("pg");

// node-postgres parses SQL DATE columns (OID 1082 — e.g. bookings.check_in/
// check_out) into a JS Date object built from *local* timezone components.
// That Date's internal UTC instant then depends on the server's local
// timezone, so anything that later reads it via toISOString()/JSON
// serialization, or via UTC getters, can land on the wrong calendar day —
// this bit a real feature (the admin calendar showed bookings on the wrong
// dates) before being traced back here. check_in/check_out are pure
// calendar dates with no time-of-day meaning, so keep them as the plain
// "YYYY-MM-DD" string Postgres sends, with no implicit timezone conversion
// anywhere downstream.
types.setTypeParser(1082, (value) => value);

// DB_SSL: "true" verifies the server certificate, "no-verify" encrypts
// without verifying it (self-signed setups), "false" disables TLS. Unset, it
// is on for Neon hosts (which require TLS) and off otherwise.
function getSslConfig() {
  const mode = (process.env.DB_SSL || "").toLowerCase();
  const isNeon = (process.env.DB_HOST || "").includes("neon.tech");

  if (mode === "no-verify") return { rejectUnauthorized: false };
  if (mode === "true" || (mode === "" && isNeon)) return { rejectUnauthorized: true };
  return false;
}

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: getSslConfig(),
});

// Idle pooled clients can be dropped by the server (e.g. Neon closing an
// idle connection during a long-running script). Without this listener, pg
// emits an unhandled 'error' event on the pool and crashes the process.
pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err.message);
});

module.exports = pool;
