// What the admin area reads, on real PostgreSQL: the dashboard for any
// window of days, the orders list's search and filters, a booking's payment
// history, the room calendar's timeline, and room types kept as one.
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
const { todayInAppTimezone } = require("../src/utils/time");
const { bookingCode } = require("../src/utils/bookingCode");
const app = require("../server");

let server;
let baseUrl;
let cookie;
let today;
const ids = {};

function day(offset) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function get(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
  return { status: response.status, body: response.headers.get("content-type")?.includes("json") ? await response.json() : null, type: response.headers.get("content-type") };
}

// A booking made at noon (property time) on `madeOn`.
async function addBooking({ roomId, userId, madeOn, checkIn, checkOut, total, status, payment = "unpaid", guest }) {
  const result = await pool.query(
    `INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, payment_status, created_at,
                           guest_name, guest_phone)
     VALUES ($1, $2, $3, $4, $5, 2, $6, $7, ($8 || ' 05:00')::timestamp, $9, $10)
     RETURNING id`,
    [userId, roomId, checkIn, checkOut, total, status, payment, madeOn, guest?.name || null, guest?.phone || null]
  );
  return result.rows[0].id;
}

describe("admin area data", () => {
  before(async () => {
    await reset(pool, { log: () => {} });
    await pool.query("DELETE FROM room_reviews; DELETE FROM payments; DELETE FROM bookings;");
    // Four rooms on sale, the rest under maintenance.
    const rooms = (await pool.query("SELECT id FROM rooms ORDER BY id")).rows.map((row) => row.id);
    ids.rooms = rooms.slice(0, 4);
    await pool.query("UPDATE rooms SET status = 'maintenance' WHERE NOT (id = ANY($1::int[]))", [ids.rooms]);
    await pool.query("UPDATE rooms SET status = 'available', room_type = 'Garden Deluxe' WHERE id = ANY($1::int[])", [ids.rooms.slice(0, 2)]);
    await pool.query("UPDATE rooms SET status = 'available', room_type = 'Ocean Villa' WHERE id = ANY($1::int[])", [ids.rooms.slice(2)]);
    ids.admin = (await pool.query("SELECT id FROM users WHERE email = 'admin@example.com'")).rows[0].id;
    ids.guest = (await pool.query("SELECT id FROM users WHERE role = 'user' ORDER BY id LIMIT 1")).rows[0].id;
    today = todayInAppTimezone();
    const [r1, r2, r3, r4] = ids.rooms;

    // In the window (the last 7 days):
    ids.b1 = await addBooking({ roomId: r1, userId: ids.guest, madeOn: day(-1), checkIn: day(-3), checkOut: day(-1), total: 2000000, status: "confirmed", payment: "paid" });
    ids.b2 = await addBooking({ roomId: r2, userId: ids.guest, madeOn: day(-2), checkIn: day(-1), checkOut: day(2), total: 3000000, status: "confirmed" });
    ids.b3 = await addBooking({ roomId: r3, userId: ids.guest, madeOn: day(0), checkIn: day(5), checkOut: day(6), total: 900000, status: "pending" });
    ids.b4 = await addBooking({ roomId: r3, userId: ids.guest, madeOn: day(-3), checkIn: day(10), checkOut: day(12), total: 5000000, status: "cancelled", payment: "refunded" });
    ids.b6 = await addBooking({ roomId: r4, userId: ids.admin, madeOn: day(0), checkIn: day(0), checkOut: day(1), total: 800000, status: "confirmed", guest: { name: "Khách Tại Quầy", phone: "0909 111 222" } });
    // In the week before it:
    ids.b5 = await addBooking({ roomId: r1, userId: ids.guest, madeOn: day(-9), checkIn: day(-10), checkOut: day(-8), total: 1500000, status: "confirmed", payment: "paid" });

    await pool.query(
      `INSERT INTO payments (booking_id, provider, transaction_ref, amount, status)
       VALUES ($1, 'vnpay', 'LXTESTREF1', 2000000, 'success')`,
      [ids.b1]
    );

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

  it("counts the last 7 days against the 7 before them", async () => {
    const { status, body } = await get("/api/dashboard/overview");
    assert.equal(status, 200);
    assert.equal(body.from, day(-6));
    assert.equal(body.to, today);
    assert.deepEqual(body.previous, { from: day(-13), to: day(-7) });
    assert.deepEqual(body.rooms.sellable, 4);

    const c = body.current;
    assert.equal(c.revenue, 2000000, "paid bookings made in the window");
    assert.equal(c.bookings, 5);
    assert.equal(c.cancelled, 1);
    // B1: 2 nights, B2: 2 of its 3 nights fall in the window, B6: tonight.
    assert.equal(c.nightsSold, 5);
    assert.equal(c.nightsAvailable, 28);
    assert.equal(Math.round(c.occupancy * 1000) / 1000, Math.round((5 / 28) * 1000) / 1000);
    assert.equal(c.adr, (1000000 * 2 + 1000000 * 2 + 800000) / 5);

    const b = body.before;
    assert.equal(b.revenue, 1500000);
    assert.equal(b.bookings, 1);
    assert.equal(b.nightsSold, 2);

    assert.equal(body.series.length, 7);
    assert.equal(body.series[5].date, day(-1));
    assert.equal(body.series[5].revenue, 2000000);
    assert.equal(body.series.at(-1).nightsSold, 2, "B2 and B6 tonight");
    assert.equal(body.series[0].prevDate, day(-13));

    assert.deepEqual(body.todayAt, { checkIns: 1, checkOuts: 0, occupiedRooms: 2, pendingPayment: 1, refundPending: 0 });
    assert.equal(body.recent.length, 5);
    assert.equal(body.recent[0].id, ids.b5);
    assert.equal(body.recent.find((row) => row.id === ids.b6).guest_name, "Khách Tại Quầy");
  });

  it("takes any window up to 366 days ending today at the latest", async () => {
    const one = await get(`/api/dashboard/overview?from=${today}&to=${today}`);
    assert.equal(one.status, 200);
    assert.equal(one.body.days, 1);
    assert.equal(one.body.current.bookings, 2);

    for (const query of [`from=${day(1)}&to=${day(1)}`, `from=${day(-1)}&to=${day(-3)}`, `from=2026-02-30&to=${today}`, `from=${day(-400)}&to=${today}`]) {
      const refused = await get(`/api/dashboard/overview?${query}`);
      assert.equal(refused.status, 400, query);
    }

    const file = await get(`/api/dashboard/export?format=xlsx&from=${day(-29)}&to=${today}`);
    assert.equal(file.status, 200);
    assert.match(file.type, /spreadsheetml/);
    const name = (await fetch(`${baseUrl}/api/dashboard/export?format=pdf&from=${day(-29)}&to=${today}`, { headers: { Cookie: cookie } })).headers.get("content-disposition");
    assert.match(name, new RegExp(`luxestay-dashboard-${day(-29)}-${today}\\.pdf`));
    assert.equal((await get(`/api/dashboard/export?format=pdf&from=${day(1)}&to=${day(1)}`)).status, 400);
  });

  it("finds bookings by code, name, email or phone, and filters the list", async () => {
    const list = async (query) => (await get(`/api/bookings?page=1&limit=50&${query}`)).body;

    const byCode = await list(`q=${encodeURIComponent(bookingCode(ids.b2))}`);
    assert.deepEqual(byCode.data.map((row) => row.id), [ids.b2]);
    assert.deepEqual((await list(`q=bk${ids.b2}`)).data.map((row) => row.id), [ids.b2]);

    const byDeskGuest = await list(`q=${encodeURIComponent("tại quầy")}`);
    assert.deepEqual(byDeskGuest.data.map((row) => row.id), [ids.b6]);
    const byPhone = await list(`q=${encodeURIComponent("0909 111")}`);
    assert.deepEqual(byPhone.data.map((row) => row.id), [ids.b6]);

    const guestEmail = (await pool.query("SELECT email FROM users WHERE id = $1", [ids.guest])).rows[0].email;
    assert.equal((await list(`q=${encodeURIComponent(guestEmail)}`)).total, 5);
    assert.equal((await list("q=%25")).total, 0, "a % is searched for, not a wildcard");

    assert.deepEqual((await list("stay=in_house")).data.map((row) => row.id).sort(), [ids.b2, ids.b6].sort());
    // Stays already over were completed by the API's upkeep.
    assert.equal((await list("status=confirmed&stay=not_in_house")).total, 0);
    assert.equal((await list("status=completed")).total, 2);
    assert.deepEqual((await list("channel=desk")).data.map((row) => row.id), [ids.b6]);
    assert.equal((await list("channel=online")).total, 5);
    assert.equal((await list(`room_type=${encodeURIComponent("ocean villa")}`)).total, 3);

    const counts = (await get("/api/bookings/counts")).body;
    assert.equal(counts.in_house, 2);
    assert.equal(counts.all, 6);

    const paid = (await list(`q=${encodeURIComponent(bookingCode(ids.b1))}`)).data[0];
    assert.equal(paid.paid_via, "vnpay");
    assert.equal(paid.paid_ref, "LXTESTREF1");
  });

  it("gives the admin a booking's payment attempts", async () => {
    const { body } = await get(`/api/bookings/${ids.b1}`);
    assert.equal(body.payments.length, 1);
    assert.equal(body.payments[0].provider, "vnpay");
    assert.equal(body.payments[0].status, "success");
  });

  it("lays out the calendar: every room, every booking that is not cancelled", async () => {
    const { status, body } = await get(`/api/bookings/timeline?from=${day(-3)}&to=${day(3)}`);
    assert.equal(status, 200);
    assert.equal(body.rooms.length, (await pool.query("SELECT COUNT(*)::int AS n FROM rooms")).rows[0].n);
    assert.deepEqual(body.bookings.map((row) => row.id).sort(), [ids.b1, ids.b2, ids.b6].sort());
    const desk = body.bookings.find((row) => row.id === ids.b6);
    assert.equal(desk.guest_name, "Khách Tại Quầy");
    assert.equal(desk.at_desk, true);
    assert.equal(desk.check_in, today);

    assert.equal((await get(`/api/bookings/timeline?from=${day(0)}&to=${day(70)}`)).status, 400);
    assert.equal((await get(`/api/bookings/timeline?from=${day(3)}&to=${day(0)}`)).status, 400);
  });

  it("keeps one spelling of a room type", async () => {
    const created = await fetch(`${baseUrl}/api/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ room_name: "Phòng thử loại", room_type: "  garden   DELUXE ", price: 1000000, capacity: 2 }),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).room.room_type, "Garden Deluxe");

    const types = (await get("/api/rooms/types")).body;
    const garden = types.filter((row) => row.type.toLowerCase() === "garden deluxe");
    assert.equal(garden.length, 1);
    assert.equal(garden[0].count, 3);
  });
});
