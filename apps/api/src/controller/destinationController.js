const pool = require("../db/db.js");
const { removeUpload } = require("../services/storage.js");

// A destination is the part of a room's location after the last comma
// ("Hoàn Kiếm, Hà Nội" -> "Hà Nội"). Its photo lives in destination_images,
// keyed by that name, together with the credit the photo's licence asks for.
const DESTINATION_NAME_SQL = "TRIM(SUBSTRING(location FROM '[^,]*$'))";

const NAME_MAX = 100;
const CREDIT_FIELDS = {
  place: { column: "place", max: 255 },
  title: { column: "credit_title", max: 255 },
  author: { column: "credit_author", max: 255 },
  license: { column: "credit_license", max: 100 },
  licenseUrl: { column: "credit_license_url", max: 500, url: true },
  sourceUrl: { column: "credit_source_url", max: 500, url: true },
  changes: { column: "credit_changes", max: 500 },
};

function creditOf(row) {
  if (!row || !row.credit_license) return null;
  return {
    title: row.credit_title,
    author: row.credit_author,
    license: row.credit_license,
    licenseUrl: row.credit_license_url,
    sourceUrl: row.credit_source_url,
  };
}

// Returns { values: {column: value|null} } or { error }. Absent fields are
// left out; empty ones are cleared.
function parseCredit(body) {
  const values = {};
  for (const [field, rule] of Object.entries(CREDIT_FIELDS)) {
    if (body[field] === undefined) continue;
    if (body[field] !== null && typeof body[field] !== "string") return { error: `${field} phải là chữ` };

    const value = (body[field] || "").trim();
    if (value.length > rule.max) return { error: `${field} không được dài quá ${rule.max} ký tự` };
    if (value && rule.url && !/^https?:\/\/\S+$/i.test(value)) return { error: `${field} phải là địa chỉ http(s)` };
    values[rule.column] = value || null;
  }
  return { values };
}

async function destinationExists(name) {
  const result = await pool.query(
    `SELECT 1 FROM rooms WHERE location IS NOT NULL AND ${DESTINATION_NAME_SQL} = $1 LIMIT 1`,
    [name]
  );
  return result.rows.length > 0;
}

function readName(req) {
  const name = typeof req.params.name === "string" ? req.params.name.trim() : "";
  return name && name.length <= NAME_MAX ? name : null;
}

// Public: every destination photo that carries a licence, for the credits
// page.
exports.getDestinationCredits = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT name, image_url, place, credit_title, credit_author, credit_license,
              credit_license_url, credit_source_url, credit_changes
       FROM destination_images
       WHERE credit_license IS NOT NULL
       ORDER BY name`
    );
    res.json(
      result.rows.map((row) => ({
        name: row.name,
        image: row.image_url || null,
        place: row.place,
        changes: row.credit_changes,
        ...creditOf(row),
      }))
    );
  } catch (err) {
    console.error("DESTINATION CREDITS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin: every destination the rooms mention (plus any that only has a
// photo left), with its photo and credit.
exports.getDestinationsForAdmin = async (req, res) => {
  try {
    const result = await pool.query(
      `WITH names AS (
         SELECT ${DESTINATION_NAME_SQL} AS name, COUNT(*)::int AS room_count
         FROM rooms
         WHERE location IS NOT NULL AND location != ''
         GROUP BY 1
       )
       SELECT COALESCE(n.name, d.name) AS name, COALESCE(n.room_count, 0) AS room_count,
              d.image_url, d.place, d.credit_title, d.credit_author, d.credit_license,
              d.credit_license_url, d.credit_source_url, d.credit_changes
       FROM names n
       FULL OUTER JOIN destination_images d ON d.name = n.name
       WHERE COALESCE(n.name, d.name) <> ''
       ORDER BY room_count DESC, name ASC`
    );
    res.json(
      result.rows.map((row) => ({
        name: row.name,
        roomCount: row.room_count,
        image: row.image_url || null,
        place: row.place || "",
        title: row.credit_title || "",
        author: row.credit_author || "",
        license: row.credit_license || "",
        licenseUrl: row.credit_license_url || "",
        sourceUrl: row.credit_source_url || "",
        changes: row.credit_changes || "",
      }))
    );
  } catch (err) {
    console.error("ADMIN DESTINATIONS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Admin: a new photo for one destination. The credit of the photo it
// replaces no longer applies, so it is cleared unless new credit fields come
// with the upload.
exports.uploadDestinationImage = async (req, res) => {
  try {
    const name = readName(req);
    if (!name) return res.status(400).json({ message: "Tên điểm đến không hợp lệ" });
    if (!req.file) return res.status(400).json({ message: "No image file uploaded" });

    const stored = req.file.storedPath;
    if (!(await destinationExists(name))) {
      removeUpload(stored, "destinations", { destination: name });
      return res.status(404).json({ message: "Không có phòng nào ở điểm đến này" });
    }

    const { error, values } = parseCredit(req.body || {});
    if (error) {
      removeUpload(stored, "destinations", { destination: name });
      return res.status(400).json({ message: error });
    }

    const credit = Object.fromEntries(Object.values(CREDIT_FIELDS).map((rule) => [rule.column, values[rule.column] ?? null]));
    const columns = Object.keys(credit);

    const previous = await pool.query("SELECT image_url FROM destination_images WHERE name = $1", [name]);
    await pool.query(
      `INSERT INTO destination_images (name, image_url, ${columns.join(", ")}, updated_at)
       VALUES ($1, $2, ${columns.map((_, i) => `$${i + 3}`).join(", ")}, NOW())
       ON CONFLICT (name) DO UPDATE SET image_url = EXCLUDED.image_url,
         ${columns.map((column) => `${column} = EXCLUDED.${column}`).join(", ")}, updated_at = NOW()`,
      [name, stored, ...Object.values(credit)]
    );

    const old = previous.rows[0]?.image_url;
    if (old && old !== stored) removeUpload(old, "destinations", { destination: name });

    return res.status(201).json({ message: "Đã cập nhật ảnh điểm đến", name, image: stored });
  } catch (err) {
    console.error("UPLOAD DESTINATION IMAGE ERROR:", err);
    return res.status(500).json({ message: "Lỗi server khi lưu ảnh điểm đến" });
  }
};

// Admin: correct the credit of a destination's current photo.
exports.updateDestinationCredit = async (req, res) => {
  try {
    const name = readName(req);
    if (!name) return res.status(400).json({ message: "Tên điểm đến không hợp lệ" });

    const { error, values } = parseCredit(req.body || {});
    if (error) return res.status(400).json({ message: error });

    const columns = Object.keys(values);
    if (columns.length === 0) return res.status(400).json({ message: "Không có gì để lưu" });

    const result = await pool.query(
      `UPDATE destination_images
       SET ${columns.map((column, i) => `${column} = $${i + 2}`).join(", ")}, updated_at = NOW()
       WHERE name = $1
       RETURNING name`,
      [name, ...Object.values(values)]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Điểm đến này chưa có ảnh" });

    return res.json({ message: "Đã lưu ghi công ảnh" });
  } catch (err) {
    console.error("UPDATE DESTINATION CREDIT ERROR:", err);
    return res.status(500).json({ message: "Lỗi server khi lưu ghi công ảnh" });
  }
};

// Admin: remove a destination's photo (the card falls back to a room photo,
// then to the drawn placeholder).
exports.deleteDestinationImage = async (req, res) => {
  try {
    const name = readName(req);
    if (!name) return res.status(400).json({ message: "Tên điểm đến không hợp lệ" });

    const result = await pool.query("DELETE FROM destination_images WHERE name = $1 RETURNING image_url", [name]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Điểm đến này chưa có ảnh" });

    removeUpload(result.rows[0].image_url, "destinations", { destination: name });
    return res.json({ message: "Đã xóa ảnh điểm đến" });
  } catch (err) {
    console.error("DELETE DESTINATION IMAGE ERROR:", err);
    return res.status(500).json({ message: "Lỗi server khi xóa ảnh điểm đến" });
  }
};

exports.DESTINATION_NAME_SQL = DESTINATION_NAME_SQL;
exports.creditOf = creditOf;
