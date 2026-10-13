// Changing the sign-in email from My account, on real PostgreSQL: the
// current password is required, a Google-only account must set one first,
// other sessions end, and the old address is told.
//
// Run with `npm run test:integration` from the repository root.

process.env.TZ = "UTC";
process.env.NODE_ENV = "test";
process.env.DB_HOST = process.env.TEST_DB_HOST || "127.0.0.1";
process.env.DB_PORT = process.env.TEST_DB_PORT || "54330";
process.env.DB_USER = "luxestay";
process.env.DB_PASSWORD = "luxestay";
process.env.DB_NAME = "luxestay_test";
process.env.DB_SSL = "false";
process.env.JWT_SECRET = require("node:crypto").randomBytes(32).toString("hex");
process.env.SEED_ADMIN_PASSWORD = "Admin-Integration-1";
process.env.SMTP_HOST = "";
process.env.STORAGE_DRIVER = "local";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, before, describe, it } = require("node:test");

// The mail itself is the one thing replaced: what is sent, and to whom, is
// the real code.
const sent = [];
const emailService = require("../src/services/emailService");
emailService.isEmailConfigured = () => true;
emailService.sendEmail = async (message) => { sent.push(message); };

const firebase = require("../src/services/firebaseAdmin");
firebase.isGoogleLoginConfigured = () => true;
firebase.verifyFirebaseIdToken = async (token) => ({ email_verified: true, firebase: { sign_in_provider: "google.com" }, ...JSON.parse(token) });

const pool = require("../src/db/db");
const { reset } = require("../src/db/reset");
const app = require("../server");

let server;
let baseUrl;

async function call(path, { method = "GET", body, cookie, lang } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(lang ? { "Accept-Language": lang } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null), cookie: response.headers.get("set-cookie")?.split(";", 1)[0] };
}

async function newAccount(email, password = "First-pass-1") {
  await call("/api/register", { method: "POST", body: { name: "Khách Đổi Email", email, password } });
  const login = await call("/api/login", { method: "POST", body: { email, password } });
  return login.cookie;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
const versionOf = async (id) => (await pool.query("SELECT token_version FROM users WHERE id = $1", [id])).rows[0].token_version;

describe("changing the email from My account", () => {
  before(async () => {
    await reset(pool, { log: () => {} });
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("saves the other fields without a password, and changes nothing about sessions", async () => {
    const cookie = await newAccount("same.email@example.com");
    const me = (await call("/api/users/me", { cookie })).body;
    const before = await versionOf(me.id);
    const saved = await call("/api/users/me", { method: "PUT", cookie, body: { name: "Tên Mới", email: "Same.Email@Example.com", phone: "0908 214 556" } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.code, "PROFILE_UPDATED");
    assert.equal(await versionOf(me.id), before);
    assert.equal((await call("/api/users/me", { cookie })).status, 200);
  });

  it("needs the current password; a wrong one changes nothing", async () => {
    const cookie = await newAccount("needs.password@example.com");
    const missing = await call("/api/users/me", { method: "PUT", cookie, body: { name: "Khách", email: "other.address@example.com" } });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.code, "CURRENT_PASSWORD_REQUIRED");
    const wrong = await call("/api/users/me", { method: "PUT", cookie, body: { name: "Khách", email: "other.address@example.com", currentPassword: "Wrong-pass-1" } });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.code, "CURRENT_PASSWORD_WRONG");
    // Whether an address is taken is only said after the password is right.
    const taken = await call("/api/users/me", { method: "PUT", cookie, body: { name: "Khách", email: "same.email@example.com", currentPassword: "Wrong-pass-1" } });
    assert.equal(taken.body.code, "CURRENT_PASSWORD_WRONG");
    assert.equal((await call("/api/users/me", { cookie })).body.email, "needs.password@example.com");
    assert.equal(sent.length, 0);
  });

  it("with the password: other sessions end, this one goes on, the old address is told", async () => {
    const cookie = await newAccount("old.address@example.com");
    const otherDevice = (await call("/api/login", { method: "POST", body: { email: "old.address@example.com", password: "First-pass-1" } })).cookie;
    const me = (await call("/api/users/me", { cookie })).body;
    const before = await versionOf(me.id);

    const changed = await call("/api/users/me", { method: "PUT", cookie, lang: "en", body: { name: "Khách Đổi Email", email: "New.Address@example.com", currentPassword: "First-pass-1" } });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.code, "EMAIL_CHANGED");
    assert.equal(changed.body.user.email, "new.address@example.com");
    assert.equal(changed.body.user.token_version, undefined);
    assert.equal(await versionOf(me.id), before + 1);

    assert.equal((await call("/api/users/me", { cookie: otherDevice })).status, 401, "the other device is signed out");
    assert.equal((await call("/api/users/me", { cookie })).status, 401, "the old cookie of this device too");
    assert.equal((await call("/api/users/me", { cookie: changed.cookie })).body.email, "new.address@example.com");

    await settle();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "old.address@example.com");
    assert.match(sent[0].subject, /sign-in email/);
    assert.match(sent[0].text, /old\.address@example\.com to new\.address@example\.com/);

    assert.equal((await call("/api/login", { method: "POST", body: { email: "old.address@example.com", password: "First-pass-1" } })).status, 401);
    assert.equal((await call("/api/login", { method: "POST", body: { email: "new.address@example.com", password: "First-pass-1" } })).status, 200);
  });

  it("a Google-only account must set a password first; after a reset it can", async () => {
    const google = await call("/api/google-login", { method: "POST", body: { idToken: JSON.stringify({ uid: "uid-google-only", email: "google.only@example.com", name: "Google Only" }) } });
    assert.equal(google.status, 200);
    assert.equal(google.body.user.password_set, false);

    const refused = await call("/api/users/me", { method: "PUT", cookie: google.cookie, body: { name: "Google Only", email: "moved@example.com", currentPassword: "anything-1" } });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, "PASSWORD_NOT_SET");

    // Set one through a reset link, as "Forgot password" would.
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at)
       SELECT id, $2, NOW() + INTERVAL '15 minutes' FROM users WHERE email = $1`,
      ["google.only@example.com", crypto.createHash("sha256").update(token).digest("hex")]
    );
    assert.equal((await call("/api/reset-password", { method: "POST", body: { token, password: "Own-pass-2026" } })).status, 200);
    const login = await call("/api/login", { method: "POST", body: { email: "google.only@example.com", password: "Own-pass-2026" } });
    assert.equal(login.body.user.password_set, true);

    const moved = await call("/api/users/me", { method: "PUT", cookie: login.cookie, body: { name: "Google Only", email: "moved@example.com", currentPassword: "Own-pass-2026" } });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.user.email, "moved@example.com");
  });

  it("limits password guesses through My account outside tests", async () => {
    const cookie = await newAccount("guesses@example.com");
    process.env.NODE_ENV = "production";
    try {
      let last;
      for (let attempt = 0; attempt < 11; attempt += 1) {
        last = await call("/api/users/me", { method: "PUT", cookie, body: { name: "Khách", email: "guess.target@example.com", currentPassword: `Guess-${attempt}` } });
      }
      assert.equal(last.status, 429);
    } finally {
      process.env.NODE_ENV = "test";
    }
  });
});
