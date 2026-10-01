// Drops everything in the public schema, then re-runs migrations and seed.
// Meant for local development and demo resets, so it refuses to touch a
// database that does not look local unless explicitly allowed.
//
// Usage: npm run db:reset

require("dotenv").config({ quiet: true });

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "db", "postgres"]);

function assertResetAllowed() {
  if (process.env.ALLOW_DB_RESET === "true") return;

  const host = process.env.DB_HOST || "localhost";
  if (process.env.NODE_ENV === "production" || !LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to reset database on host "${host}". ` +
        "Set ALLOW_DB_RESET=true if you really want to wipe it."
    );
  }
}

async function reset(pool, options = {}) {
  const { migrate } = require("./migrate");
  const { seed } = require("./seed");

  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await migrate(pool, options);
  await seed(pool, options);
}

module.exports = { reset, assertResetAllowed };

if (require.main === module) {
  try {
    assertResetAllowed();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const pool = require("./db");
  reset(pool)
    .then(() => pool.end())
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
