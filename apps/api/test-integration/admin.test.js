// Admin lists and the demo reset on real PostgreSQL.
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
process.env.JWT_SECRET = require("node:crypto").randomBytes(32).toString("hex");
process.env.SEED_ADMIN_PASSWORD = "Admin-Integration-1";
process.env.SMTP_HOST = "";
process.env.STORAGE_DRIVER = "local";

const assert = require("node:assert/strict");
const { after, before, describe, it } = require("node:test");

const pool = require("../src/db/db");
const { reset } = require("../src/db/reset");
const { resetDemo } = require("../src/scripts/demo-reset");
const app = require("../server");

let server;
let baseUrl;
let cookie;

describe("admin lists and demo reset", () => {
  before(async () => {
    await reset(pool, { log: () => {} });
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "Admin-Integration-1" }),
    });
    cookie = login.headers.get("set-cookie").split(";", 1)[0];
  });

  after(async () => {
    delete process.env.DEMO_MODE;
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("pages and searches users in SQL, treating % and _ literally", async () => {
    for (let i = 0; i < 25; i++) {
      await pool.query(
        "INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', 'user')",
        [`Khách ${i}`, `guest${i}@example.com`]
      );
    }
    await pool.query("INSERT INTO users (name, email, password, role) VALUES ('Percent 100%', 'pct@example.com', 'x', 'user')");

    const get = async (query) => (await fetch(`${baseUrl}/api/users?${query}`, { headers: { Cookie: cookie } })).json();

    const first = await get("page=1&limit=10");
    assert.equal(first.data.length, 10);
    assert.equal(first.total, 28);
    assert.equal(first.totalPages, 3);
    assert.deepEqual(first.summary, { total: 28, admins: 1, users: 27, locked: 0 });

    const third = await get("page=3&limit=10");
    assert.equal(third.data.length, 8);

    const beyond = await get("page=9&limit=10");
    assert.equal(beyond.data.length, 0);
    assert.equal(beyond.total, 28);

    assert.equal((await get("page=1&limit=10&search=GUEST1")).total, 11); // guest1, guest10..19
    assert.deepEqual((await get("page=1&limit=10&search=100%25")).data.map((u) => u.email), ["pct@example.com"]);
    assert.equal((await get("page=1&limit=10&search=%25")).total, 1, "% is a character, not a wildcard");
    assert.equal((await get("page=1&limit=10&role=admin")).total, 1);
  });

  it("puts the sample data back with demo:reset", async () => {
    await assert.rejects(resetDemo(pool, { log: () => {} }), /DEMO_MODE/);

    process.env.DEMO_MODE = "true";
    await pool.query("UPDATE rooms SET room_name = 'Spoiled' WHERE id = 1");

    await resetDemo(pool, { log: () => {} });

    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM users")).rows[0].n, 2);
    assert.notEqual((await pool.query("SELECT room_name FROM rooms WHERE id = 1")).rows[0].room_name, "Spoiled");
    // A demo's sample data: five stays, three of them finished and reviewed.
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM bookings")).rows[0].n, 5);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS n FROM room_reviews")).rows[0].n, 3);
  });
});
