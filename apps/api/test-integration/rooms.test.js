// What the room list and room page read, on real PostgreSQL: the filters the
// list offers, filtering by room type and price, a room's amenities, and the
// spread of its review scores.
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
const app = require("../server");

let server;
let baseUrl;
let adminCookie;

async function api(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

describe("room list filters and room details", () => {
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
    assert.equal(login.status, 200);
    adminCookie = login.headers.get("set-cookie").split(";", 1)[0];
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("offers the room types and price range of the rooms a guest can book", async () => {
    const { status, body } = await api("/api/rooms/filters");
    assert.equal(status, 200);

    const expected = await pool.query(
      `SELECT room_type AS type, COUNT(*)::int AS count, MIN(price) AS min, MAX(price) AS max
       FROM rooms WHERE status != 'maintenance' GROUP BY room_type`
    );
    assert.equal(body.types.length, expected.rows.length);
    for (const row of expected.rows) {
      assert.equal(body.types.find((item) => item.type === row.type)?.count, row.count, row.type);
    }
    assert.equal(body.minPrice, Math.min(...expected.rows.map((row) => Number(row.min))));
    assert.equal(body.maxPrice, Math.max(...expected.rows.map((row) => Number(row.max))));

    // A room under maintenance is not on offer, so it does not count.
    const [first] = body.types;
    await pool.query("UPDATE rooms SET status = 'maintenance' WHERE id = (SELECT id FROM rooms WHERE room_type = $1 LIMIT 1)", [first.type]);
    const after = (await api("/api/rooms/filters")).body;
    assert.equal(after.types.find((item) => item.type === first.type).count, first.count - 1);
  });

  it("filters the list by room type and by price, together with paging", async () => {
    const filters = (await api("/api/rooms/filters")).body;
    const { type, count } = filters.types[0];

    const byType = await api(`/api/rooms?bookable=true&limit=100&roomType=${encodeURIComponent(type.toUpperCase())}`);
    assert.equal(byType.body.pagination.total, count);
    assert.ok(byType.body.data.every((room) => room.room_type === type));

    const middle = Math.round((filters.minPrice + filters.maxPrice) / 2);
    const cheap = await api(`/api/rooms?bookable=true&limit=100&roomType=${encodeURIComponent(type)}&maxPrice=${middle}`);
    assert.ok(cheap.body.data.every((room) => room.room_type === type && Number(room.price) <= middle));
    assert.ok(cheap.body.pagination.total <= count);

    const none = await api("/api/rooms?bookable=true&roomType=No%20such%20type");
    assert.equal(none.body.pagination.total, 0);
    assert.deepEqual(none.body.data, []);
  });

  it("stores a room's amenities and returns them with the room", async () => {
    const room = (await api("/api/rooms?limit=1&sortBy=created_at")).body.data[0];
    const details = { room_name: room.room_name, room_type: room.room_type, price: room.price, capacity: room.capacity, location: room.location, description: room.description, image: room.image };

    // None listed until the admin lists some.
    assert.deepEqual((await api(`/api/rooms/${room.id}`)).body.amenities, []);

    const saved = await api(`/api/rooms/${room.id}`, {
      method: "PUT",
      cookie: adminCookie,
      body: { ...details, amenities: [" Wi-Fi ", "", "Ban công", "Wi-Fi"] },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual((await api(`/api/rooms/${room.id}`)).body.amenities, ["Wi-Fi", "Ban công"]);

    for (const amenities of ["Wi-Fi", [42], ["x".repeat(61)], Array.from({ length: 31 }, (_, i) => `Amenity ${i}`)]) {
      const invalid = await api(`/api/rooms/${room.id}`, { method: "PUT", cookie: adminCookie, body: { ...details, amenities } });
      assert.equal(invalid.status, 400, JSON.stringify(amenities).slice(0, 40));
    }

    // Saving the room without the field clears the list.
    await api(`/api/rooms/${room.id}`, { method: "PUT", cookie: adminCookie, body: details });
    assert.deepEqual((await api(`/api/rooms/${room.id}`)).body.amenities, []);
  });

  it("reports how many visible reviews gave each number of stars", async () => {
    const roomId = (await pool.query("SELECT id FROM rooms ORDER BY id OFFSET 5 LIMIT 1")).rows[0].id;
    assert.deepEqual((await api(`/api/rooms/${roomId}/reviews`)).body.ratingCounts, { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });

    for (const [index, [rating, hidden]] of [[5, false], [5, false], [3, false], [1, true]].entries()) {
      await pool.query(
        `WITH stay AS (
           INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, payment_status)
           SELECT u.id, $1, CURRENT_DATE - ($2::int * 10 + 12), CURRENT_DATE - ($2::int * 10 + 10), 100, 1, 'completed', 'paid'
           FROM users u WHERE u.email = 'user@example.com'
           RETURNING id, user_id
         )
         INSERT INTO room_reviews (room_id, user_id, booking_id, rating, is_hidden)
         SELECT $1, user_id, id, $3, $4 FROM stay`,
        [roomId, index, rating, hidden]
      );
    }

    const { body } = await api(`/api/rooms/${roomId}/reviews`);
    assert.deepEqual(body.ratingCounts, { 5: 2, 4: 0, 3: 1, 2: 0, 1: 0 });
    assert.equal(body.totalReviews, 3);
  });
});
