const {
  TIME_PATTERN,
  getPropertySettings,
  getPropertySettingsForAdmin,
  parseDays,
  savePropertySettings,
} = require("../services/propertySettings");
const { removeUpload } = require("../services/storage");
const { demoAccounts, demoResetIntervalHours, isDemoMode } = require("../config/demo");
const { pngCopyOf } = require("../middleware/imageUpload");
const { apiMessage } = require("../utils/apiMessages");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s().]{6,30}$/;

const TEXT_LIMITS = { name: 100, phone: 30, email: 255, address: 255, heroTitle: 120, heroSubtitle: 300 };

// Lists for the home page. Each row is a few short texts; the first field
// named is the one a row cannot do without.
const LISTS = {
  amenities: { maxRows: 12, fields: { name: 80, description: 160 } },
  nearbyPlaces: { maxRows: 8, fields: { name: 80, note: 120, distance: 30 } },
};

// Public: what any visitor's browser needs to draw the site. Everything in
// here is information the property publishes anyway; the response is built
// field by field so nothing else can leak into it later by accident.
exports.getPublicSettings = async (req, res) => {
  const settings = await getPropertySettings();

  res.json({
    name: settings.name,
    logoUrl: settings.logoUrl,
    heroImageUrl: settings.heroImageUrl,
    heroTitle: settings.heroTitle,
    heroSubtitle: settings.heroSubtitle,
    amenities: settings.amenities,
    nearbyPlaces: settings.nearbyPlaces,
    phone: settings.phone,
    email: settings.email,
    address: settings.address,
    checkInTime: settings.checkInTime,
    checkOutTime: settings.checkOutTime,
    freeCancellationDays: settings.freeCancellationDays,
    // Only on a public demo: the sample sign-ins to show on the login page.
    ...(isDemoMode() ? { demo: { resetIntervalHours: demoResetIntervalHours(), accounts: demoAccounts() } } : {}),
  });
};

exports.getAdminSettings = async (req, res) => {
  try {
    res.json(await getPropertySettingsForAdmin());
  } catch (err) {
    console.error("GET SETTINGS ERROR:", err);
    res.status(500).json({ ...apiMessage("SERVER_ERROR") });
  }
};

// One list from the form: { rows } trimmed and with blank rows dropped, or
// { error }.
function validateList(field, input) {
  const { maxRows, fields } = LISTS[field];
  if (input === null) return { rows: [] };
  if (!Array.isArray(input)) return { error: apiMessage("INVALID_LIST", { field }) };

  const [required] = Object.keys(fields);
  const rows = [];
  for (const item of input) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { error: apiMessage("INVALID_LIST", { field }) };

    const row = {};
    for (const [key, max] of Object.entries(fields)) {
      const value = item[key] ?? "";
      if (typeof value !== "string") return { error: apiMessage("TEXT_REQUIRED_STRING", { field: key }) };
      if (value.trim().length > max) return { error: apiMessage("TEXT_TOO_LONG", { field: key, max }) };
      row[key] = value.trim();
    }

    if (Object.values(row).every((value) => value === "")) continue;
    if (!row[required]) return { error: apiMessage("LIST_ROW_NEEDS_NAME", { field }) };
    rows.push(row);
  }

  if (rows.length > maxRows) return { error: apiMessage("LIST_TOO_LONG", { field, max: maxRows }) };
  return { rows };
}

// Returns { values } to save, or { error }. A field that is absent is left
// alone; an empty one is cleared (the environment/default applies again).
function validateSettings(body) {
  const values = {};

  for (const field of Object.keys(LISTS)) {
    if (body[field] === undefined) continue;
    const { error, rows } = validateList(field, body[field]);
    if (error) return { error };
    values[field] = rows;
  }

  for (const field of ["name", "phone", "email", "address", "heroTitle", "heroSubtitle"]) {
    if (body[field] === undefined) continue;
    if (body[field] !== null && typeof body[field] !== "string") {
      return { error: apiMessage("TEXT_REQUIRED_STRING", { field }) };
    }
    const value = (body[field] || "").trim();
    if (value.length > TEXT_LIMITS[field]) {
      return { error: apiMessage("TEXT_TOO_LONG", { field, max: TEXT_LIMITS[field] }) };
    }
    values[field] = value || null;
  }

  if (values.email && !EMAIL_PATTERN.test(values.email)) {
    return { error: apiMessage("INVALID_EMAIL") };
  }
  if (values.phone && !PHONE_PATTERN.test(values.phone)) {
    return { error: apiMessage("INVALID_PHONE") };
  }

  for (const field of ["checkInTime", "checkOutTime"]) {
    if (body[field] === undefined) continue;
    const value = typeof body[field] === "string" ? body[field].trim() : "";
    if (value && !TIME_PATTERN.test(value)) {
      return { error: apiMessage("INVALID_TIME") };
    }
    values[field] = value || null;
  }

  if (body.freeCancellationDays !== undefined) {
    const raw = body.freeCancellationDays;
    if (raw === null || raw === "") {
      values.freeCancellationDays = null;
    } else {
      const days = parseDays(raw);
      if (days === null) {
        return { error: apiMessage("INVALID_CANCELLATION_DAYS") };
      }
      values.freeCancellationDays = days;
    }
  }

  return { values };
}

exports.updateSettings = async (req, res) => {
  try {
    const { error, values } = validateSettings(req.body || {});
    if (error) return res.status(400).json(error);

    const saved = await savePropertySettings(values);
    return res.json({ ...apiMessage("SETTINGS_SAVED"), ...saved });
  } catch (err) {
    console.error("UPDATE SETTINGS ERROR:", err);
    return res.status(500).json({ ...apiMessage("SERVER_ERROR") });
  }
};

// The logo and the home page background are both a single image kept in
// property_settings. The upload middleware has already checked the file
// really is an image and stored it; these record it and drop the previous
// file.
// Removes a stored branding image and, for a logo, its PNG copy.
function removeBrandingImage(reference, purpose) {
  removeUpload(reference, "branding", { purpose });
  const png = pngCopyOf(reference);
  if (png) removeUpload(png, "branding", { purpose: `${purpose} png` });
}

function imageSetting(setting, purpose, messages) {
  const upload = async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ ...apiMessage("NO_IMAGE_UPLOADED") });

      const previous = (await getPropertySettingsForAdmin()).stored[setting];
      const stored = req.file.storedPath;
      const saved = await savePropertySettings({ [setting]: stored });
      if (previous && previous !== stored) removeBrandingImage(previous, purpose);

      return res.status(201).json({ ...apiMessage(messages.saved), ...saved });
    } catch (err) {
      console.error(`UPLOAD ${purpose.toUpperCase()} ERROR:`, err);
      return res.status(500).json(apiMessage("SERVER_ERROR"));
    }
  };

  const remove = async (req, res) => {
    try {
      const previous = (await getPropertySettingsForAdmin()).stored[setting];
      const saved = await savePropertySettings({ [setting]: null });
      if (previous) removeBrandingImage(previous, purpose);

      return res.json({ ...apiMessage(messages.removed), ...saved });
    } catch (err) {
      console.error(`DELETE ${purpose.toUpperCase()} ERROR:`, err);
      return res.status(500).json(apiMessage("SERVER_ERROR"));
    }
  };

  return { upload, remove };
}

const logo = imageSetting("logoUrl", "logo", { saved: "LOGO_SAVED", removed: "LOGO_REMOVED" });
const hero = imageSetting("heroImageUrl", "hero", { saved: "HERO_SAVED", removed: "HERO_REMOVED" });

exports.uploadLogo = logo.upload;
exports.deleteLogo = logo.remove;
exports.uploadHero = hero.upload;
exports.deleteHero = hero.remove;
