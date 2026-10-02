const pool = require("../db/db.js");
const bcrypt = require("bcryptjs");
const { setAuthCookie } = require("../services/authSession");
const { removeUpload } = require("../services/storage.js");
const { isStrongPassword, PASSWORD_RULE_MESSAGE } = require("../utils/password");
const { findTextLimitError } = require("../utils/textLimits");

const ALLOWED_ROLES = ["admin", "user"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+\-\s()]{8,20}$/;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateEmail(email) {
  return EMAIL_PATTERN.test(email);
}

const AVATAR_URL_MAX_LENGTH = 2048;

// An avatar is either one of our own uploads or an external http(s) image.
function validateAvatarUrl(avatarUrl) {
  if (!avatarUrl) return true;
  if (avatarUrl.length > AVATAR_URL_MAX_LENGTH) return false;
  return /^https?:///i.test(avatarUrl) || avatarUrl.startsWith("/uploads/avatars/");
}

function validatePhone(phone) {
  if (!phone) return true;
  return typeof phone === "string" && PHONE_PATTERN.test(phone.trim());
}

function validateRole(role) {
  return ALLOWED_ROLES.includes(role);
}

function parsePositiveInteger(value) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null;
}

function isForeignKeyError(err) {
  return err?.code === "23503";
}

function publicUserSelect() {
  return "id, name, email, role, phone, bio, avatar_url, created_at, updated_at, must_change_password, is_locked";
}

// ======================
// GET ALL USERS
// ======================
exports.getUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${publicUserSelect()}
       FROM users
       WHERE deleted_at IS NULL
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
// GET USER BY ID
// ======================
exports.getUserById = async (req, res) => {
  try {
    const id = parsePositiveInteger(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "User id is invalid",
      });
    }

    const result = await pool.query(
      `SELECT ${publicUserSelect()}
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

// ======================
// CREATE USER
// ======================
exports.createUser = async (req, res) => {
  try {
    const name = normalizeString(req.body.name);
    const email = normalizeString(req.body.email).toLowerCase();
    const password = req.body.password;
    const role = normalizeString(req.body.role) || "user";
    const phone = normalizeString(req.body.phone);

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email và password là bắt buộc",
      });
    }

    const lengthError = findTextLimitError({ name, email });
    if (lengthError) {
      return res.status(400).json({
        message: lengthError,
      });
    }

    // Kiểm tra email tồn tại
    if (!validateEmail(email)) {
      return res.status(400).json({
        message: "Email is invalid",
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: PASSWORD_RULE_MESSAGE,
      });
    }

    if (!validatePhone(phone)) {
      return res.status(400).json({
        message: "Phone is invalid",
      });
    }

    if (!validateRole(role)) {
      return res.status(400).json({
        message: "Role must be admin or user",
      });
    }

    const checkEmail = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (checkEmail.rows.length > 0) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users(name,email,password,role,phone,must_change_password)
       VALUES($1,$2,$3,$4,$5,TRUE)
       RETURNING ${publicUserSelect()}`,
      [
        name,
        email,
        hashedPassword,
        role,
        phone || null
      ]
    );

    res.status(201).json({
      message: "User created successfully",
      user: result.rows[0],
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server error",
    });
  }
};

// ======================
// UPDATE USER
// ======================
exports.updateUser = async (req, res) => {
  try {

    const id = parsePositiveInteger(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "User id is invalid",
      });
    }

    const name = normalizeString(req.body.name);
    const email = normalizeString(req.body.email).toLowerCase();
    const role = normalizeString(req.body.role) || "user";
    const password = req.body.password;
    const phone = normalizeString(req.body.phone);

    if (!name || !email) {
      return res.status(400).json({
        message: "Name and email are required",
      });
    }

    const lengthError = findTextLimitError({ name, email });
    if (lengthError) {
      return res.status(400).json({
        message: lengthError,
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        message: "Email is invalid",
      });
    }

    if (password && !isStrongPassword(password)) {
      return res.status(400).json({
        message: PASSWORD_RULE_MESSAGE,
      });
    }

    if (!validatePhone(phone)) {
      return res.status(400).json({
        message: "Phone is invalid",
      });
    }

    if (!validateRole(role)) {
      return res.status(400).json({
        message: "Role must be admin or user",
      });
    }

    if (id === req.user.id && role !== "admin") {
      return res.status(400).json({
        message: "You cannot remove your own admin role",
      });
    }

    const duplicateEmail = await pool.query(
      "SELECT id FROM users WHERE email = $1 AND id != $2",
      [email, id]
    );

    if (duplicateEmail.rows.length > 0) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    let query;
    let values;

    if (password) {

      const hashedPassword = await bcrypt.hash(password,10);

      query = `
      UPDATE users
      SET
      name=$1,
      email=$2,
      role=$3,
      password=$4,
      phone=$5,
      token_version=token_version + 1,
      must_change_password=TRUE,
      updated_at=CURRENT_TIMESTAMP
      WHERE id=$6 AND deleted_at IS NULL
      RETURNING ${publicUserSelect()}
      `;

      values = [
        name,
        email,
        role,
        hashedPassword,
        phone || null,
        id
      ];

    } else {

      query = `
      UPDATE users
      SET
      name=$1,
      email=$2,
      role=$3,
      phone=$4,
      token_version=token_version + CASE WHEN role IS DISTINCT FROM $3 THEN 1 ELSE 0 END,
      updated_at=CURRENT_TIMESTAMP
      WHERE id=$5 AND deleted_at IS NULL
      RETURNING ${publicUserSelect()}
      `;

      values = [
        name,
        email,
        role,
        phone || null,
        id
      ];

    }

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {

      return res.status(404).json({
        message: "User not found",
      });

    }

    res.json({
      message: "User updated successfully",
      user: result.rows[0],
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server error",
    });

  }
};

// ======================
// DELETE USER
// ======================
exports.deleteUser = async (req, res) => {

  try {

    const id = parsePositiveInteger(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "User id is invalid",
      });
    }

    if (id === req.user.id) {
      return res.status(400).json({
        message: "You cannot delete your own account",
      });
    }

    const result = await pool.query(
      `UPDATE users
       SET deleted_at=CURRENT_TIMESTAMP,
           token_version=token_version + 1,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND deleted_at IS NULL
       RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {

      return res.status(404).json({
        message: "User not found",
      });

    }

    res.json({
      message: "User deleted successfully",
    });

  } catch (err) {
    if (isForeignKeyError(err)) {
      return res.status(400).json({
        message: "Cannot delete user because related records exist",
      });
    }

    console.error(err);

    res.status(500).json({
      message: "Server error",
    });

  }

};

// ======================
// LOCK / UNLOCK USER
// ======================
exports.setUserLock = async (req, res) => {
  try {
    const id = parsePositiveInteger(req.params.id);

    if (!id) {
      return res.status(400).json({
        message: "User id is invalid",
      });
    }

    if (typeof req.body.locked !== "boolean") {
      return res.status(400).json({
        message: "locked must be a boolean",
      });
    }

    if (id === req.user.id && req.body.locked) {
      return res.status(400).json({
        message: "You cannot lock your own account",
      });
    }

    const result = await pool.query(
      `UPDATE users
       SET is_locked=$1,
           token_version=token_version + CASE WHEN $1 THEN 1 ELSE 0 END,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$2 AND deleted_at IS NULL
       RETURNING ${publicUserSelect()}`,
      [req.body.locked, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json({
      message: req.body.locked ? "User locked successfully" : "User unlocked successfully",
      user: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

// ======================
// GET CURRENT USER PROFILE
// ======================
exports.getCurrentUser = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${publicUserSelect()}
       FROM users
       WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

// ======================
// UPDATE CURRENT USER PROFILE
// ======================
exports.updateCurrentUser = async (req, res) => {
  try {
    const id = req.user.id;
    const name = normalizeString(req.body.name);
    const email = normalizeString(req.body.email).toLowerCase();
    const phone = normalizeString(req.body.phone);
    const bio = normalizeString(req.body.bio);
    const avatarUrl = normalizeString(req.body.avatar_url);

    if (!name || !email) {
      return res.status(400).json({
        message: "Name and email are required",
      });
    }

    const lengthError = findTextLimitError({ name, email, bio });
    if (lengthError) {
      return res.status(400).json({
        message: lengthError,
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        message: "Email is invalid",
      });
    }

    if (!validatePhone(phone)) {
      return res.status(400).json({
        message: "Phone is invalid",
      });
    }

    if (!validateAvatarUrl(avatarUrl)) {
      return res.status(400).json({
        message: "Avatar URL is invalid",
      });
    }

    const duplicateEmail = await pool.query(
      "SELECT id FROM users WHERE email = $1 AND id != $2",
      [email, id]
    );

    if (duplicateEmail.rows.length > 0) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    const existing = await pool.query(
      "SELECT avatar_url FROM users WHERE id = $1",
      [id]
    );
    const previousAvatarUrl = existing.rows[0]?.avatar_url;

    const result = await pool.query(
      `UPDATE users
       SET
         name=$1,
         email=$2,
         phone=$3,
         bio=$4,
         avatar_url=$5,
         updated_at=CURRENT_TIMESTAMP
       WHERE id=$6 AND deleted_at IS NULL
       RETURNING ${publicUserSelect()}`,
      [
        name,
        email,
        phone || null,
        bio || null,
        avatarUrl || null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const newAvatarUrl = result.rows[0].avatar_url;
    if (previousAvatarUrl && previousAvatarUrl !== newAvatarUrl) {
      // avatar_url is user-supplied, so someone could point theirs at another
      // user's uploaded file; only remove the file once nobody references it.
      const stillUsed = await pool.query(
        "SELECT 1 FROM users WHERE avatar_url = $1 AND id != $2 LIMIT 1",
        [previousAvatarUrl, id]
      );
      if (stillUsed.rows.length === 0) removeUpload(previousAvatarUrl, "avatars", { userId: id });
    }

    res.json({
      message: "Profile updated successfully",
      user: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};

// ======================
// CHANGE CURRENT USER PASSWORD
// ======================
exports.changeCurrentUserPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required",
      });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        message: PASSWORD_RULE_MESSAGE,
      });
    }

    const result = await pool.query(
      "SELECT id, password FROM users WHERE id = $1 AND deleted_at IS NULL",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedResult = await pool.query(
      `UPDATE users
       SET password=$1,
           token_version=token_version + 1,
           must_change_password=FALSE,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$2 AND deleted_at IS NULL
       RETURNING id, email, role, token_version, must_change_password`,
      [hashedPassword, req.user.id]
    );

    if (updatedResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    setAuthCookie(res, updatedResult.rows[0]);

    res.json({
      message: "Password changed successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
    });
  }
};
