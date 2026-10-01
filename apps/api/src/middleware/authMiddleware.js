require("dotenv").config({ quiet: true });
const jwt = require("jsonwebtoken");
const pool = require("../db/db");
const { readAuthToken } = require("../services/authSession");

const SECRET = process.env.JWT_SECRET;

function unauthorized(res, message = "Token is invalid or expired") {
  return res.status(401).json({ message });
}

async function verifyToken(req, res, next) {
  const auth = readAuthToken(req);

  if (!auth) {
    return unauthorized(res, "Authentication is required");
  }

  try {
    const decoded = jwt.verify(auth.token, SECRET, { algorithms: ["HS256"] });
    const userId = Number(decoded.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return unauthorized(res);
    }

    const result = await pool.query(
      `SELECT id, email, role, token_version, must_change_password, deleted_at, is_locked
       FROM users
       WHERE id = $1`,
      [userId]
    );
    const currentUser = result.rows[0];

    if (!currentUser || currentUser.deleted_at) {
      return unauthorized(res);
    }

    if (currentUser.is_locked) {
      return unauthorized(res, "This account has been locked");
    }

    const tokenVersion = Number(decoded.tokenVersion);
    const currentVersion = Number(currentUser.token_version) || 0;
    if (!Number.isInteger(tokenVersion) || tokenVersion !== currentVersion) {
      return unauthorized(res, "Session has been revoked");
    }

    req.user = {
      id: currentUser.id,
      email: currentUser.email,
      role: currentUser.role,
      token_version: currentVersion,
      must_change_password: Boolean(currentUser.must_change_password),
    };
    req.authSource = auth.source;

    const passwordChangeRoute = req.originalUrl === "/api/users/me/password";
    const logoutRoute = req.originalUrl === "/api/logout";
    if (req.user.must_change_password && !passwordChangeRoute && !logoutRoute) {
      return res.status(403).json({
        code: "PASSWORD_CHANGE_REQUIRED",
        message: "You must change your password before continuing",
      });
    }

    return next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return unauthorized(res, "Token has expired");
    }
    return unauthorized(res);
  }
}

function checkRole(...roles) {
  return function (req, res, next) {
    if (!req.user) {
      return unauthorized(res, "Authentication is required");
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to access this resource",
      });
    }

    return next();
  };
}

module.exports = { verifyToken, checkRole };
