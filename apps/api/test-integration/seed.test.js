// What the seed may and may not do when it runs on every start
// (SEED_ON_START), on real PostgreSQL.
//
// Run with `npm run test:integration` from the repository root.

process.env.TZ = "UTC";
process.env.NODE_ENV = "test";
process.env.DB_HOST = process.env.TEST_DB_HOST || "127.0.0.1";
process.env.DB_PORT = process.env.TEST_DB_PORT || "54330";
process.env.DB_USER = "luxestay";
process.env.DB_PASSWORD = "luxestay";
process.env.DB_NAME = "luxestay_test";
process.env.DB_SSL = "false";
process.env.STORAGE_DRIVER = "local";

const assert = require("node:assert/strict");
const { after, afterEach, beforeEach, describe, it } = require("node:test");
const bcrypt = require("bcryptjs");

const pool = require("../src/db/db");
const { migrate } = require("../src/db/migrate");
const { seed, DEFAULT_ADMIN_PASSWORD, DEFAULT_USER_PASSWORD } = require("../src/db/seed");

const SEED_VARIABLES = ["NODE_ENV", "DEMO_MODE", "SEED_ADMIN_EMAIL", "SEED_ADMIN_PASSWORD"];

async function emptyDatabase() {
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await migrate(pool, { log: () => {} });
}

// Runs the seed the way the container does on start and returns its log.
async function runSeed(options = {}) {
  const lines = [];
  await seed(pool, { log: (line) => lines.push(line), ...options });
  return lines.join("\n");
}

async function count(table, where = "TRUE") {
  return (await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`)).rows[0].n;
}

async function admins() {
  return (await pool.query("SELECT * FROM users WHERE role = 'admin' ORDER BY id")).rows;
}

describe("seed on start", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    for (const name of SEED_VARIABLES.slice(1)) delete process.env[name];
    await emptyDatabase();
  });

  afterEach(() => {
    process.env.NODE_ENV = "test";
  });

  after(async () => {
    await pool.end();
  });

  describe("the first admin", () => {
    it("is created with the sample data in an empty database", async () => {
      const log = await runSeed();

      const [admin, ...others] = await admins();
      assert.equal(others.length, 0);
      assert.equal(admin.email, "admin@example.com");
      assert.equal(admin.must_change_password, true, "the public default has to be replaced");
      assert.ok(await bcrypt.compare(DEFAULT_ADMIN_PASSWORD, admin.password));
      assert.match(log, /created admin: admin@example\.com/);
      assert.ok((await count("rooms")) > 0);
      assert.equal(await count("bookings"), 3);
    });

    it("is not created again after the admin changed their email", async () => {
      await runSeed();
      await pool.query("UPDATE users SET email = 'owner@hotel.test' WHERE role = 'admin'");

      const log = await runSeed();

      assert.deepEqual((await admins()).map((admin) => admin.email), ["owner@hotel.test"]);
      assert.equal(await count("users"), 2);
      assert.doesNotMatch(log, /created admin/);
      assert.ok(!log.includes(DEFAULT_ADMIN_PASSWORD));
    });

    it("is not created while another admin exists, even a locked one", async () => {
      await pool.query(
        "INSERT INTO users (name, email, password, role, is_locked) VALUES ('Owner', 'owner@hotel.test', 'x', 'admin', TRUE)"
      );

      await runSeed();

      assert.deepEqual((await admins()).map((admin) => admin.email), ["owner@hotel.test"]);
    });

    it("is created when the only admin left is a deleted one", async () => {
      await pool.query(
        "INSERT INTO users (name, email, password, role, deleted_at) VALUES ('Gone', 'gone@hotel.test', 'x', 'admin', NOW())"
      );

      await runSeed();

      assert.deepEqual(
        (await admins()).filter((admin) => !admin.deleted_at).map((admin) => admin.email),
        ["admin@example.com"]
      );
    });

    it("leaves another account that holds the admin email alone, and says so", async () => {
      await pool.query(
        "INSERT INTO users (name, email, password, role) VALUES ('Guest', 'Admin@Example.com', 'x', 'user')"
      );

      const log = await runSeed();

      assert.equal((await admins()).length, 0);
      assert.equal(await count("users"), 1);
      assert.match(log, /WARNING: there is no admin/);
    });

    it("uses SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD without logging the password", async () => {
      process.env.SEED_ADMIN_EMAIL = "Owner@Hotel.test";
      process.env.SEED_ADMIN_PASSWORD = "Chosen-Passw0rd";

      const log = await runSeed();

      const [admin] = await admins();
      assert.equal(admin.email, "owner@hotel.test");
      assert.equal(admin.must_change_password, false);
      assert.ok(await bcrypt.compare("Chosen-Passw0rd", admin.password));
      assert.ok(!log.includes("Chosen-Passw0rd"));
    });
  });

  describe("in production", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });

    it("gives the admin a random password and shows it exactly once", async () => {
      const log = await runSeed();

      const [admin] = await admins();
      const generated = log.match(/generated admin password, shown only this once.*: (\S+)$/m)?.[1];
      assert.ok(generated, "the generated password is in the first log");
      assert.ok(generated.length >= 20);
      assert.ok(await bcrypt.compare(generated, admin.password));
      assert.equal(await bcrypt.compare(DEFAULT_ADMIN_PASSWORD, admin.password), false);
      assert.equal(admin.must_change_password, true);
      assert.equal(log.split(generated).length - 1, 1);

      // Every later start: same admin, same password, nothing about it in the log.
      const later = await runSeed();
      assert.equal((await admins()).length, 1);
      assert.ok(await bcrypt.compare(generated, (await admins())[0].password));
      assert.ok(!later.includes(generated));
      assert.doesNotMatch(later, /password/i);
    });

    it("gives the sample guest a random password too, shown once", async () => {
      const log = await runSeed();

      const guest = (await pool.query("SELECT * FROM users WHERE email = 'user@example.com'")).rows[0];
      const generated = log.match(/generated sample guest password, shown only this once.*: (\S+)$/m)?.[1];
      assert.ok(generated, "the generated password is in the first log");
      assert.ok(await bcrypt.compare(generated, guest.password));
      assert.equal(await bcrypt.compare(DEFAULT_USER_PASSWORD, guest.password), false);
      assert.equal(guest.must_change_password, true);
      assert.ok(!log.includes(DEFAULT_USER_PASSWORD));
      assert.notEqual(generated, log.match(/generated admin password.*: (\S+)$/m)[1]);
    });

    it("never logs a password it was given, nor the sample ones", async () => {
      process.env.SEED_ADMIN_PASSWORD = "Chosen-Passw0rd";

      const log = await runSeed();

      assert.ok(await bcrypt.compare("Chosen-Passw0rd", (await admins())[0].password));
      for (const secret of ["Chosen-Passw0rd", DEFAULT_ADMIN_PASSWORD, DEFAULT_USER_PASSWORD]) {
        assert.ok(!log.includes(secret), `${secret} is not in the log`);
      }
    });

    it("does not bring back the default admin after the email changed", async () => {
      await runSeed();
      await pool.query("UPDATE users SET email = 'owner@hotel.test' WHERE role = 'admin'");

      const log = await runSeed();

      assert.deepEqual((await admins()).map((admin) => admin.email), ["owner@hotel.test"]);
      assert.doesNotMatch(log, /created admin|password/i);
    });

    it("keeps the public sample password for a demo, without logging it", async () => {
      process.env.DEMO_MODE = "true";

      const log = await runSeed();

      const [admin] = await admins();
      const guest = (await pool.query("SELECT * FROM users WHERE email = 'user@example.com'")).rows[0];
      assert.ok(await bcrypt.compare(DEFAULT_ADMIN_PASSWORD, admin.password));
      assert.ok(await bcrypt.compare(DEFAULT_USER_PASSWORD, guest.password));
      assert.equal(admin.must_change_password, false);
      assert.equal(guest.must_change_password, false);
      assert.ok(!log.includes(DEFAULT_ADMIN_PASSWORD));
      assert.ok(!log.includes(DEFAULT_USER_PASSWORD));
    });
  });

  describe("sample data", () => {
    // What an owner does to turn the sample install into their own site.
    async function clearSampleData() {
      await pool.query("DELETE FROM room_reviews");
      await pool.query("DELETE FROM bookings");
      await pool.query("DELETE FROM room_images");
      await pool.query("DELETE FROM rooms");
      await pool.query("DELETE FROM coupons");
      await pool.query("DELETE FROM destination_images");
      await pool.query("DELETE FROM users WHERE role = 'user'");
    }

    async function assertNoSampleData() {
      for (const table of ["rooms", "bookings", "coupons", "destination_images", "room_reviews"]) {
        assert.equal(await count(table), 0, table);
      }
      assert.equal(await count("users", "role = 'user'"), 0, "sample guest");
    }

    it("does not come back on a later start once it was removed", async () => {
      await runSeed();
      await clearSampleData();

      const log = await runSeed();

      await assertNoSampleData();
      assert.match(log, /sample data: skipped/);
    });

    it("is not added to a database that already holds the owner's data", async () => {
      await pool.query("INSERT INTO users (name, email, password, role) VALUES ('Owner', 'owner@hotel.test', 'x', 'admin')");

      await runSeed();

      await assertNoSampleData();
      assert.equal(await count("users"), 1);
    });

    it("leaves edited rooms, photos and bookings as they are", async () => {
      await runSeed();
      const rooms = await count("rooms");
      await pool.query("UPDATE rooms SET image = NULL, room_name = 'Phòng của tôi' WHERE id = 1");
      await pool.query("DELETE FROM room_images WHERE room_id = 1");
      await pool.query("DELETE FROM room_reviews");
      await pool.query("DELETE FROM bookings");

      await runSeed();

      assert.equal(await count("rooms"), rooms);
      assert.equal(await count("bookings"), 0);
      assert.equal((await pool.query("SELECT image FROM rooms WHERE id = 1")).rows[0].image, null);
    });

    it("is put back on every start with DEMO_MODE", async () => {
      await runSeed();
      const rooms = await count("rooms");
      await clearSampleData();
      process.env.DEMO_MODE = "true";

      await runSeed();

      assert.equal(await count("rooms"), rooms);
      // Two more finished stays than usual, for the demo's sample reviews.
      assert.equal(await count("bookings"), 5);
      assert.equal(await count("coupons"), 1);
      assert.equal((await admins()).length, 1);
    });

    it("has no reviews: a site's score comes from its own guests", async () => {
      await runSeed();

      assert.equal(await count("bookings"), 3);
      assert.equal(await count("bookings", "status = 'completed'"), 1);
      assert.equal(await count("room_reviews"), 0);
    });

    it("has three sample reviews on a demo, each for a finished sample stay", async () => {
      process.env.DEMO_MODE = "true";

      await runSeed();

      assert.equal(await count("room_reviews"), 3);
      const orphans = await pool.query(
        `SELECT 1 FROM room_reviews rv JOIN bookings b ON b.id = rv.booking_id
         WHERE b.status <> 'completed' OR b.room_id <> rv.room_id`
      );
      assert.equal(orphans.rows.length, 0);
    });

    it("is added to a database in use only when asked for (--force)", async () => {
      await runSeed();
      const rooms = await count("rooms");
      await clearSampleData();

      await runSeed({ sampleData: "always" });

      assert.equal(await count("rooms"), rooms);
      assert.equal(await count("users", "role = 'user'"), 1);
      assert.equal((await admins()).length, 1);
    });

    it("is left out with --admin-only", async () => {
      await runSeed({ sampleData: "never" });

      assert.equal((await admins()).length, 1);
      await assertNoSampleData();
    });
  });
});
