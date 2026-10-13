// The admin catalog screens' API, on real PostgreSQL: a coupon's start date
// (refused before it, a later end date required), what each coupon took
// off, room status counts, gallery order and cover swap, the photo limit,
// review filters and summary, a lock's reason and note, and that every
// admin endpoint added or changed in the redesign answers 401 without a
// session and 403 to a guest.
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
const bcrypt = require("bcryptjs");
const sharp = require("sharp");

const pool = require("../src/db/db");
const { reset } = require("../src/db/reset");
const app = require("../server");

let server;
let baseUrl;
let admin;
let guest;
const GUEST = { email: "catalog-guest@example.com", password: "Guest-Catalog-1" };

async function signIn(email, password) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `sign in ${email}`);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

async function call(method, path, { cookie, body, form } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  const type = response.headers.get("content-type") || "";
  return { status: response.status, body: type.includes("json") ? await response.json() : null };
}

const isoIn = (days) => new Date(Date.now() + days * 86400000).toISOString();

describe("admin catalog API", () => {
  before(async () => {
    await reset(pool, { log: () => {} });
    await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES ('Khách Danh Mục', $1, $2, 'user')",
      [GUEST.email, await bcrypt.hash(GUEST.password, 10)]
    );
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    admin = await signIn("admin@example.com", "Admin-Integration-1");
    guest = await signIn(GUEST.email, GUEST.password);
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("refuses a coupon before its start date, and an end date not after the start", async () => {
    const base = { discount_type: "percent", discount_value: 10, expires_at: isoIn(30) };
    const wrong = await call("POST", "/api/coupons", { cookie: admin, body: { ...base, code: "ORDERCHECK", starts_at: isoIn(40) } });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.code, "COUPON_DATES_ORDER");

    const later = await call("POST", "/api/coupons", { cookie: admin, body: { ...base, code: "LATERSTART", starts_at: isoIn(5) } });
    assert.equal(later.status, 201);
    assert.ok(later.body.coupon.starts_at);
    const early = await call("POST", "/api/coupons/validate", { cookie: guest, body: { code: "LATERSTART", amount: 2000000 } });
    assert.equal(early.body.code, "COUPON_NOT_STARTED");

    // Moved to yesterday: usable. Without a start date: as before.
    const id = later.body.coupon.id;
    const moved = await call("PUT", `/api/coupons/${id}`, { cookie: admin, body: { ...base, code: "LATERSTART", starts_at: isoIn(-1) } });
    assert.equal(moved.status, 200);
    const now = await call("POST", "/api/coupons/validate", { cookie: guest, body: { code: "LATERSTART", amount: 2000000 } });
    assert.equal(now.status, 200);
    assert.equal(now.body.discountAmount, 200000);
    const cleared = await call("PUT", `/api/coupons/${id}`, { cookie: admin, body: { ...base, code: "LATERSTART", starts_at: "" } });
    assert.equal(cleared.body.coupon.starts_at, null);

    // What each coupon took off bookings that still stand.
    const room = (await pool.query("SELECT id FROM rooms WHERE status <> 'maintenance' ORDER BY id DESC LIMIT 1")).rows[0];
    const user = (await pool.query("SELECT id FROM users WHERE email = $1", [GUEST.email])).rows[0];
    for (const [offset, status, discount] of [[200, "confirmed", 150000], [210, "cancelled", 999999]]) {
      await pool.query(
        `INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, coupon_id, discount_amount)
         VALUES ($1, $2, CURRENT_DATE + $3::int, CURRENT_DATE + $3::int + 1, 1000000, 1, $4, $5, $6)`,
        [user.id, room.id, offset, status, id, discount]
      );
    }
    const list = await call("GET", "/api/coupons", { cookie: admin });
    assert.equal(list.body.find((coupon) => coupon.id === id).discount_total, 150000);
  });

  it("counts rooms by status, orders a gallery, swaps the cover without losing a file, and caps photos", async () => {
    const counts = await call("GET", "/api/rooms/status-counts", { cookie: admin });
    const real = (await pool.query("SELECT status, COUNT(*)::int AS n FROM rooms GROUP BY status")).rows;
    const of = (status) => real.find((row) => row.status === status)?.n || 0;
    assert.deepEqual(counts.body, { all: of("available") + of("booked") + of("maintenance"), available: of("available"), booked: of("booked"), maintenance: of("maintenance") });

    const room = (await pool.query("UPDATE rooms SET image = '/uploads/rooms/cover-a.webp' WHERE id = (SELECT MIN(id) FROM rooms) RETURNING id")).rows[0];
    await pool.query("DELETE FROM room_images WHERE room_id = $1", [room.id]);
    const ids = [];
    for (const name of ["one", "two", "three"]) {
      ids.push((await pool.query("INSERT INTO room_images (room_id, image_path) VALUES ($1, $2) RETURNING id", [room.id, `/uploads/rooms/${name}.webp`])).rows[0].id);
    }

    const listed = await call("GET", "/api/rooms?page=1&limit=100");
    assert.equal(listed.body.data.find((item) => item.id === room.id).image_count, 3);

    assert.equal((await call("PUT", `/api/rooms/${room.id}/images/order`, { cookie: admin, body: { ids: [ids[0], ids[1]] } })).status, 400);
    assert.equal((await call("PUT", `/api/rooms/${room.id}/images/order`, { cookie: admin, body: { ids: [ids[0], ids[0], ids[1]] } })).status, 400);
    const ordered = await call("PUT", `/api/rooms/${room.id}/images/order`, { cookie: admin, body: { ids: [ids[2], ids[0], ids[1]] } });
    assert.equal(ordered.status, 200);
    let gallery = (await call("GET", `/api/rooms/${room.id}`)).body.images.map((image) => image.id);
    assert.deepEqual(gallery, [ids[2], ids[0], ids[1]]);

    // "two" becomes the cover; the old cover takes its place in the gallery.
    const cover = await call("POST", `/api/rooms/${room.id}/images/${ids[1]}/cover`, { cookie: admin });
    assert.equal(cover.status, 200);
    const after = (await call("GET", `/api/rooms/${room.id}`)).body;
    assert.equal(after.image, "/uploads/rooms/two.webp");
    assert.deepEqual(after.images.map((image) => image.image_path), ["/uploads/rooms/three.webp", "/uploads/rooms/one.webp", "/uploads/rooms/cover-a.webp"]);

    // No cover yet: the photo just leaves the gallery.
    await pool.query("UPDATE rooms SET image = NULL WHERE id = $1", [room.id]);
    await call("POST", `/api/rooms/${room.id}/images/${ids[2]}/cover`, { cookie: admin });
    gallery = (await call("GET", `/api/rooms/${room.id}`)).body;
    assert.equal(gallery.image, "/uploads/rooms/three.webp");
    assert.equal(gallery.images.length, 2);
    assert.equal((await call("POST", `/api/rooms/${room.id}/images/999999/cover`, { cookie: admin })).status, 404);

    // At most 30 gallery photos: the 31st upload is refused.
    for (let i = gallery.images.length; i < 30; i += 1) {
      await pool.query("INSERT INTO room_images (room_id, image_path) VALUES ($1, $2)", [room.id, `/uploads/rooms/fill-${i}.webp`]);
    }
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#7a6a55" } }).png().toBuffer();
    const form = new FormData();
    form.append("image", new Blob([png], { type: "image/png" }), "photo.png");
    const refused = await call("POST", `/api/rooms/${room.id}/images`, { cookie: admin, form });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.code, "ROOM_IMAGES_LIMIT");
  });

  it("filters reviews by stars, hidden and text, with a summary over all of them", async () => {
    const user = (await pool.query("SELECT id FROM users WHERE email = $1", [GUEST.email])).rows[0];
    const rooms = (await pool.query("SELECT id, room_name FROM rooms ORDER BY id LIMIT 3")).rows;
    await pool.query("DELETE FROM room_reviews");
    const made = [];
    for (const [i, [rating, comment, hidden]] of [[5, "Tuyệt vời, sẽ quay lại", false], [2, "Phòng ồn", false], [1, "Quảng cáo spam", true], [4, null, false]].entries()) {
      const booking = (await pool.query(
        `INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, payment_status)
         VALUES ($1, $2, CURRENT_DATE - 40 - $3::int * 3, CURRENT_DATE - 39 - $3::int * 3, 1000000, 1, 'completed', 'paid') RETURNING id`,
        [user.id, rooms[i % 3].id, i]
      )).rows[0];
      made.push((await pool.query(
        "INSERT INTO room_reviews (room_id, user_id, booking_id, rating, comment, is_hidden) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, booking_id",
        [rooms[i % 3].id, user.id, booking.id, rating, comment, hidden]
      )).rows[0]);
    }

    const all = await call("GET", "/api/reviews?page=1&limit=20", { cookie: admin });
    assert.deepEqual(all.body.summary, { total: 4, hidden: 1, five: 1, low: 2, average: 3.67 });
    const ids = async (query) => (await call("GET", `/api/reviews?${query}`, { cookie: admin })).body.data.map((review) => review.id).sort();
    assert.deepEqual(await ids("stars=5"), [made[0].id]);
    assert.deepEqual(await ids("stars=low"), [made[1].id, made[2].id].sort());
    assert.deepEqual(await ids("hidden=true"), [made[2].id]);
    assert.deepEqual(await ids("q=ồn"), [made[1].id]);
    assert.deepEqual(await ids(`q=%23BK-${String(made[3].booking_id).padStart(4, "0")}`), [made[3].id]);
    const filtered = await call("GET", "/api/reviews?hidden=false&stars=low", { cookie: admin });
    assert.equal(filtered.body.pagination.total, 1);
  });

  it("keeps why an account was locked for the admins, clears it on unlock, never locks the last admin", async () => {
    const target = (await pool.query("SELECT id, token_version FROM users WHERE email = $1", [GUEST.email])).rows[0];
    assert.equal((await call("PATCH", `/api/users/${target.id}/lock`, { cookie: admin, body: { locked: true, reason: "because" } })).status, 400);
    const locked = await call("PATCH", `/api/users/${target.id}/lock`, { cookie: admin, body: { locked: true, reason: "fraud", note: "Ba lần hoàn tiền bị từ chối." } });
    assert.equal(locked.status, 200);
    assert.equal(locked.body.user.lock_reason, "fraud");
    const row = (await pool.query("SELECT lock_reason, lock_note, locked_at, token_version FROM users WHERE id = $1", [target.id])).rows[0];
    assert.equal(row.lock_note, "Ba lần hoàn tiền bị từ chối.");
    assert.ok(row.locked_at);
    assert.equal(row.token_version, target.token_version + 1, "signed out everywhere");

    const list = await call("GET", "/api/users?page=1&limit=50&status=locked", { cookie: admin });
    const shown = list.body.data.find((user) => user.id === target.id);
    assert.equal(shown.lock_reason, "fraud");
    assert.equal(typeof shown.booking_count, "number");
    assert.equal(typeof shown.upcoming_count, "number");
    // The account holder never sees it.
    const me = (await pool.query("SELECT id FROM users WHERE email = 'admin@example.com'")).rows[0];
    assert.equal((await call("PATCH", `/api/users/${me.id}/lock`, { cookie: admin, body: { locked: true, reason: "other" } })).body.code, "CANNOT_LOCK_SELF");

    const unlocked = await call("PATCH", `/api/users/${target.id}/lock`, { cookie: admin, body: { locked: false } });
    assert.equal(unlocked.body.user.lock_reason, null);
    assert.equal((await pool.query("SELECT lock_note FROM users WHERE id = $1", [target.id])).rows[0].lock_note, null);
    guest = await signIn(GUEST.email, GUEST.password);
  });

  it("stores the credit sent with a new destination photo, and checks its links", async () => {
    const name = (await call("GET", "/api/destinations", { cookie: admin })).body[0].name;
    const jpeg = await sharp({ create: { width: 640, height: 400, channels: 3, background: "#24384f" } }).jpeg().toBuffer();
    const upload = (fields) => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.append(key, value);
      form.append("image", new Blob([jpeg], { type: "image/jpeg" }), "place.jpg");
      return call("POST", `/api/destinations/${encodeURIComponent(name)}/image`, { cookie: admin, form });
    };

    const bad = await upload({ author: "A", license: "CC BY 4.0", sourceUrl: "commons.example/x" });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, "INVALID_URL");

    const saved = await upload({ author: "Nguyễn Thu Trang", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg", title: "", place: "", changes: "" });
    assert.equal(saved.status, 201);
    assert.match(saved.body.image, /\.webp$/);
    const row = (await call("GET", "/api/destinations", { cookie: admin })).body.find((item) => item.name === name);
    assert.equal(row.author, "Nguyễn Thu Trang");
    assert.equal(row.license, "CC BY-SA 4.0");
    assert.equal(row.title, "");
    const credits = (await call("GET", "/api/destinations/credits")).body;
    assert.ok(JSON.stringify(credits).includes("Nguyễn Thu Trang"));
  });

  it("answers 401 without a session and 403 to a guest on every admin endpoint added or changed", async () => {
    const room = (await pool.query("SELECT MIN(id) AS id FROM rooms")).rows[0].id;
    const image = (await pool.query("SELECT id FROM room_images WHERE room_id = $1 LIMIT 1", [room])).rows[0].id;
    const coupon = (await pool.query("SELECT id FROM coupons LIMIT 1")).rows[0].id;
    const review = (await pool.query("SELECT id FROM room_reviews LIMIT 1")).rows[0].id;
    const user = (await pool.query("SELECT id FROM users WHERE email = $1", [GUEST.email])).rows[0].id;
    const endpoints = [
      // Admin part 1 (dashboard, bookings, calendar, room types).
      ["GET", "/api/dashboard/overview?days=7"],
      ["GET", "/api/dashboard/export?format=xlsx&days=7"],
      ["GET", "/api/bookings/timeline?from=2026-10-01&to=2026-10-07"],
      ["GET", "/api/bookings?q=0909"],
      ["GET", "/api/bookings?q=guest@example.com"],
      ["GET", "/api/bookings?stay=in_house"],
      ["GET", "/api/bookings?room_type=Deluxe"],
      ["GET", "/api/bookings?channel=desk"],
      ["GET", "/api/rooms/types"],
      // Admin part 2.
      ["GET", "/api/rooms/status-counts"],
      ["PUT", `/api/rooms/${room}/images/order`, { ids: [image] }],
      ["POST", `/api/rooms/${room}/images/${image}/cover`],
      ["GET", "/api/coupons"],
      ["POST", "/api/coupons", { code: "NOPE", discount_type: "fixed", discount_value: 1, expires_at: isoIn(2) }],
      ["PUT", `/api/coupons/${coupon}`, { code: "NOPE", discount_type: "fixed", discount_value: 1, expires_at: isoIn(2) }],
      ["PATCH", `/api/coupons/${coupon}/active`, { active: false }],
      ["GET", "/api/reviews?stars=5&hidden=true&q=a"],
      ["PATCH", `/api/reviews/${review}/hide`, { hidden: true }],
      ["GET", "/api/users?page=1&limit=10&search=a"],
      ["PATCH", `/api/users/${user}/lock`, { locked: true, reason: "spam" }],
      ["GET", "/api/destinations"],
      ["PUT", "/api/destinations/Hà Nội/credit", { author: "x" }],
      ["GET", "/api/settings"],
      ["PUT", "/api/settings", { name: "x" }],
    ];
    for (const [method, path, body] of endpoints) {
      const url = encodeURI(path);
      assert.equal((await call(method, url, { body })).status, 401, `${method} ${path} without a session`);
      assert.equal((await call(method, url, { cookie: guest, body })).status, 403, `${method} ${path} as a guest`);
    }
    // A guest still lists their own bookings.
    assert.equal((await call("GET", "/api/bookings?page=1&limit=5", { cookie: guest })).status, 200);
  });
});
