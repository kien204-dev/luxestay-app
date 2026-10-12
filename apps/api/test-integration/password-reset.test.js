// Opening a password reset link, on real PostgreSQL: what the page is told
// about a working, expired, used or unknown link, and the reset itself.
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
process.env.RESET_TOKEN_TTL_MINUTES = "25";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { after, before, describe, it } = require("node:test");

const pool = require("../src/db/db");
const { reset } = require("../src/db/reset");
const app = require("../server");

let server;
let baseUrl;
let userId;

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

// A reset link as the forgot-password endpoint stores it: only the hash.
async function makeLink({ minutesLeft = 25, used = false } = {}) {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await pool.query(
    `INSERT INTO password_reset_tokens(user_id, token_hash, expires_at, used_at, created_at)
     VALUES($1, $2, NOW() + make_interval(mins => $3), $4, NOW() + make_interval(mins => $3 - 25))`,
    [userId, hash, minutesLeft, used ? new Date() : null]
  );
  return token;
}

describe("password reset links", () => {
  before(async () => {
    await reset(pool, { log: () => {} });
    const created = await pool.query(
      "INSERT INTO users(name, email, password, role) VALUES('Reset Guest', 'reset.guest@example.com', 'x', 'user') RETURNING id"
    );
    userId = created.rows[0].id;
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  it("publishes the link lifetime from RESET_TOKEN_TTL_MINUTES", async () => {
    const settings = await (await fetch(`${baseUrl}/api/settings/public`)).json();
    assert.equal(settings.auth.resetLinkMinutes, 25);
  });

  it("names the account of a working link", async () => {
    const token = await makeLink();
    const result = await post("/api/reset-password/check", { token });
    assert.equal(result.status, 200);
    assert.equal(result.body.valid, true);
    assert.equal(result.body.email, "reset.guest@example.com");
    assert.ok(new Date(result.body.expiresAt) > new Date());
  });

  it("gives the times of an expired link, and no account", async () => {
    const token = await makeLink({ minutesLeft: -5 });
    const result = await post("/api/reset-password/check", { token });
    assert.equal(result.status, 400);
    assert.equal(result.body.code, "RESET_TOKEN_INVALID");
    assert.equal(result.body.reason, "expired");
    assert.equal(result.body.email, undefined);
    const lifetime = new Date(result.body.expiresAt) - new Date(result.body.createdAt);
    assert.equal(Math.round(lifetime / 60000), 25);
  });

  it("says a link was already used, and an unknown token is just invalid", async () => {
    const used = await post("/api/reset-password/check", { token: await makeLink({ used: true }) });
    assert.equal(used.status, 400);
    assert.equal(used.body.reason, "used");
    assert.equal(used.body.email, undefined);

    const unknown = await post("/api/reset-password/check", { token: "not-a-token" });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.reason, "invalid");
    assert.equal(unknown.body.createdAt, undefined);
  });

  it("resets the password once; the same link then reads as used", async () => {
    const token = await makeLink();
    const done = await post("/api/reset-password", { token, password: "New-pass-2026" });
    assert.equal(done.status, 200);
    const again = await post("/api/reset-password/check", { token });
    assert.equal(again.body.reason, "used");
    const login = await post("/api/login", { email: "reset.guest@example.com", password: "New-pass-2026" });
    assert.equal(login.status, 200);
  });
});
