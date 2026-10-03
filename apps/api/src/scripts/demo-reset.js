// Puts a demo install back to its sample data: drops and recreates every
// table, re-seeds, and deletes uploaded images (the bundled seed-* copies
// stay). Only runs with DEMO_MODE=true.
//
//   npm run demo:reset
//   docker compose exec api npm run demo:reset
//
// Run it on a schedule (cron, Windows Task Scheduler), or set
// DEMO_RESET_INTERVAL_HOURS and the API does it itself.

const fs = require("fs");
const path = require("path");
const { isDemoMode } = require("../config/demo");
const { FOLDERS, UPLOADS_ROOT, getDriver } = require("../services/storage");

function clearUploads() {
  if (getDriver() !== "local") return 0;
  let removed = 0;
  for (const folder of FOLDERS) {
    const dir = path.join(UPLOADS_ROOT, folder);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.startsWith("seed-")) continue;
      fs.rmSync(path.join(dir, file), { force: true });
      removed++;
    }
  }
  return removed;
}

async function resetDemo(pool, { log = console.log } = {}) {
  if (!isDemoMode()) throw new Error("demo:reset only runs with DEMO_MODE=true");
  const { reset } = require("../db/reset");
  const started = Date.now();
  await reset(pool, { log: () => {} });
  const removed = clearUploads();
  log(`Demo data reset in ${Date.now() - started} ms (${removed} uploaded file(s) removed)`);
}

module.exports = { resetDemo };

if (require.main === module) {
  require("dotenv").config({ quiet: true });
  const pool = require("../db/db");
  resetDemo(pool)
    .then(() => pool.end())
    .catch((err) => {
      console.error("DEMO RESET FAILED:", err.message);
      process.exit(1);
    });
}
