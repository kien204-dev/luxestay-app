const pool = require("../db/db.js");
const { autoExpirePendingBookings, syncRoomStatus } = require("./bookingController.js");
const { removeUpload } = require("../services/storage.js");
const { DESTINATION_NAME_SQL, creditOf } = require("./destinationController.js");
const { findTextLimitError } = require("../utils/textLimits");
const { daysBetween, todayInAppTimezone } = require("../utils/time.js");

const ROOM_SORT_COLUMNS = {
  name: "room_name",
  price: "price",
  created_at: "created_at",
};
const ROOM_STATUSES = new Set(["available", "booked", "maintenance"]);
const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parsePositiveInteger(value, fallback) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function parseNonNegativeNumber(value) {
  if (value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function parseRoomPrice(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function parseDateOnly(value) {
  return typeof value === "string" && DATE_ONLY_PATTERN.test(value) ? value : null;
}

function hasRoomQuery(query) {
  return Object.keys(query).length > 0;
}

function deleteLocalRoomImageFile(imageValue, { roomId } = {}) {
  removeUpload(imageValue, "rooms", { roomId: roomId ?? null });
}

// ======================
// GET ALL ROOMS
// ======================
exports.getRooms = async (req, res) => {
  try {
    if (hasRoomQuery(req.query)) {
      const {
        q,
        status,
        location,
        minPrice,
        maxPrice,
        minCapacity,
        maxCapacity,
        sortBy = "created_at",
        sortOrder = "desc",
      } = req.query;

      const page = parsePositiveInteger(req.query.page, 1);
      const limit = Math.min(parsePositiveInteger(req.query.limit, 10), 100);
      const offset = (page - 1) * limit;
      const orderColumn = ROOM_SORT_COLUMNS[sortBy] || ROOM_SORT_COLUMNS.created_at;
      const orderDirection = String(sortOrder).toLowerCase() === "asc" ? "ASC" : "DESC";
      const filters = [];
      const values = [];

      if (q && String(q).trim()) {
        values.push(`%${String(q).trim()}%`);
        filters.push(`(room_name ILIKE $${values.length} OR room_type ILIKE $${values.length})`);
      }

      if (["available", "booked", "maintenance"].includes(status)) {
        values.push(status);
        filters.push(`status = $${values.length}`);
      }

      if (location && String(location).trim()) {
        values.push(`%${String(location).trim()}%`);
        filters.push(`location ILIKE $${values.length}`);
      }

      // Guest-facing lists never offer a room that cannot be booked at all.
      if (req.query.bookable === "true") {
        filters.push("status != 'maintenance'");
      }

      const parsedMinPrice = parseNonNegativeNumber(minPrice);
      if (parsedMinPrice !== null) {
        values.push(parsedMinPrice);
        filters.push(`price >= $${values.length}`);
      }

      const parsedMaxPrice = parseNonNegativeNumber(maxPrice);
      if (parsedMaxPrice !== null) {
        values.push(parsedMaxPrice);
        filters.push(`price <= $${values.length}`);
      }

      const parsedMinCapacity = parsePositiveInteger(minCapacity, null);
      if (parsedMinCapacity !== null) {
        values.push(parsedMinCapacity);
        filters.push(`capacity >= $${values.length}`);
      }

      const parsedMaxCapacity = parsePositiveInteger(maxCapacity, null);
      if (parsedMaxCapacity !== null) {
        values.push(parsedMaxCapacity);
        filters.push(`capacity <= $${values.length}`);
      }

      const parsedCheckIn = parseDateOnly(req.query.checkIn);
      const parsedCheckOut = parseDateOnly(req.query.checkOut);
      if (parsedCheckIn && parsedCheckOut && parsedCheckIn < parsedCheckOut) {
        // A pending booking that expired without confirmation must not keep
        // blocking the room from showing up as available.
        await autoExpirePendingBookings();

        values.push(ACTIVE_BOOKING_STATUSES);
        const statusIdx = values.length;
        values.push(parsedCheckOut);
        const checkOutIdx = values.length;
        values.push(parsedCheckIn);
        const checkInIdx = values.length;
        filters.push(`
          id NOT IN (
            SELECT room_id FROM bookings
            WHERE status = ANY($${statusIdx}::text[])
            AND check_in < $${checkOutIdx}::date
            AND check_out > $${checkInIdx}::date
          )
        `);
      }

      const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total FROM rooms ${whereClause}`,
        values
      );
      const total = Number(countResult.rows[0]?.total) || 0;

      const dataValues = [...values, limit, offset];
      const result = await pool.query(
        `SELECT id, room_name, room_type, price, description, capacity, image, status, location, created_at
         FROM rooms
         ${whereClause}
         ORDER BY ${orderColumn} ${orderDirection}, id ASC
         LIMIT $${values.length + 1}
         OFFSET $${values.length + 2}`,
        dataValues
      );

      return res.json({
        data: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    }

    const result = await pool.query(
      `SELECT id, room_name, room_type, price, description, capacity, image, status, location, created_at
       FROM rooms
       ORDER BY id ASC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

// ======================
// GET DISTINCT ROOM LOCATIONS (for the customer search dropdown)
// ======================
exports.getRoomLocations = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT location FROM rooms
       WHERE location IS NOT NULL AND location != ''
       ORDER BY location ASC`
    );

    res.json(result.rows.map((row) => row.location));
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

// ======================
// GET DESTINATIONS (public landing page)
// ======================
// Rooms grouped by the last part of their location ("Hoàn Kiếm, Hà Nội" ->
// "Hà Nội"), with real counts and a starting price, so the landing page
// shows where the property actually has rooms instead of invented places.
exports.getRoomDestinations = async (req, res) => {
  try {
    // The destination's own photo when it has one, else the first room
    // photo there; the web app draws a placeholder when both are missing.
    const result = await pool.query(
      `WITH places AS (
         SELECT ${DESTINATION_NAME_SQL} AS name,
                COUNT(*)::int AS room_count,
                MIN(price) AS min_price,
                (ARRAY_AGG(image ORDER BY id) FILTER (WHERE image IS NOT NULL))[1] AS room_image
         FROM rooms
         WHERE location IS NOT NULL AND location != '' AND status != 'maintenance'
         GROUP BY 1
         ORDER BY room_count DESC, name ASC
         LIMIT 12
       )
       SELECT p.name, p.room_count, p.min_price, COALESCE(d.image_url, p.room_image) AS image,
              d.place, d.credit_title, d.credit_author, d.credit_license,
              d.credit_license_url, d.credit_source_url
       FROM places p
       LEFT JOIN destination_images d ON d.name = p.name
       ORDER BY p.room_count DESC, p.name ASC`
    );

    res.json(
      result.rows
        .filter((row) => row.name)
        .map((row) => ({
          name: row.name,
          room_count: row.room_count,
          min_price: row.min_price,
          image: row.image,
          place: row.place || null,
          credit: creditOf(row),
        }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

const AVAILABILITY_DEFAULT_DAYS = 62;
const AVAILABILITY_MAX_DAYS = 186;

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ======================
// GET ROOM AVAILABILITY (public)
// ======================
// Which nights of one room are already taken, for the guest-facing calendar.
// Deliberately returns dates only: nothing about who booked, how many
// bookings there are, their status or their price.
exports.getRoomAvailability = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Room id must be a positive integer" });

    const today = todayInAppTimezone();
    const from = req.query.from === undefined ? today : parseDateOnly(req.query.from);
    const to =
      req.query.to === undefined
        ? from && addDays(from, AVAILABILITY_DEFAULT_DAYS)
        : parseDateOnly(req.query.to);

    if (!from || !to || to <= from) {
      return res.status(400).json({ message: "from/to phải là ngày hợp lệ (YYYY-MM-DD) và to sau from" });
    }
    if (daysBetween(from, to) > AVAILABILITY_MAX_DAYS) {
      return res.status(400).json({
        message: `Khoảng ngày tối đa là ${AVAILABILITY_MAX_DAYS} ngày`,
      });
    }

    const room = await pool.query("SELECT status FROM rooms WHERE id = $1", [id]);
    if (room.rows.length === 0) {
      return res.status(404).json({ message: "Room not found" });
    }

    await autoExpirePendingBookings();

    const taken = await pool.query(
      `SELECT check_in, check_out FROM bookings
       WHERE room_id = $1
       AND status = ANY($2::text[])
       AND check_in < $4::date
       AND check_out > $3::date`,
      [id, ACTIVE_BOOKING_STATUSES, from, to]
    );

    // A stay occupies its nights: check-in day up to, not including, checkout.
    const unavailable = new Set();
    for (const row of taken.rows) {
      const start = String(row.check_in).slice(0, 10);
      const end = String(row.check_out).slice(0, 10);
      for (let day = start > from ? start : from; day < end && day < to; day = addDays(day, 1)) {
        unavailable.add(day);
      }
    }

    res.json({
      room_id: id,
      from,
      to,
      today,
      bookable: room.rows[0].status !== "maintenance",
      unavailable: [...unavailable].sort(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

// ======================
// GET ROOM BY ID
// ======================
exports.getRoomById = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Room id must be a positive integer" });

    const result = await pool.query(
      `SELECT id, room_name, room_type, price, description, capacity, image, status, location, created_at
       FROM rooms
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Room not found",
      });
    }

    const imagesResult = await pool.query(
      `SELECT id, image_path FROM room_images WHERE room_id = $1 ORDER BY sort_order ASC, id ASC`,
      [id]
    );

    res.json({
      ...result.rows[0],
      images: imagesResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

// ======================
// CREATE ROOM
// ======================
exports.createRoom = async (req, res) => {
  try {
    const {
      room_name,
      room_type,
      price,
      description,
      capacity,
      image,
      status,
      location,
    } = req.body;

    if (!room_name || !room_type || price === undefined || price === null) {
      return res.status(400).json({
        message: "room_name, room_type và price là bắt buộc",
      });
    }

    const lengthError = findTextLimitError({ room_name, room_type, location });
    if (lengthError) {
      return res.status(400).json({
        message: lengthError,
      });
    }

    const parsedPrice = parseRoomPrice(price);
    const parsedCapacity = parsePositiveInteger(capacity, null);

    if (parsedPrice === null) {
      return res.status(400).json({
        message: "Price must be a valid number greater than 0",
      });
    }

    if (parsedCapacity === null) {
      return res.status(400).json({
        message: "Capacity must be a positive integer",
      });
    }

    const roomStatus = status || "available";
    if (!ROOM_STATUSES.has(roomStatus)) {
      return res.status(400).json({ message: "Room status is invalid" });
    }

    const result = await pool.query(
      `INSERT INTO rooms(room_name, room_type, price, description, capacity, image, status, location)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, room_name, room_type, price, description, capacity, image, status, location, created_at`,
      [
        room_name,
        room_type,
        parsedPrice,
        description || null,
        parsedCapacity,
        image || null,
        roomStatus,
        location || null,
      ]
    );

    res.status(201).json({
      message: "Tạo phòng thành công",
      room: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

// ======================
// UPDATE ROOM
// ======================
exports.updateRoom = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Room id must be a positive integer" });

    const {
      room_name,
      room_type,
      price,
      description,
      capacity,
      image,
      status,
      location,
    } = req.body;

    if (!room_name || !room_type) {
      return res.status(400).json({
        message: "room_name and room_type are required",
      });
    }

    const lengthError = findTextLimitError({ room_name, room_type, location });
    if (lengthError) {
      return res.status(400).json({
        message: lengthError,
      });
    }

    const parsedPrice = parseRoomPrice(price);
    const parsedCapacity = parsePositiveInteger(capacity, null);

    if (parsedPrice === null) {
      return res.status(400).json({
        message: "Price must be a valid number greater than 0",
      });
    }

    if (parsedCapacity === null) {
      return res.status(400).json({
        message: "Capacity must be a positive integer",
      });
    }

    if (status && !ROOM_STATUSES.has(status)) {
      return res.status(400).json({ message: "Room status is invalid" });
    }

    const existing = await pool.query("SELECT image, status FROM rooms WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        message: "Room not found",
      });
    }
    // Leaving status out keeps whatever the room had.
    const roomStatus = status || existing.rows[0].status;
    const previousImage = existing.rows[0].image;

    const result = await pool.query(
      `UPDATE rooms
       SET
         room_name = $1,
         room_type = $2,
         price = $3,
         description = $4,
         capacity = $5,
         image = $6,
         status = $7,
         location = $8
       WHERE id = $9
       RETURNING id, room_name, room_type, price, description, capacity, image, status, location, created_at`,
      [
        room_name,
        room_type,
        parsedPrice,
        description || null,
        parsedCapacity,
        image || null,
        roomStatus,
        location || null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Room not found",
      });
    }

    const newImage = result.rows[0].image;
    if (previousImage && previousImage !== newImage) {
      deleteLocalRoomImageFile(previousImage, { roomId: id });
    }

    // "available" and "booked" are derived from the room's bookings, so the
    // only thing an admin really sets here is maintenance on/off. Anything
    // else is recomputed rather than trusted.
    if (roomStatus !== "maintenance") {
      await syncRoomStatus(pool, id);
      const synced = await pool.query("SELECT status FROM rooms WHERE id = $1", [id]);
      result.rows[0].status = synced.rows[0]?.status ?? result.rows[0].status;
    }

    res.json({
      message: "Cập nhật phòng thành công",
      room: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

// ======================
// DELETE ROOM
// ======================
exports.deleteRoom = async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Room id must be a positive integer" });

    // Chặn xóa phòng nếu đang có booking tham chiếu tới nó
    const bookingCheck = await pool.query(
      "SELECT id FROM bookings WHERE room_id = $1 LIMIT 1",
      [id]
    );

    if (bookingCheck.rows.length > 0) {
      return res.status(400).json({
        message:
          "Không thể xóa phòng này vì đã có booking liên quan. Hãy đổi trạng thái phòng thay vì xóa.",
      });
    }

    const roomRow = await pool.query("SELECT image FROM rooms WHERE id = $1", [id]);
    const galleryRows = await pool.query(
      "SELECT image_path FROM room_images WHERE room_id = $1",
      [id]
    );

    const result = await pool.query(
      "DELETE FROM rooms WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "Room not found",
      });
    }

    deleteLocalRoomImageFile(roomRow.rows[0]?.image, { roomId: id });
    galleryRows.rows.forEach((row) =>
      deleteLocalRoomImageFile(row.image_path, { roomId: id })
    );

    res.json({
      message: "Xóa phòng thành công",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

// ======================
// ADD ROOM GALLERY IMAGE
// ======================
exports.addRoomImage = async (req, res) => {
  try {
    const roomId = parseId(req.params.id);
    if (!roomId) {
      return res.status(400).json({ message: "Room id must be a positive integer" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No image file uploaded" });
    }

    const roomCheck = await pool.query("SELECT id FROM rooms WHERE id = $1", [roomId]);
    if (roomCheck.rows.length === 0) {
      deleteLocalRoomImageFile(req.file.storedPath, { roomId });
      return res.status(404).json({ message: "Room not found" });
    }

    const imagePath = req.file.storedPath;
    const result = await pool.query(
      `INSERT INTO room_images (room_id, image_path)
       VALUES ($1, $2)
       RETURNING id, image_path`,
      [roomId, imagePath]
    );

    res.status(201).json({
      message: "Thêm ảnh phòng thành công",
      image: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

// ======================
// DELETE ROOM GALLERY IMAGE
// ======================
exports.deleteRoomImage = async (req, res) => {
  try {
    const roomId = parseId(req.params.id);
    const imageId = parseId(req.params.imageId);

    if (!roomId || !imageId) {
      return res.status(400).json({ message: "Id must be a positive integer" });
    }

    const result = await pool.query(
      "DELETE FROM room_images WHERE id = $1 AND room_id = $2 RETURNING image_path",
      [imageId, roomId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Room image not found" });
    }

    deleteLocalRoomImageFile(result.rows[0].image_path, { roomId });

    res.json({ message: "Xóa ảnh phòng thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};
