const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const pool = require("../db/db");
const { isGoogleLoginConfigured, verifyFirebaseIdToken } = require("../services/firebaseAdmin");
const { clearAuthCookie, setAuthCookie } = require("../services/authSession");
const {
  forgotPasswordRateLimit,
  loginRateLimit,
  registerRateLimit,
  resetPasswordRateLimit,
} = require("../middleware/rateLimit");
const { isStrongPassword, PASSWORD_RULE_MESSAGE } = require("../utils/password");
const { TEXT_LIMITS, findTextLimitError } = require("../utils/textLimits");
const {
  assertEmailConfigured,
  sendPasswordResetEmail,
} = require("../services/emailService");

const router = express.Router();
const RESET_RESPONSE_MESSAGE =
  "If this email exists, a password reset link has been sent.";
const PUBLIC_USER_FIELDS =
  "id,name,email,role,phone,bio,avatar_url,created_at,updated_at,must_change_password";
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

function getResetTokenTtlMinutes() {
  const ttl = Number(process.env.RESET_TOKEN_TTL_MINUTES || 15);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 15;
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

router.post("/login", loginRateLimit, async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
    const password = req.body.password;

    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const result = await pool.query(
      `SELECT ${AUTH_USER_FIELDS},password
       FROM users
       WHERE LOWER(email)=LOWER($1) AND deleted_at IS NULL`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Email or password is incorrect" });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Email or password is incorrect" });
    }

    if (user.is_locked) {
      return res.status(403).json({
        message: "This account has been locked. Please contact an administrator.",
      });
    }

    setAuthCookie(res, user);
    return res.json({
      message: "Login successful",
      user: publicUser(user),
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ message: "Unable to log in" });
  }
});

router.post("/register", registerRateLimit, async (req, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body.password;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    const lengthError = findTextLimitError({ name, email });
    if (lengthError) {
      return res.status(400).json({ message: lengthError });
    }
    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: "Email is invalid" });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: PASSWORD_RULE_MESSAGE });
    }

    const check = await pool.query(
      "SELECT id FROM users WHERE LOWER(email)=LOWER($1)",
      [email]
    );
    if (check.rows.length > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users(name,email,password,role)
       VALUES($1,$2,$3,'user')
       RETURNING ${PUBLIC_USER_FIELDS}`,
      [name, email, hashedPassword]
    );

    return res.status(201).json({
      message: "Registration successful",
      user: result.rows[0],
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ message: "Unable to register" });
  }
});

router.post("/forgot-password", forgotPasswordRateLimit, async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
    if (!email) return res.status(400).json({ message: "Email is required" });

    try {
      assertEmailConfigured();
    } catch (configError) {
      console.error("EMAIL CONFIGURATION ERROR:", configError);
      return res.status(500).json({ message: "Password reset email is unavailable" });
    }

    const userResult = await pool.query(
      "SELECT id, name, email FROM users WHERE LOWER(email)=LOWER($1) AND deleted_at IS NULL",
      [email]
    );
    if (userResult.rows.length === 0) {
      return res.json({ message: RESET_RESPONSE_MESSAGE });
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

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetUrl = `${frontendUrl.replace(/\/$/, "")}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });

    return res.json({ message: RESET_RESPONSE_MESSAGE });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    return res.status(500).json({ message: "Unable to send password reset email" });
  }
});

router.post("/reset-password", resetPasswordRateLimit, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ message: "Token and password are required" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ message: PASSWORD_RULE_MESSAGE });
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
      return res.status(400).json({ message: "Reset token is invalid or expired" });
    }

    const resetToken = tokenResult.rows[0];
    const hashedPassword = await bcrypt.hash(password, 10);
    await client.query(
      `UPDATE users
       SET password=$1,
           token_version=token_version + 1,
           must_change_password=FALSE,
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$2`,
      [hashedPassword, resetToken.user_id]
    );
    await client.query(
      "UPDATE password_reset_tokens SET used_at = NOW() WHERE id=$1",
      [resetToken.id]
    );
    await client.query("COMMIT");
    return res.json({ message: "Password reset successfully" });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("RESET PASSWORD ERROR:", err);
    return res.status(500).json({ message: "Unable to reset password" });
  } finally {
    if (client) client.release();
  }
});

router.post("/google-login", loginRateLimit, async (req, res) => {
  if (!isGoogleLoginConfigured()) {
    return res.status(503).json({ message: "Google sign-in is not enabled on this server" });
  }

  try {
    const { idToken } = req.body;
    if (typeof idToken !== "string" || !idToken.trim()) {
      return res.status(400).json({ message: "Firebase ID token is required" });
    }

    let decoded;
    try {
      decoded = await verifyFirebaseIdToken(idToken);
    } catch {
      return res.status(401).json({
        message: "Google authentication token is invalid or expired",
      });
    }

    if (
      decoded.firebase?.sign_in_provider !== "google.com" ||
      decoded.email_verified !== true ||
      typeof decoded.email !== "string"
    ) {
      return res.status(401).json({ message: "A verified Google account is required" });
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
        `INSERT INTO users(name,email,password,role,google_uid)
         VALUES($1,$2,$3,'user',$4)
         RETURNING ${AUTH_USER_FIELDS}, google_uid`,
        [name, email, hashed, decoded.uid]
      );
      user = result.rows[0];
    } else {
      user = result.rows[0];
      if (user.deleted_at) {
        return res.status(401).json({ message: "This account is disabled" });
      }

      if (user.is_locked) {
        return res.status(403).json({
          message: "This account has been locked. Please contact an administrator.",
        });
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
      message: justLinked
        ? "Tài khoản hiện có của bạn đã được liên kết với Google"
        : "Google login successful",
      linked: justLinked,
      user: publicUser(user),
    });
  } catch (err) {
    console.error("GOOGLE LOGIN ERROR:", err);
    return res.status(500).json({ message: "Unable to log in with Google" });
  }
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  return res.status(204).send();
});

module.exports = router;
