const {
  TIME_PATTERN,
  getPropertySettings,
  getPropertySettingsForAdmin,
  parseDays,
  savePropertySettings,
} = require("../services/propertySettings");
const { removeUpload } = require("../services/storage");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s().]{6,30}$/;

const TEXT_LIMITS = { name: 100, phone: 30, email: 255, address: 255 };
const FIELD_LABELS = { name: "Tên", phone: "Số điện thoại", email: "Email", address: "Địa chỉ" };

// Public: what any visitor's browser needs to draw the site. Everything in
// here is information the property publishes anyway; the response is built
// field by field so nothing else can leak into it later by accident.
exports.getPublicSettings = async (req, res) => {
  const settings = await getPropertySettings();

  res.json({
    name: settings.name,
    logoUrl: settings.logoUrl,
    heroImageUrl: settings.heroImageUrl,
    phone: settings.phone,
    email: settings.email,
    address: settings.address,
    checkInTime: settings.checkInTime,
    checkOutTime: settings.checkOutTime,
    freeCancellationDays: settings.freeCancellationDays,
  });
};

exports.getAdminSettings = async (req, res) => {
  try {
    res.json(await getPropertySettingsForAdmin());
  } catch (err) {
    console.error("GET SETTINGS ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi tải cấu hình" });
  }
};

// Returns { values } to save, or { error }. A field that is absent is left
// alone; an empty one is cleared (the environment/default applies again).
function validateSettings(body) {
  const values = {};

  for (const field of ["name", "phone", "email", "address"]) {
    if (body[field] === undefined) continue;
    if (body[field] !== null && typeof body[field] !== "string") {
      return { error: `${FIELD_LABELS[field]} phải là chữ` };
    }
    const value = (body[field] || "").trim();
    if (value.length > TEXT_LIMITS[field]) {
      return { error: `${FIELD_LABELS[field]} không được dài quá ${TEXT_LIMITS[field]} ký tự` };
    }
    values[field] = value || null;
  }

  if (values.email && !EMAIL_PATTERN.test(values.email)) {
    return { error: "Email không hợp lệ" };
  }
  if (values.phone && !PHONE_PATTERN.test(values.phone)) {
    return { error: "Số điện thoại không hợp lệ" };
  }

  for (const field of ["checkInTime", "checkOutTime"]) {
    if (body[field] === undefined) continue;
    const value = typeof body[field] === "string" ? body[field].trim() : "";
    if (value && !TIME_PATTERN.test(value)) {
      return { error: "Giờ nhận/trả phòng phải có dạng HH:MM (ví dụ 14:00)" };
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
        return { error: "Số ngày hủy miễn phí phải là số nguyên từ 0 đến 365" };
      }
      values.freeCancellationDays = days;
    }
  }

  return { values };
}

exports.updateSettings = async (req, res) => {
  try {
    const { error, values } = validateSettings(req.body || {});
    if (error) return res.status(400).json({ message: error });

    const saved = await savePropertySettings(values);
    return res.json({ message: "Đã lưu cấu hình", ...saved });
  } catch (err) {
    console.error("UPDATE SETTINGS ERROR:", err);
    return res.status(500).json({ message: "Lỗi server khi lưu cấu hình" });
  }
};

// The logo and the home page background are both a single image kept in
// property_settings. The upload middleware has already checked the file
// really is an image and stored it; these record it and drop the previous
// file.
function imageSetting(setting, purpose, messages) {
  const upload = async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No image file uploaded" });

      const previous = (await getPropertySettingsForAdmin()).stored[setting];
      const stored = req.file.storedPath;
      const saved = await savePropertySettings({ [setting]: stored });
      if (previous && previous !== stored) removeUpload(previous, "branding", { purpose });

      return res.status(201).json({ message: messages.saved, ...saved });
    } catch (err) {
      console.error(`UPLOAD ${purpose.toUpperCase()} ERROR:`, err);
      return res.status(500).json({ message: messages.failed });
    }
  };

  const remove = async (req, res) => {
    try {
      const previous = (await getPropertySettingsForAdmin()).stored[setting];
      const saved = await savePropertySettings({ [setting]: null });
      if (previous) removeUpload(previous, "branding", { purpose });

      return res.json({ message: messages.removed, ...saved });
    } catch (err) {
      console.error(`DELETE ${purpose.toUpperCase()} ERROR:`, err);
      return res.status(500).json({ message: messages.failed });
    }
  };

  return { upload, remove };
}

const logo = imageSetting("logoUrl", "logo", {
  saved: "Đã cập nhật logo",
  removed: "Đã xóa logo",
  failed: "Lỗi server khi lưu logo",
});
const hero = imageSetting("heroImageUrl", "hero", {
  saved: "Đã cập nhật ảnh nền trang chủ",
  removed: "Đã xóa ảnh nền trang chủ",
  failed: "Lỗi server khi lưu ảnh nền",
});

exports.uploadLogo = logo.upload;
exports.deleteLogo = logo.remove;
exports.uploadHero = hero.upload;
exports.deleteHero = hero.remove;
