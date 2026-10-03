// Dashboard charts on real PostgreSQL: bookings land in the hour/day of the
// property's timezone (APP_TIMEZONE), whatever timezone the database session
// uses, and every range selector returns its buckets.
//
// Run with `npm run test:integration` from the repository root.

process.env.TZ = "UTC";
process.env.NODE_ENV = "test";
process.env.APP_TIMEZONE = "Asia/Ho_Chi_Minh";
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
const app = require("../server");

let server;
let baseUrl;
let cookie;

const hourIn = (timezone, date) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(date));

describe("dashboard in the property's timezone", () => {
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
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("puts a booking made now in the current hour at the property", async () => {
    // A database session in another timezone writes created_at in that zone.
    const client = await pool.connect();
    try {
      await client.query("SET TIME ZONE 'America/New_York'");
      await client.query(
        `INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, payment_status, created_at)
         VALUES (2, 1, CURRENT_DATE + 400, CURRENT_DATE + 401, 1000000, 1, 'confirmed', 'paid', CURRENT_TIMESTAMP)`
      );
      await client.query("RESET TIME ZONE");
    } finally {
      client.release();
    }
    // Read back through connections whose session zone is New York too, so
    // the conversion has to use the session setting, not assume UTC.
    await pool.query("ALTER DATABASE luxestay_test SET timezone TO 'America/New_York'");
    try {
      const fresh = new (require("pg").Pool)({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        user: "luxestay",
        password: "luxestay",
        database: "luxestay_test",
      });
      const zone = (await fresh.query("SHOW TimeZone")).rows[0].TimeZone;
      await fresh.end();
      assert.equal(zone, "America/New_York");

      // The API's own pool may hold connections opened before the change;
      // what matters is that each converts with its own session zone.
      const response = await fetch(`${baseUrl}/api/dashboard/analytics?range=today`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200);
      const body = await response.json();
      const hour = hourIn("Asia/Ho_Chi_Minh", new Date());
      assert.equal(body.bookingsByMonth.length, 24);
      // A second either side of an hour boundary would move it; allow that.
      const counted = [hour, (hour + 23) % 24].reduce((sum, h) => sum + body.bookingsByMonth[h].bookings, 0);
      assert.ok(counted >= 1, `expected the booking in hour ${hour}: ${JSON.stringify(body.bookingsByMonth.filter((b) => b.bookings))}`);
    } finally {
      await pool.query("ALTER DATABASE luxestay_test RESET timezone");
    }
  });

  it("answers every range of the selector with the right number of buckets", async () => {
    const expected = { today: 24, week: 7, year: 12 };
    for (const range of ["today", "week", "month", "year"]) {
      const response = await fetch(`${baseUrl}/api/dashboard/analytics?range=${range}`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200, range);
      const body = await response.json();
      assert.equal(body.range, range);
      if (expected[range]) assert.equal(body.bookingsByMonth.length, expected[range], range);
      else assert.ok([28, 29, 30, 31].includes(body.bookingsByMonth.length), range);

      const stats = await fetch(`${baseUrl}/api/dashboard/stats?range=${range}`, { headers: { Cookie: cookie } });
      assert.equal(stats.status, 200, `stats ${range}`);
      assert.equal((await stats.json()).range, range);
    }
  });
});
