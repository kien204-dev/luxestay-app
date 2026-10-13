// A believable few weeks of bookings for the admin screens' screenshots:
// stays that ended, guests staying tonight, bookings to come, some waiting
// for payment, a few cancelled (one with money to send back), bookings
// entered at the desk, and the online payments behind the paid ones. Dated
// from `today` so the dashboard and the calendar always have something to
// show. Deterministic: the same `today` gives the same data.
//
// Only for the browser tests and local previews; never part of the seed.

const GUESTS = [
  ["Nguyễn Minh Anh", "minhanh@example.com", "0903 112 233"],
  ["Trần Quốc Bảo", "quocbao@example.com", "0912 445 566"],
  ["Lê Thu Hà", "thuha@example.com", "0938 778 899"],
  ["Emma Laurent", "emma.laurent@example.com", "+33 6 12 34 56 78"],
  ["Phạm Gia Huy", "giahuy@example.com", "0987 223 344"],
  ["Daniel Kim", "daniel.kim@example.com", "+82 10 2345 6789"],
  ["Võ Thanh Tâm", "thanhtam@example.com", "0901 556 677"],
];
const DESK = [
  ["Hoàng Văn Nam", "0905 667 788"],
  ["Đặng Mai Linh", "0916 889 900"],
  ["Bùi Đức Thịnh", "0977 101 202"],
];

function day(today, offset) {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// A small fixed sequence instead of Math.random, so runs are comparable.
function sequence(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

export async function addAdminSample(pool, { today, rooms = 12, from = -45, to = 21 } = {}) {
  const next = sequence(20261013);
  const roomRows = (await pool.query("SELECT id, price FROM rooms WHERE status <> 'maintenance' AND id NOT IN (SELECT room_id FROM bookings) ORDER BY id LIMIT $1", [rooms])).rows;
  const adminId = (await pool.query("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")).rows[0].id;

  const guestIds = [];
  for (const [name, email, phone] of GUESTS) {
    const row = await pool.query(
      `INSERT INTO users (name, email, password, role, phone) VALUES ($1, $2, 'not-a-login', 'user', $3)
       ON CONFLICT DO NOTHING RETURNING id`,
      [name, email, phone]
    );
    guestIds.push(row.rows[0]?.id ?? (await pool.query("SELECT id FROM users WHERE LOWER(email) = $1", [email])).rows[0].id);
  }

  let made = 0;
  let refundGiven = false;
  for (const [index, room] of roomRows.entries()) {
    let cursor = from + Math.floor(next() * 4) + index % 3;
    while (cursor < to) {
      const nights = 1 + Math.floor(next() * 4);
      const checkIn = cursor;
      const checkOut = cursor + nights;
      cursor = checkOut + Math.floor(next() * 4);
      if (checkOut > to) break;

      const lead = 1 + Math.floor(next() * 12);
      const madeOffset = Math.min(checkIn - lead, -1);
      const madeAt = `${day(today, madeOffset)} ${String(1 + Math.floor(next() * 12)).padStart(2, "0")}:${String(Math.floor(next() * 60)).padStart(2, "0")}`;
      const total = Number(room.price) * nights;
      const roll = next();
      const desk = roll < 0.15 ? DESK[Math.floor(next() * DESK.length)] : null;
      const userId = desk ? adminId : guestIds[Math.floor(next() * guestIds.length)];

      let status;
      let payment;
      if (checkOut <= 0) {
        // Stays that ended. Past confirmed ones would be completed by the
        // API anyway; a few were cancelled before the stay.
        status = roll > 0.9 ? "cancelled" : "completed";
        payment = status === "cancelled" ? "unpaid" : "paid";
      } else if (checkIn <= 0) {
        status = "confirmed";
        payment = desk && roll < 0.08 ? "unpaid" : "paid";
      } else if (roll > 0.82) {
        status = "pending";
        payment = "unpaid";
      } else if (roll > 0.72) {
        status = "cancelled";
        payment = !refundGiven ? "refund_pending" : "unpaid";
        refundGiven = true;
      } else {
        status = "confirmed";
        payment = desk ? "unpaid" : "paid";
      }

      const inserted = await pool.query(
        `INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, payment_status, created_at,
                               expires_at, cancelled_at, refund_reason, guest_name, guest_phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7::text, $8::text, $9::timestamp - INTERVAL '7 hours',
                 CASE WHEN $7::text = 'pending' THEN NOW() + INTERVAL '2 days' END,
                 CASE WHEN $7::text = 'cancelled' THEN $9::timestamp END,
                 CASE WHEN $8::text = 'refund_pending' THEN 'cancelled_by_guest' END,
                 $10, $11)
         RETURNING id`,
        [userId, room.id, day(today, checkIn), day(today, checkOut), total, 1 + Math.floor(next() * 3), status, payment, madeAt, desk?.[0] ?? null, desk?.[1] ?? null]
      );
      made += 1;

      // Paid online: the gateway's payment behind it.
      if (!desk && (payment === "paid" || payment === "refund_pending")) {
        await pool.query(
          `INSERT INTO payments (booking_id, provider, transaction_ref, amount, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'success', $5::timestamp - INTERVAL '7 hours', $5::timestamp - INTERVAL '7 hours' + INTERVAL '2 minutes')`,
          [inserted.rows[0].id, next() > 0.5 ? "vnpay" : "momo", `E2E${inserted.rows[0].id}-${Math.floor(next() * 1e6)}`, total, madeAt]
        );
      }
    }
  }

  // rooms.status caches "has an active booking that has not ended".
  await pool.query(
    `UPDATE rooms SET status = CASE WHEN EXISTS (
       SELECT 1 FROM bookings b WHERE b.room_id = rooms.id AND b.status IN ('pending', 'confirmed') AND b.check_out > $1::date
     ) THEN 'booked' ELSE 'available' END
     WHERE status <> 'maintenance'`,
    [today]
  );
  return made;
}
