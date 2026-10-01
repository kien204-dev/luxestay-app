// Seeds a fresh database with everything needed to try the app: an admin, a
// demo guest, sample rooms, one coupon and a few bookings.
//
// Works offline. Room photos come from seed-assets/rooms/ (see the README
// there); with no photos bundled, rooms are simply created without images.
//
// Safe to re-run: users are matched by email, rooms by name, the coupon by
// code, and sample bookings are only added while the bookings table is empty.
//
// Usage:
//   npm run db:seed                 50 featured rooms
//   npm run db:seed -- --all-rooms  featured rooms + one pair per destination (~390)

require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { FEATURED_ROOMS, buildGeneratedRooms } = require("./seed-data/rooms");

const SEED_ASSETS_DIR = path.join(__dirname, "../../seed-assets/rooms");
const UPLOAD_DIR = path.join(__dirname, "../../uploads/rooms");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const GALLERY_SIZE = 3;

const DEFAULT_ADMIN_PASSWORD = "Admin@12345";
const DEFAULT_USER_PASSWORD = "User@12345";

function getSeedAccounts() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

  return [
    {
      name: "Admin",
      email: (process.env.SEED_ADMIN_EMAIL || "admin@example.com").toLowerCase(),
      password: adminPassword,
      role: "admin",
      // The default password is public (it is in the README), so the first
      // login has to replace it.
      mustChangePassword: adminPassword === DEFAULT_ADMIN_PASSWORD,
    },
    {
      name: "Khách Demo",
      email: "user@example.com",
      password: DEFAULT_USER_PASSWORD,
      role: "user",
      mustChangePassword: false,
    },
  ];
}

async function seedUsers(pool, log) {
  const ids = {};

  for (const account of getSeedAccounts()) {
    const existing = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
      [account.email]
    );

    if (existing.rows.length > 0) {
      ids[account.role] = existing.rows[0].id;
      continue;
    }

    const hashed = await bcrypt.hash(account.password, 10);
    const inserted = await pool.query(
      `INSERT INTO users (name, email, password, role, must_change_password)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [account.name, account.email, hashed, account.role, account.mustChangePassword]
    );
    ids[account.role] = inserted.rows[0].id;
    log(`  created ${account.role}: ${account.email} / ${account.password}`);
  }

  return ids;
}

// Copies the bundled sample photos into uploads/rooms/ (skipping ones already
// there) and returns their public paths in filename order.
function installSeedImages() {
  if (!fs.existsSync(SEED_ASSETS_DIR)) return [];

  const files = fs
    .readdirSync(SEED_ASSETS_DIR)
    .filter((file) => IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .sort();

  fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  return files.map((file) => {
    const targetName = `seed-${file}`;
    const target = path.join(UPLOAD_DIR, targetName);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(path.join(SEED_ASSETS_DIR, file), target);
    }
    return `/uploads/rooms/${targetName}`;
  });
}

function pickRoomImages(images, index) {
  if (images.length === 0) return { cover: null, gallery: [] };

  const cover = images[index % images.length];
  const gallery = [];
  for (let step = 1; step <= GALLERY_SIZE && step < images.length; step++) {
    gallery.push(images[(index + step) % images.length]);
  }
  return { cover, gallery };
}

async function insertGallery(pool, roomId, gallery) {
  for (let order = 0; order < gallery.length; order++) {
    await pool.query(
      "INSERT INTO room_images (room_id, image_path, sort_order) VALUES ($1, $2, $3)",
      [roomId, gallery[order], order]
    );
  }
}

async function seedRooms(pool, log, { allRooms }) {
  const rooms = allRooms ? [...FEATURED_ROOMS, ...buildGeneratedRooms()] : FEATURED_ROOMS;
  const images = installSeedImages();
  const roomIds = [];
  let created = 0;
  let illustrated = 0;

  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    const description = `${room.desc} Địa điểm: ${room.location}.`;
    const { cover, gallery } = pickRoomImages(images, i);
    const existing = await pool.query("SELECT id FROM rooms WHERE room_name = $1", [room.name]);

    if (existing.rows.length > 0) {
      const roomId = existing.rows[0].id;
      roomIds.push(roomId);

      // Photos added to seed-assets after the first seed: fill in rooms that
      // still have no picture, without touching ones an admin already set.
      if (cover) {
        const filled = await pool.query(
          `UPDATE rooms SET image = $1
           WHERE id = $2 AND image IS NULL
             AND NOT EXISTS (SELECT 1 FROM room_images WHERE room_id = $2)
           RETURNING id`,
          [cover, roomId]
        );
        if (filled.rows.length > 0) {
          await insertGallery(pool, roomId, gallery);
          illustrated++;
        }
      }
      continue;
    }

    const inserted = await pool.query(
      `INSERT INTO rooms (room_name, room_type, price, description, capacity, image, status, location)
       VALUES ($1, $2, $3, $4, $5, $6, 'available', $7)
       RETURNING id`,
      [room.name, room.type, room.price, description, room.capacity, cover, room.location]
    );
    const roomId = inserted.rows[0].id;

    await insertGallery(pool, roomId, gallery);
    roomIds.push(roomId);
    created++;
  }

  log(
    `  rooms: ${created} created, ${rooms.length - created} already present ` +
      `(${illustrated} given photos), ${images.length} sample photos`
  );
  return roomIds;
}

async function seedCoupon(pool, log) {
  const result = await pool.query(
    `INSERT INTO coupons (code, discount_type, discount_value, max_discount_amount, expires_at)
     VALUES ('WELCOME10', 'percent', 10, 300000, NOW() + INTERVAL '1 year')
     ON CONFLICT (code) DO NOTHING
     RETURNING id`
  );
  if (result.rows.length > 0) log("  coupon: WELCOME10 (10%, tối đa 300.000 đ)");
}

// One stay of each kind for the demo guest, dated relative to today so the
// sample data never goes stale: a finished stay (with a review), an upcoming
// confirmed one, and one still waiting for payment.
async function seedBookings(pool, log, { guestId, roomIds }) {
  const existing = await pool.query("SELECT 1 FROM bookings LIMIT 1");
  if (existing.rows.length > 0 || roomIds.length < 3) return;

  const samples = [
    { roomId: roomIds[0], startOffset: -10, nights: 2, guests: 2, status: "completed", paymentStatus: "paid" },
    { roomId: roomIds[1], startOffset: 7, nights: 2, guests: 2, status: "confirmed", paymentStatus: "paid" },
    { roomId: roomIds[2], startOffset: 14, nights: 1, guests: 1, status: "pending", paymentStatus: "unpaid" },
  ];

  for (const sample of samples) {
    const inserted = await pool.query(
      `INSERT INTO bookings (user_id, room_id, check_in, check_out, total_price, guests, status, payment_status)
       SELECT $1, r.id, CURRENT_DATE + $3::int, CURRENT_DATE + $3::int + $4::int, r.price * $4::int, $5, $6, $7
       FROM rooms r WHERE r.id = $2
       RETURNING id, room_id`,
      [guestId, sample.roomId, sample.startOffset, sample.nights, sample.guests, sample.status, sample.paymentStatus]
    );

    if (sample.status === "completed") {
      await pool.query(
        `INSERT INTO room_reviews (room_id, user_id, booking_id, rating, comment)
         VALUES ($1, $2, $3, 5, 'Phòng sạch sẽ, vị trí thuận tiện, nhân viên nhiệt tình. Sẽ quay lại!')`,
        [inserted.rows[0].room_id, guestId, inserted.rows[0].id]
      );
    }
  }

  // rooms.status is a cache of "has an active booking that has not ended yet".
  await pool.query(
    `UPDATE rooms SET status = 'booked'
     WHERE status = 'available' AND id IN (
       SELECT room_id FROM bookings
       WHERE status IN ('pending', 'confirmed') AND check_out >= CURRENT_DATE
     )`
  );

  log(`  bookings: ${samples.length} sample bookings for the demo guest`);
}

async function seed(pool, { log = console.log, allRooms = false } = {}) {
  log("Seeding database...");
  const userIds = await seedUsers(pool, log);
  const roomIds = await seedRooms(pool, log, { allRooms });
  await seedCoupon(pool, log);
  await seedBookings(pool, log, { guestId: userIds.user, roomIds });
  log("Seed complete");
}

module.exports = { seed, DEFAULT_ADMIN_PASSWORD, DEFAULT_USER_PASSWORD };

if (require.main === module) {
  const pool = require("./db");
  seed(pool, { allRooms: process.argv.includes("--all-rooms") })
    .then(() => pool.end())
    .catch((err) => {
      console.error("SEED FAILED:", err.message);
      process.exit(1);
    });
}
