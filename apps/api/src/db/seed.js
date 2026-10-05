// Seeds a fresh database with everything needed to try the app: an admin, a
// demo guest, sample rooms, one coupon and a few bookings.
//
// Works offline. Room photos come from seed-assets/rooms/ (see the README
// there); with no photos bundled, rooms are simply created without images.
//
// Safe to run on every start, including on a site in real use:
//   - an admin is created only while the database has no admin at all;
//   - sample data goes into an empty database only (always with DEMO_MODE).
//
// Usage:
//   npm run db:seed                 admin + 50 featured rooms, on an empty database
//   npm run db:seed -- --all-rooms  featured rooms + one pair per destination (~390)
//   npm run db:seed -- --force      add missing sample data to a database already in use
//   npm run db:seed -- --admin-only only the first admin, no sample data

require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { FEATURED_ROOMS, buildGeneratedRooms } = require("./seed-data/rooms");

const SEED_ASSETS_DIR = path.join(__dirname, "../../seed-assets/rooms");
const UPLOAD_DIR = path.join(__dirname, "../../uploads/rooms");
const DESTINATION_ASSETS_DIR = path.join(__dirname, "../../seed-assets/destinations");
const DESTINATION_UPLOAD_DIR = path.join(__dirname, "../../uploads/destinations");
const HERO_ASSETS_DIR = path.join(__dirname, "../../seed-assets/hero");
const BRANDING_UPLOAD_DIR = path.join(__dirname, "../../uploads/branding");
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const GALLERY_SIZE = 3;

const DEFAULT_ADMIN_PASSWORD = "Admin@12345";
const DEFAULT_USER_PASSWORD = "User@12345";

const isProduction = () => process.env.NODE_ENV === "production";
const isDemoMode = () => process.env.DEMO_MODE === "true";

// The sample passwords are public (they are in the README), so they are only
// used where that is harmless: in development, and on a public demo, where
// they are shown on the login page anyway. A production install takes the
// configured password, if any, or gets a random one of its own, which has to
// be replaced at the first login.
function seedPassword(defaultPassword, configured) {
  if (configured) return { password: configured, passwordSource: "configured", mustChangePassword: false };
  if (!isDemoMode() && isProduction()) {
    return { password: generatePassword(), passwordSource: "generated", mustChangePassword: true };
  }
  return { password: defaultPassword, passwordSource: "default", mustChangePassword: false };
}

function generatePassword() {
  return crypto.randomBytes(18).toString("base64url");
}

// The admin created on first start.
function getSeedAdmin() {
  const account = {
    name: "Admin",
    email: (process.env.SEED_ADMIN_EMAIL || "admin@example.com").toLowerCase(),
    role: "admin",
    ...seedPassword(DEFAULT_ADMIN_PASSWORD, process.env.SEED_ADMIN_PASSWORD),
  };
  // Outside a demo the public default never stays: the first login replaces it.
  if (account.passwordSource === "default" && !isDemoMode()) account.mustChangePassword = true;
  return account;
}

function getSeedGuest() {
  return {
    name: "Khách Demo",
    email: "user@example.com",
    role: "user",
    ...seedPassword(DEFAULT_USER_PASSWORD),
  };
}

// The sample sign-ins of a public demo (see config/demo.js).
function getSeedAccounts() {
  return [getSeedAdmin(), getSeedGuest()];
}

async function insertUser(pool, account) {
  const hashed = await bcrypt.hash(account.password, 10);
  const inserted = await pool.query(
    `INSERT INTO users (name, email, password, role, must_change_password)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [account.name, account.email, hashed, account.role, account.mustChangePassword]
  );
  return inserted.rows[0].id;
}

// A password never reaches a production log, except a generated one, which
// is shown this once because nobody could know it otherwise.
function logCreated(log, label, account) {
  if (account.passwordSource === "generated") {
    log(`  created ${label}: ${account.email}`);
    log(`  generated ${label} password, shown only this once (change it at first login): ${account.password}`);
  } else if (account.passwordSource === "configured") {
    log(`  created ${label}: ${account.email} (password from SEED_ADMIN_PASSWORD)`);
  } else if (isProduction()) {
    log(`  created ${label}: ${account.email} (sample password, see docs/demo.md)`);
  } else {
    log(`  created ${label}: ${account.email} / ${account.password}`);
  }
}

// Creates the first admin, and only the first: once any admin exists (whatever
// its email, locked or not) nothing is created, so renaming the admin account
// does not bring the default one back on the next start.
async function ensureAdmin(pool, log) {
  const admins = await pool.query(
    "SELECT 1 FROM users WHERE role = 'admin' AND deleted_at IS NULL LIMIT 1"
  );
  if (admins.rows.length > 0) return;

  const account = getSeedAdmin();
  const taken = await pool.query("SELECT 1 FROM users WHERE LOWER(email) = $1", [account.email]);
  if (taken.rows.length > 0) {
    log(
      `  WARNING: there is no admin, and ${account.email} belongs to another (or a deleted) account. ` +
        "Set SEED_ADMIN_EMAIL to a free address and run the seed again, or make an existing " +
        "account the admin with: npm run admin:reset -- --email <email>"
    );
    return;
  }

  await insertUser(pool, account);
  logCreated(log, "admin", account);
}

async function seedGuest(pool, log) {
  const account = getSeedGuest();
  const existing = await pool.query("SELECT id FROM users WHERE LOWER(email) = $1", [account.email]);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const id = await insertUser(pool, account);
  logCreated(log, "sample guest", account);
  return id;
}

// Has anything ever been stored here? Checked before the admin is created,
// so a database that only holds its admin already counts as in use: sample
// rooms an owner deleted do not come back on the next start.
async function isEmptyDatabase(pool) {
  const result = await pool.query(
    `SELECT NOT (
       EXISTS (SELECT 1 FROM users) OR EXISTS (SELECT 1 FROM rooms)
       OR EXISTS (SELECT 1 FROM bookings) OR EXISTS (SELECT 1 FROM coupons)
     ) AS empty`
  );
  return result.rows[0].empty;
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

// One photo per destination from seed-assets/destinations, with the credit
// recorded in credits.json there. A destination that already has a photo
// (an earlier seed, or one an admin chose) is left alone.
async function seedDestinationImages(pool, log) {
  const creditsFile = path.join(DESTINATION_ASSETS_DIR, "credits.json");
  if (!fs.existsSync(creditsFile)) return;

  const credits = JSON.parse(fs.readFileSync(creditsFile, "utf8"));
  fs.mkdirSync(DESTINATION_UPLOAD_DIR, { recursive: true });
  let added = 0;

  for (const credit of credits) {
    const source = path.join(DESTINATION_ASSETS_DIR, credit.file);
    if (!fs.existsSync(source)) continue;

    const targetName = `seed-${credit.file}`;
    const target = path.join(DESTINATION_UPLOAD_DIR, targetName);
    if (!fs.existsSync(target)) fs.copyFileSync(source, target);

    const inserted = await pool.query(
      `INSERT INTO destination_images
         (name, image_url, place, credit_title, credit_author, credit_license,
          credit_license_url, credit_source_url, credit_changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (name) DO NOTHING
       RETURNING name`,
      [
        credit.destination,
        `/uploads/destinations/${targetName}`,
        credit.place,
        credit.title,
        credit.author,
        credit.license,
        credit.licenseUrl,
        credit.sourceUrl,
        credit.changes,
      ]
    );
    added += inserted.rows.length;
  }

  log(`  destination photos: ${added} added, ${credits.length - added} already set`);
}

// The first image in seed-assets/hero (none is bundled) becomes the home page
// background, unless one is already set.
async function seedHeroImage(pool, log) {
  if (!fs.existsSync(HERO_ASSETS_DIR)) return;
  const file = fs
    .readdirSync(HERO_ASSETS_DIR)
    .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort()[0];
  if (!file) return;

  fs.mkdirSync(BRANDING_UPLOAD_DIR, { recursive: true });
  const targetName = `seed-hero-${file}`;
  const target = path.join(BRANDING_UPLOAD_DIR, targetName);
  if (!fs.existsSync(target)) fs.copyFileSync(path.join(HERO_ASSETS_DIR, file), target);

  const result = await pool.query(
    `INSERT INTO property_settings (id, hero_image_url) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET hero_image_url = EXCLUDED.hero_image_url
       WHERE property_settings.hero_image_url IS NULL
     RETURNING id`,
    [`/uploads/branding/${targetName}`]
  );
  if (result.rows.length > 0) log(`  home page background: ${file}`);
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

// sampleData: "if-empty" (default) adds the sample guest, rooms, photos,
// coupon and bookings to an empty database only, or always with DEMO_MODE;
// "always" also tops up a database in use; "never" creates the admin only.
async function seed(pool, { log = console.log, allRooms = false, sampleData = "if-empty" } = {}) {
  log("Seeding database...");
  const withSampleData =
    sampleData === "always" ||
    (sampleData === "if-empty" && (isDemoMode() || (await isEmptyDatabase(pool))));

  await ensureAdmin(pool, log);

  if (withSampleData) {
    const guestId = await seedGuest(pool, log);
    const roomIds = await seedRooms(pool, log, { allRooms });
    await seedDestinationImages(pool, log);
    await seedHeroImage(pool, log);
    await seedCoupon(pool, log);
    await seedBookings(pool, log, { guestId, roomIds });
  } else if (sampleData === "if-empty") {
    log("  sample data: skipped, the database is already in use (--force adds it anyway)");
  }
  log("Seed complete");
}

module.exports = { seed, generatePassword, getSeedAccounts, DEFAULT_ADMIN_PASSWORD, DEFAULT_USER_PASSWORD };

if (require.main === module) {
  const pool = require("./db");
  const flag = (name) => process.argv.includes(name);
  const sampleData = flag("--admin-only") ? "never" : flag("--force") ? "always" : "if-empty";
  seed(pool, { allRooms: flag("--all-rooms"), sampleData })
    .then(() => pool.end())
    .catch((err) => {
      console.error("SEED FAILED:", err.message);
      process.exit(1);
    });
}
