// Finds uploaded images that nothing refers to any more (a photo uploaded
// for a room that was never saved, an avatar that was never applied) and,
// with --delete, removes them.
//
//   npm run uploads:prune              list what would be removed
//   npm run uploads:prune -- --delete  remove it
//
// Only files older than a day are considered, so an upload someone is still
// in the middle of using is never touched. Local storage only: with
// STORAGE_DRIVER=s3, use the bucket's own lifecycle rules.

const fs = require("fs");
const path = require("path");

const MIN_AGE_MS = 24 * 60 * 60 * 1000;

// folder -> the queries whose results may point into it
const REFERENCES = {
  rooms: ["SELECT image AS ref FROM rooms WHERE image IS NOT NULL", "SELECT image_path AS ref FROM room_images"],
  avatars: ["SELECT avatar_url AS ref FROM users WHERE avatar_url IS NOT NULL"],
  branding: [
    "SELECT logo_url AS ref FROM property_settings WHERE logo_url IS NOT NULL",
    "SELECT hero_image_url AS ref FROM property_settings WHERE hero_image_url IS NOT NULL",
  ],
  destinations: ["SELECT image_url AS ref FROM destination_images"],
};

// File names in `folder` that the database still points at.
async function referencedFiles(pool, folder) {
  const names = new Set();
  const marker = `/uploads/${folder}/`;

  for (const sql of REFERENCES[folder]) {
    const result = await pool.query(sql);
    for (const { ref } of result.rows) {
      const at = String(ref).indexOf(marker);
      if (at !== -1) names.add(String(ref).slice(at + marker.length).split(/[?#]/)[0]);
    }
  }
  return names;
}

// Returns [{ folder, file, bytes }] for every orphan found; deletes them when
// asked to. `now` and `uploadsRoot` are parameters so this can be tested.
async function pruneUploads(pool, { uploadsRoot, remove = false, now = Date.now() }) {
  const orphans = [];

  for (const folder of Object.keys(REFERENCES)) {
    const dir = path.join(uploadsRoot, folder);
    if (!fs.existsSync(dir)) continue;

    const keep = await referencedFiles(pool, folder);

    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      if (!stat.isFile() || keep.has(file) || now - stat.mtimeMs < MIN_AGE_MS) continue;

      orphans.push({ folder, file, bytes: stat.size });
      if (remove) fs.unlinkSync(full);
    }
  }

  return orphans;
}

module.exports = { pruneUploads };

if (require.main === module) {
  require("dotenv").config({ quiet: true });
  const { getDriver, UPLOADS_ROOT } = require("../services/storage");

  if (getDriver() !== "local") {
    console.error("uploads:prune only works with local storage (STORAGE_DRIVER=local).");
    process.exit(1);
  }

  const pool = require("../db/db");
  const remove = process.argv.includes("--delete");

  pruneUploads(pool, { uploadsRoot: UPLOADS_ROOT, remove })
    .then((orphans) => {
      const megabytes = (orphans.reduce((sum, item) => sum + item.bytes, 0) / 1024 / 1024).toFixed(1);
      orphans.forEach((item) => console.log(`${remove ? "removed" : "orphan "}  ${item.folder}/${item.file}`));
      console.log(
        `${orphans.length} unreferenced file(s), ${megabytes} MB` +
          (remove || orphans.length === 0 ? "" : " — run again with --delete to remove them")
      );
      return pool.end();
    })
    .catch((err) => {
      console.error("PRUNE FAILED:", err.message);
      process.exit(1);
    });
}
