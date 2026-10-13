const pool = require("../db/db.js");
const { daysBetween, getAppTimezone, todayInAppTimezone } = require("../utils/time");

// The admin dashboard for any window of days [from, to] (dates at the
// property, both included), with the window just before it, of the same
// length, to compare against. Every number comes from the bookings table:
//
//   revenue     paid bookings, by the day they were made (as on the rest of
//               the dashboard and in the export), after coupon discounts
//   bookings    bookings made that day; cancelled: those of them cancelled
//               since
//   nights sold nights of confirmed or completed stays that fall in the
//               window; a stay of 3 nights across the window edge counts
//               only its nights inside
//   occupancy   nights sold / (rooms not under maintenance × nights)
//   ADR         average price of a night sold: each stay's total (after
//               discount) spread evenly over its nights
//
// The rooms under maintenance are today's: the app does not keep a history
// of a room's status.

const MAX_DAYS = 366;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SOLD_STATUSES = ["confirmed", "completed"];

function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isRealDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

// { from, to } (dates) for the request, or { error } with an API message
// code. Default: the last 7 days, today included; `days` (without from/to):
// the last that many days, today included, so a browser in another timezone
// need not know the date at the property.
function resolveWindow(query = {}, today = todayInAppTimezone()) {
  if (query.days !== undefined && query.from === undefined && query.to === undefined) {
    const days = Number(query.days);
    if (!Number.isInteger(days) || days < 1) return { error: "INVALID_DATE_RANGE" };
    if (days > MAX_DAYS) return { error: "DATE_RANGE_TOO_LONG", params: { max: MAX_DAYS } };
    return { from: shiftDate(today, -(days - 1)), to: today };
  }
  const to = query.to ?? today;
  const from = query.from ?? shiftDate(to, -6);
  if (!isRealDate(from) || !isRealDate(to)) return { error: "INVALID_DATE_RANGE" };
  if (from > to || to > today) return { error: "INVALID_DATE_RANGE" };
  if (daysBetween(from, to) + 1 > MAX_DAYS) return { error: "DATE_RANGE_TOO_LONG", params: { max: MAX_DAYS } };
  return { from, to };
}

// When a booking was made, as a date at the property ($1 is APP_TIMEZONE;
// see dashboardController.localCreatedAt).
const LOCAL_CREATED_DATE =
  "(((COALESCE(created_at, check_in::timestamp) AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $1)::date)";

async function computeDashboardOverview({ from, to }) {
  const days = daysBetween(from, to) + 1;
  const prevFrom = shiftDate(from, -days);
  const prevTo = shiftDate(from, -1);
  const end = shiftDate(to, 1);
  const today = todayInAppTimezone();
  const timezone = getAppTimezone();

  const [made, nights, rooms, todayRow, recent] = await Promise.all([
    pool.query(
      `SELECT to_char(${LOCAL_CREATED_DATE}, 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS bookings,
              COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
              COALESCE(SUM(total_price) FILTER (WHERE payment_status = 'paid'), 0)::numeric AS revenue
       FROM bookings
       WHERE ${LOCAL_CREATED_DATE} >= $2::date AND ${LOCAL_CREATED_DATE} < $3::date
       GROUP BY 1`,
      [timezone, prevFrom, end]
    ),
    pool.query(
      `SELECT to_char(night, 'YYYY-MM-DD') AS day,
              COUNT(*)::int AS nights,
              COALESCE(SUM(b.total_price / NULLIF(b.check_out - b.check_in, 0)), 0)::numeric AS night_revenue
       FROM bookings b
       CROSS JOIN LATERAL generate_series(
         GREATEST(b.check_in, $1::date),
         LEAST(b.check_out, $2::date) - 1,
         INTERVAL '1 day'
       ) AS night
       WHERE b.status = ANY($3::text[]) AND b.check_in < $2::date AND b.check_out > $1::date
       GROUP BY 1`,
      [prevFrom, end, SOLD_STATUSES]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status <> 'maintenance')::int AS sellable
       FROM rooms`
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'confirmed' AND check_in = $1::date)::int AS check_ins,
         COUNT(*) FILTER (WHERE status IN ('confirmed', 'completed') AND check_out = $1::date)::int AS check_outs,
         COUNT(DISTINCT room_id) FILTER (WHERE status = 'confirmed' AND check_in <= $1::date AND check_out > $1::date)::int AS occupied_rooms,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_payment,
         COUNT(*) FILTER (WHERE payment_status = 'refund_pending')::int AS refund_pending
       FROM bookings`,
      [today]
    ),
    pool.query(
      `SELECT b.id, b.check_in, b.check_out, b.total_price, b.status, b.payment_status, b.created_at,
              COALESCE(b.guest_name, u.name) AS guest_name, r.room_name
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       JOIN rooms r ON r.id = b.room_id
       ORDER BY b.id DESC
       LIMIT 5`
    ),
  ]);

  const byDay = new Map();
  const entry = (day) => {
    if (!byDay.has(day)) byDay.set(day, { revenue: 0, bookings: 0, cancelled: 0, nights: 0, nightRevenue: 0 });
    return byDay.get(day);
  };
  made.rows.forEach((row) => Object.assign(entry(row.day), { revenue: Number(row.revenue) || 0, bookings: row.bookings, cancelled: row.cancelled }));
  nights.rows.forEach((row) => Object.assign(entry(row.day), { nights: row.nights, nightRevenue: Number(row.night_revenue) || 0 }));

  const sellable = rooms.rows[0]?.sellable || 0;
  const totalRooms = rooms.rows[0]?.total || 0;

  const summarize = (start) => {
    const totals = { revenue: 0, bookings: 0, cancelled: 0, nightsSold: 0, nightRevenue: 0 };
    for (let i = 0; i < days; i += 1) {
      const day = byDay.get(shiftDate(start, i));
      if (!day) continue;
      totals.revenue += day.revenue;
      totals.bookings += day.bookings;
      totals.cancelled += day.cancelled;
      totals.nightsSold += day.nights;
      totals.nightRevenue += day.nightRevenue;
    }
    const nightsAvailable = sellable * days;
    return {
      revenue: totals.revenue,
      bookings: totals.bookings,
      cancelled: totals.cancelled,
      nightsSold: totals.nightsSold,
      nightsAvailable,
      occupancy: nightsAvailable ? totals.nightsSold / nightsAvailable : null,
      adr: totals.nightsSold ? Math.round(totals.nightRevenue / totals.nightsSold) : null,
    };
  };

  const series = Array.from({ length: days }, (_, i) => {
    const date = shiftDate(from, i);
    const prevDate = shiftDate(prevFrom, i);
    const day = byDay.get(date) || {};
    const prev = byDay.get(prevDate) || {};
    return {
      date,
      revenue: day.revenue || 0,
      bookings: day.bookings || 0,
      nightsSold: day.nights || 0,
      occupancy: sellable ? (day.nights || 0) / sellable : null,
      prevDate,
      prevRevenue: prev.revenue || 0,
    };
  });

  const t = todayRow.rows[0] || {};
  return {
    from,
    to,
    days,
    today,
    previous: { from: prevFrom, to: prevTo },
    current: summarize(from),
    before: summarize(prevFrom),
    series,
    rooms: { total: totalRooms, sellable },
    todayAt: {
      checkIns: t.check_ins || 0,
      checkOuts: t.check_outs || 0,
      occupiedRooms: t.occupied_rooms || 0,
      pendingPayment: t.pending_payment || 0,
      refundPending: t.refund_pending || 0,
    },
    recent: recent.rows.map((row) => ({ ...row, total_price: Number(row.total_price) || 0 })),
  };
}

module.exports = { computeDashboardOverview, resolveWindow, shiftDate, MAX_DAYS };
