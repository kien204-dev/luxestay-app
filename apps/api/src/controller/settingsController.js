const {
  TIME_PATTERN,
  getPropertySettings,
  getPropertySettingsForAdmin,
  parseDays,
  savePropertySettings,
} = require("../services/propertySettings");
const { BRANDING_UPLOAD_DIR } = require("../middleware/brandingUpload");
const { deleteLocalUploadFile } = require("../utils/localUploads");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s().]{6,30}$/;
const LOGO_MARKER = "/uploads/branding/";

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

function removeLogoFile(logoUrl) {
  deleteLocalUploadFile(logoUrl, BRANDING_UPLOAD_DIR, LOGO_MARKER, { purpose: "logo" });
}

// The upload middleware has already checked the file really is an image and
// stored it; this records it as the logo and drops the previous file.
exports.uploadLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image file uploaded" });

    const previous = (await getPropertySettingsForAdmin()).stored.logoUrl;
    const logoUrl = `${LOGO_MARKER}${req.file.filename}`;
    const saved = await savePropertySettings({ logoUrl });
    if (previous && previous !== logoUrl) removeLogoFile(previous);

    return res.status(201).json({ message: "Đã cập nhật logo", ...saved });
  } catch (err) {
    console.error("UPLOAD LOGO ERROR:", err);
    return res.status(500).json({ message: "Lỗi server khi lưu logo" });
  }
};

exports.deleteLogo = async (req, res) => {
  try {
    const previous = (await getPropertySettingsForAdmin()).stored.logoUrl;
    const saved = await savePropertySettings({ logoUrl: null });
    if (previous) removeLogoFile(previous);

    return res.json({ message: "Đã xóa logo", ...saved });
  } catch (err) {
    console.error("DELETE LOGO ERROR:", err);
    return res.status(500).json({ message: "Lỗi server khi xóa logo" });
  }
};
