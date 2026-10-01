// Applies every SQL file in ./migrations in filename order, once each.
// Applied files are recorded in schema_migrations, so re-running is a no-op.
//
// Usage: npm run db:migrate

const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

async function migrate(pool, { log = console.log } = {}) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       filename TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );

  const applied = new Set(
    (await pool.query("SELECT filename FROM schema_migrations")).rows.map((row) => row.filename)
  );
  const pending = listMigrationFiles().filter((file) => !applied.has(file));

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      log(`  applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      err.message = `Migration ${file} failed: ${err.message}`;
      throw err;
    } finally {
      client.release();
    }
  }

  log(pending.length ? `Migrations applied: ${pending.length}` : "Database is up to date");
  return pending;
}

module.exports = { migrate, listMigrationFiles };

if (require.main === module) {
  const pool = require("./db");
  migrate(pool)
    .then(() => pool.end())
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
