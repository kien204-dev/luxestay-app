const pool = require("../db/db.js");

// The property's identity and house rules, resolved in this order:
//   1. what an admin saved in the property_settings table
//   2. the environment variable for that setting
//   3. a built-in default
// so a fresh install works from .env alone and an admin can later change
// things without a rebuild or restart.

const DEFAULTS = {
  name: "LuxeStay",
  logoUrl: "",
  phone: "",
  email: "",
  address: "",
  checkInTime: "14:00",
  checkOutTime: "12:00",
  freeCancellationDays: 3,
};

// setting -> [database column, environment variable]
const SOURCES = {
  name: ["name", "APP_NAME"],
  logoUrl: ["logo_url", null],
  phone: ["phone", "CONTACT_PHONE"],
  email: ["email", "CONTACT_EMAIL"],
  address: ["address", "CONTACT_ADDRESS"],
  checkInTime: ["check_in_time", "CHECK_IN_TIME"],
  checkOutTime: ["check_out_time", "CHECK_OUT_TIME"],
  freeCancellationDays: ["free_cancellation_days", "FREE_CANCELLATION_DAYS"],
};

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const CACHE_TTL_MS = 30 * 1000;

let cache = null;

function isSet(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function parseDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 0 && days <= 365 ? days : null;
}

// One setting from the environment, or undefined when unset/invalid there.
function fromEnv(setting) {
  const envName = SOURCES[setting][1];
  const raw = envName ? process.env[envName] : undefined;
  if (!isSet(raw)) return undefined;

  if (setting === "freeCancellationDays") return parseDays(raw) ?? undefined;
  if (setting === "checkInTime" || setting === "checkOutTime") {
    return TIME_PATTERN.test(raw.trim()) ? raw.trim() : undefined;
  }
  return raw.trim();
}

function resolve(row) {
  const settings = {};
  for (const [setting, [column]] of Object.entries(SOURCES)) {
    const stored = row ? row[column] : null;
    settings[setting] = isSet(stored) ? stored : fromEnv(setting) ?? DEFAULTS[setting];
  }
  return settings;
}

async function readRow() {
  const result = await pool.query("SELECT * FROM property_settings WHERE id = 1");
  return result.rows[0] || null;
}

// Effective settings. Cached briefly because nearly every email, PDF and
// policy check asks for them; saving new settings clears the cache at once.
// A database problem must not take bookings down with it, so on failure this
// falls back to environment/defaults.
async function getPropertySettings() {
  const useCache = process.env.NODE_ENV !== "test";
  if (useCache && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  let value;
  try {
    value = resolve(await readRow());
  } catch (err) {
    console.error("PROPERTY SETTINGS UNAVAILABLE, using environment/defaults:", err.message);
    return resolve(null);
  }

  cache = { value, at: Date.now() };
  return value;
}

// For the admin form: what is stored (null = not set) next to what applies
// when it is not set, so the form can show the fallback as a hint.
async function getPropertySettingsForAdmin() {
  const row = await readRow();
  const stored = {};
  for (const [setting, [column]] of Object.entries(SOURCES)) {
    stored[setting] = row && isSet(row[column]) ? row[column] : null;
  }
  return { stored, fallback: resolve(null), effective: resolve(row) };
}

// values: { setting: value | null }. null (or empty) clears the stored value
// so the fallback applies again. Only the settings present are touched.
async function savePropertySettings(values) {
  const settings = Object.keys(values).filter((setting) => SOURCES[setting]);
  if (settings.length === 0) return getPropertySettingsForAdmin();

  const columns = settings.map((setting) => SOURCES[setting][0]);
  const params = settings.map((setting) => (isSet(values[setting]) ? values[setting] : null));
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const updates = columns.map((column) => `${column} = EXCLUDED.${column}`);

  await pool.query(
    `INSERT INTO property_settings (id, ${columns.join(", ")}, updated_at)
     VALUES (1, ${placeholders.join(", ")}, NOW())
     ON CONFLICT (id) DO UPDATE SET ${updates.join(", ")}, updated_at = NOW()`,
    params
  );

  cache = null;
  return getPropertySettingsForAdmin();
}

module.exports = {
  DEFAULTS,
  SOURCES,
  TIME_PATTERN,
  getPropertySettings,
  getPropertySettingsForAdmin,
  parseDays,
  savePropertySettings,
};
