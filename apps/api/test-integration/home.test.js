// What the home page reads, on real PostgreSQL: the headline, amenities and
// nearby places an admin writes under "Cơ sở lưu trú", and the reviews the
// page quotes.
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

// A finished stay with its review, written straight to the tables: the rules
// for who may review are covered in booking.test.js.
async function addReview(index, { rating, comment = null, hidden = false }) {
  const review = await pool.query(
    `WITH guest AS (SELECT id FROM users WHERE email = 'user@example.com'),
          room AS (SELECT id, price FROM rooms ORDER BY id OFFSET $1::int LIMIT 1),
          stay AS (
            INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, payment_status)
            SELECT guest.id, room.id, CURRENT_DATE - 20, CURRENT_DATE - 18, room.price * 2, 2, 'completed', 'paid'
            FROM guest, room
            RETURNING id, user_id, room_id
          )
     INSERT INTO room_reviews (room_id, user_id, booking_id, rating, comment, is_hidden, created_at)
     SELECT room_id, user_id, id, $2, $3, $4, NOW() - make_interval(mins => $1::int) FROM stay
     RETURNING id`,
    [index, rating, comment, hidden]
  );
  return review.rows[0].id;
}

describe("home page content", () => {
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

  it("is empty on a fresh install, so the home page hides those sections", async () => {
    const settings = (await api("/api/settings/public")).body;
    assert.equal(settings.heroTitle, "");
    assert.equal(settings.heroSubtitle, "");
    assert.deepEqual(settings.amenities, []);
    assert.deepEqual(settings.nearbyPlaces, []);
  });

  it("stores the headline, amenities and nearby places an admin writes", async () => {
    const saved = await api("/api/settings", {
      method: "PUT",
      cookie: adminCookie,
      body: {
        heroTitle: "  A quiet house by the river  ",
        heroSubtitle: "Twelve rooms, five minutes from the old quarter.",
        amenities: [
          { name: " Breakfast ", description: "Served until 10:30" },
          { name: "", description: "" },
          { name: "Bicycles" },
        ],
        nearbyPlaces: [{ name: "Railway station", note: "By taxi", distance: "10 min" }],
      },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    try {
      const settings = (await api("/api/settings/public")).body;
      assert.equal(settings.heroTitle, "A quiet house by the river");
      assert.equal(settings.heroSubtitle, "Twelve rooms, five minutes from the old quarter.");
      // Trimmed, the blank row dropped, missing texts stored as empty.
      assert.deepEqual(settings.amenities, [
        { name: "Breakfast", description: "Served until 10:30" },
        { name: "Bicycles", description: "" },
      ]);
      assert.deepEqual(settings.nearbyPlaces, [{ name: "Railway station", note: "By taxi", distance: "10 min" }]);

      // The admin form gets the same lists back as stored values.
      const admin = (await api("/api/settings", { cookie: adminCookie })).body;
      assert.equal(admin.stored.amenities.length, 2);
      assert.deepEqual(admin.fallback.amenities, []);

      // An empty list clears the section again.
      const cleared = await api("/api/settings", { method: "PUT", cookie: adminCookie, body: { amenities: [], heroTitle: "" } });
      assert.equal(cleared.body.stored.amenities, null);
      const after = (await api("/api/settings/public")).body;
      assert.deepEqual(after.amenities, []);
      assert.equal(after.heroTitle, "");
      assert.equal(after.nearbyPlaces.length, 1);

      // The database itself only takes a list.
      await assert.rejects(pool.query(`UPDATE property_settings SET amenities = '"a pool"'::jsonb WHERE id = 1`));
    } finally {
      await pool.query("DELETE FROM property_settings");
    }
  });

  it("quotes only visible, well-rated reviews that say something, and scores all visible ones", async () => {
    // The sample data has no review outside a demo.
    const none = await api("/api/reviews/featured");
    assert.equal(none.status, 200);
    assert.deepEqual(none.body, { data: [], averageRating: 0, totalReviews: 0 });

    const quoted = await addReview(0, { rating: 5, comment: "  Quiet room, kind staff.  " });
    const alsoQuoted = await addReview(1, { rating: 4, comment: "Good value." });
    await addReview(2, { rating: 5 });
    await addReview(3, { rating: 5, comment: "   " });
    await addReview(4, { rating: 2, comment: "Noisy street." });
    await addReview(5, { rating: 5, comment: "x".repeat(401) });
    await addReview(6, { rating: 5, comment: "Hidden by the admin.", hidden: true });

    const { status, body } = await api("/api/reviews/featured");
    assert.equal(status, 200);
    assert.deepEqual(body.data.map((review) => review.id), [quoted, alsoQuoted]);
    assert.equal(body.data[0].comment, "Quiet room, kind staff.");
    assert.ok(body.data[0].room_name);
    // The reviewer is named the way room pages name them: never in full.
    assert.ok(body.data[0].reviewer_name);
    assert.equal(body.data[0].user_name, undefined);

    // Six visible reviews: 5 + 4 + 5 + 5 + 2 + 5 = 26.
    assert.equal(body.totalReviews, 6);
    assert.equal(body.averageRating, 4.3);
  });
});
