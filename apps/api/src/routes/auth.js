const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const pool = require("../db/db");
const { isGoogleLoginConfigured, verifyFirebaseIdToken } = require("../services/firebaseAdmin");
const { clearAuthCookie, setAuthCookie } = require("../services/authSession");
const { getPublicWebUrl } = require("../services/allowedOrigins");
const {
  forgotPasswordRateLimit,
  loginRateLimit,
  registerRateLimit,
  resetCheckRateLimit,
  resetPasswordRateLimit,
} = require("../middleware/rateLimit");
const { getResetTokenTtlMinutes } = require("../config/auth");
const { isStrongPassword } = require("../utils/password");
const { TEXT_LIMITS, findTextLimitError } = require("../utils/textLimits");
const {
  assertEmailConfigured,
  sendPasswordResetEmail,
} = require("../services/emailService");
const { apiMessage } = require("../utils/apiMessages");

const router = express.Router();
const PUBLIC_USER_FIELDS =
  "id,name,email,role,phone,bio,avatar_url,created_at,updated_at,must_change_password,password_set";
const AUTH_USER_FIELDS = `${PUBLIC_USER_FIELDS},token_version,deleted_at,is_locked`;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(user) {
  const {
    password: _password,
    token_version: _tokenVersion,
    deleted_at: _deletedAt,
    google_uid: _googleUid,
    is_locked: _isLocked,
    ...safeUser
  } = user;
  return safeUser;
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

router.post("/login", loginRateLimit, async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
    const password = req.body.password;

    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({ ...apiMessage("CREDENTIALS_REQUIRED") });
    }

    const result = await pool.query(
      `SELECT ${AUTH_USER_FIELDS},password
       FROM users
       WHERE LOWER(email)=LOWER($1) AND deleted_at IS NULL`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ ...apiMessage("INVALID_CREDENTIALS") });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ ...apiMessage("INVALID_CREDENTIALS") });
    }

    if (user.is_locked) {
      return res.status(403).json({
        ...apiMessage("ACCOUNT_LOCKED"),
      });
    }

    setAuthCookie(res, user);
    return res.json({
      ...apiMessage("LOGIN_SUCCESS"),
      user: publicUser(user),
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ ...apiMessage("SERVER_ERROR") });
  }
});

router.post("/register", registerRateLimit, async (req, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body.password;

    if (!name || !email || !password) {
      return res.status(400).json({ ...apiMessage("REGISTRATION_FIELDS_REQUIRED") });
    }
    const lengthError = findTextLimitError({ name, email });
    if (lengthError) {
      return res.status(400).json(lengthError);
    }
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ ...apiMessage("INVALID_EMAIL") });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json(apiMessage("WEAK_PASSWORD"));
    }

    const check = await pool.query(
      "SELECT id FROM users WHERE LOWER(email)=LOWER($1)",
      [email]
    );
    if (check.rows.length > 0) {
      return res.status(400).json({ ...apiMessage("EMAIL_EXISTS") });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users(name,email,password,role)
       VALUES($1,$2,$3,'user')
       RETURNING ${PUBLIC_USER_FIELDS}`,
      [name, email, hashedPassword]
    );

    return res.status(201).json({
      ...apiMessage("REGISTERED"),
      user: result.rows[0],
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ ...apiMessage("SERVER_ERROR") });
  }
});

router.post("/forgot-password", forgotPasswordRateLimit, async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
    if (!email) return res.status(400).json({ ...apiMessage("EMAIL_REQUIRED") });

    try {
      assertEmailConfigured();
    } catch (configError) {
      console.error("EMAIL CONFIGURATION ERROR:", configError);
      return res.status(500).json({ ...apiMessage("PASSWORD_RESET_UNAVAILABLE") });
    }

    const userResult = await pool.query(
      "SELECT id, name, email FROM users WHERE LOWER(email)=LOWER($1) AND deleted_at IS NULL",
      [email]
    );
    if (userResult.rows.length === 0) {
      return res.json(apiMessage("RESET_EMAIL_SENT"));
    }

    const user = userResult.rows[0];
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + getResetTokenTtlMinutes() * 60 * 1000);

    await pool.query(
      `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at)
       VALUES($1, $2, $3)`,
      [user.id, tokenHash, expiresAt]
    );

    const resetUrl = `${getPublicWebUrl()}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });

    return res.json(apiMessage("RESET_EMAIL_SENT"));
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    return res.status(500).json({ ...apiMessage("SERVER_ERROR") });
  }
});

// Opening a reset link: says whether it still works before the visitor types
// a new password. A working link names its account (whoever holds the link
// received it at that address). A link that is no longer usable says why,
// "expired" with its times or "used", and nothing about the account; an
// unknown token is just "invalid".
router.post("/reset-password/check", resetCheckRateLimit, async (req, res) => {
  const token = typeof req.body.token === "string" ? req.body.token : "";
  if (!token) return res.status(400).json({ ...apiMessage("RESET_FIELDS_REQUIRED") });

  try {
    const result = await pool.query(
      `SELECT t.created_at, t.expires_at, t.used_at, t.expires_at <= NOW() AS expired, u.email
       FROM password_reset_tokens t
       JOIN users u ON u.id = t.user_id AND u.deleted_at IS NULL
       WHERE t.token_hash = $1
       ORDER BY t.id DESC
       LIMIT 1`,
      [hashResetToken(token)]
    );
    const link = result.rows[0];

    if (!link) return res.status(400).json({ ...apiMessage("RESET_TOKEN_INVALID"), reason: "invalid" });
    if (link.used_at) return res.status(400).json({ ...apiMessage("RESET_TOKEN_INVALID"), reason: "used" });
    if (link.expired) {
      return res.status(400).json({
        ...apiMessage("RESET_TOKEN_INVALID"),
        reason: "expired",
        createdAt: link.created_at,
        expiresAt: link.expires_at,
      });
    }
    return res.json({ valid: true, email: link.email, expiresAt: link.expires_at });
  } catch (err) {
    console.error("RESET LINK CHECK ERROR:", err);
    return res.status(500).json({ ...apiMessage("SERVER_ERROR") });
  }
});

router.post("/reset-password", resetPasswordRateLimit, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ ...apiMessage("RESET_FIELDS_REQUIRED") });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json(apiMessage("WEAK_PASSWORD"));
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const tokenHash = hashResetToken(token);
    const tokenResult = await client.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ...apiMessage("RESET_TOKEN_INVALID") });
    }

    const resetToken = tokenResult.rows[0];
    const hashedPassword = await bcrypt.hash(password, 10);
    await client.query(
      `UPDATE users
       SET password=$1,
           token_version=token_version + 1,
           must_change_password=FALSE,
           password_set=TRUE,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$2`,
      [hashedPassword, resetToken.user_id]
    );
    await client.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE id=$1",
      [resetToken.id]
    );
    await client.query("COMMIT");
    return res.json({ ...apiMessage("PASSWORD_RESET_DONE") });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("RESET PASSWORD ERROR:", err);
    return res.status(500).json({ ...apiMessage("SERVER_ERROR") });
  } finally {
    if (client) client.release();
  }
});

router.post("/google-login", loginRateLimit, async (req, res) => {
  if (!isGoogleLoginConfigured()) {
    return res.status(503).json({ ...apiMessage("GOOGLE_DISABLED") });
  }

  try {
    const { idToken } = req.body;
    if (typeof idToken !== "string" || !idToken.trim()) {
      return res.status(400).json({ ...apiMessage("GOOGLE_TOKEN_REQUIRED") });
    }

    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      return res.status(401).json({
        ...apiMessage("GOOGLE_TOKEN_INVALID"),
      });
    }

    if (
      decoded.firebase?.sign_in_provider !== "google.com" ||
      decoded.email_verified !== true ||
      typeof decoded.email !== "string"
    ) {
      return res.status(401).json({ ...apiMessage("GOOGLE_EMAIL_UNVERIFIED") });
    }

    const email = decoded.email.trim().toLowerCase();
    const name = typeof decoded.name === "string" && decoded.name.trim()
      ? decoded.name.trim().slice(0, TEXT_LIMITS.name)
      : email.split("@")[0].slice(0, TEXT_LIMITS.name);

    let result = await pool.query(
      `SELECT ${AUTH_USER_FIELDS}, google_uid
       FROM users
       WHERE LOWER(email)=LOWER($1)`,
      [email]
    );
    let user;
    let justLinked = false;

    if (result.rows.length === 0) {
      const randomPassword = crypto.randomBytes(32).toString("base64url");
      const hashed = await bcrypt.hash(randomPassword, 10);
      result = await pool.query(
        `INSERT INTO users(name,email,password,role,google_uid,password_set)
         VALUES($1,$2,$3,'user',$4,FALSE)
         RETURNING ${AUTH_USER_FIELDS}, google_uid`,
        [name, email, hashed, decoded.uid]
      );
      user = result.rows[0];
    } else {
      user = result.rows[0];
      if (user.deleted_at) {
        return res.status(401).json({ ...apiMessage("ACCOUNT_DISABLED") });
      }

      if (user.is_locked) {
        return res.status(403).json({
          ...apiMessage("ACCOUNT_LOCKED"),
        });
      }

      // An admin signs in with the password, never with Google, linked or
      // not: admin rights must not depend on who controls a mailbox or a
      // Google account. (An admin who only ever had Google gets a password
      // from `npm run admin:reset`.)
      if (user.role === "admin") {
        return res.status(403).json({ ...apiMessage("GOOGLE_ADMIN_PASSWORD_REQUIRED") });
      }

      // Linked already: only the Google account it was linked to gets in. The
      // email alone is not enough (an address can pass to another Google
      // account, or be an alias on one).
      if (user.google_uid && user.google_uid !== decoded.uid) {
        return res.status(403).json({ ...apiMessage("GOOGLE_ACCOUNT_MISMATCH") });
      }

      // First Google sign-in for an email that already had a password account:
      // link it explicitly instead of merging silently.
      if (!user.google_uid) {
        justLinked = true;
        const linkResult = await pool.query(
          `UPDATE users SET google_uid = $1 WHERE id = $2
           RETURNING ${AUTH_USER_FIELDS}, google_uid`,
          [decoded.uid, user.id]
        );
        user = linkResult.rows[0];
      }
    }

    setAuthCookie(res, user);
    return res.json({
      ...apiMessage(justLinked ? "GOOGLE_LINKED" : "GOOGLE_LOGIN_SUCCESS"),
      linked: justLinked,
      user: publicUser(user),
    });
  } catch (err) {
    console.error("GOOGLE LOGIN ERROR:", err);
    return res.status(500).json({ ...apiMessage("SERVER_ERROR") });
  }
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  return res.status(204).send();
});

module.exports = router;
