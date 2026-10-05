// `npm run admin:reset`: getting back in after a lost password or a lockout,
// on real PostgreSQL and through the real login.
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
const { after, before, describe, it } = require("node:test");

const pool = require("../src/db/db");
const { reset } = require("../src/db/reset");
const { run } = require("../src/scripts/admin-reset");
const app = require("../server");

let server;
let baseUrl;

async function login(email, password) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";", 1)[0],
  };
}

async function listUsers(cookie) {
  return (await fetch(`${baseUrl}/api/users?page=1&limit=10`, { headers: { Cookie: cookie } })).status;
}

// Runs the command as `npm run admin:reset -- <args>` would; returns its
// output, whether it succeeded, and the temporary password it printed.
async function adminReset(...args) {
  const lines = [];
  const ok = await run(pool, args, (line) => lines.push(line));
  const output = lines.join("\n");
  return { ok, output, password: output.match(/Temporary password.*: (\S+)$/m)?.[1] };
}

async function userByEmail(email) {
  return (await pool.query("SELECT * FROM users WHERE email = $1", [email])).rows[0];
}

describe("admin:reset", () => {
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

  it("lists the admins and changes nothing without --email", async () => {
    const before = await userByEmail("admin@example.com");

    const result = await adminReset();

    assert.equal(result.ok, true);
    assert.match(result.output, /admin@example\.com/);
    assert.doesNotMatch(result.output, /user@example\.com/);
    assert.equal(result.password, undefined);
    assert.deepEqual(await userByEmail("admin@example.com"), before);
  });

  it("marks a locked admin in the list", async () => {
    await pool.query("UPDATE users SET is_locked = TRUE WHERE email = 'admin@example.com'");
    try {
      assert.match((await adminReset()).output, /admin@example\.com.*LOCKED/);
    } finally {
      await pool.query("UPDATE users SET is_locked = FALSE WHERE email = 'admin@example.com'");
    }
  });

  it("lets a locked-out admin back in with a temporary password and ends the old sessions", async () => {
    const old = await login("admin@example.com", "Admin-Integration-1");
    assert.equal(await listUsers(old.cookie), 200);
    await pool.query("UPDATE users SET is_locked = TRUE WHERE email = 'admin@example.com'");
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       SELECT id, 'pending-link', NOW() + INTERVAL '15 minutes' FROM users WHERE email = 'admin@example.com'`
    );
    const before = await userByEmail("admin@example.com");

    const result = await adminReset("--email", "Admin@Example.com");

    assert.equal(result.ok, true);
    assert.ok(result.password?.length >= 20, "a temporary password is printed");
    assert.equal(result.output.split(result.password).length - 1, 1, "printed once");

    const admin = await userByEmail("admin@example.com");
    assert.equal(admin.role, "admin");
    assert.equal(admin.is_locked, false);
    assert.equal(admin.must_change_password, true);
    assert.equal(admin.token_version, before.token_version + 1);
    assert.equal((await pool.query("SELECT 1 FROM password_reset_tokens WHERE user_id = $1", [admin.id])).rows.length, 0);

    assert.equal(await listUsers(old.cookie), 401, "the session from before the reset is signed out");
    assert.equal((await login("admin@example.com", "Admin-Integration-1")).status, 401, "the old password is gone");

    const fresh = await login("admin@example.com", result.password);
    assert.equal(fresh.status, 200);
    assert.equal(fresh.body.user.must_change_password, true);
    assert.equal(await listUsers(fresh.cookie), 403, "nothing but changing the password until it is changed");

    const changed = await fetch(`${baseUrl}/api/users/me/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: fresh.cookie },
      body: JSON.stringify({ currentPassword: result.password, newPassword: "Brand-New-Passw0rd" }),
    });
    assert.equal(changed.status, 200);
    const again = await login("admin@example.com", "Brand-New-Passw0rd");
    assert.equal(await listUsers(again.cookie), 200);
  });

  it("makes the named account an admin when none is left", async () => {
    await pool.query("UPDATE users SET role = 'user' WHERE role = 'admin'");
    assert.match((await adminReset()).output, /There is no admin/);

    const result = await adminReset("--email=user@example.com");

    assert.equal(result.ok, true);
    assert.equal((await userByEmail("user@example.com")).role, "admin");
    const session = await login("user@example.com", result.password);
    assert.equal(session.body.user.role, "admin");
  });

  it("refuses an unknown or deleted account, and a missing email", async () => {
    await pool.query(
      "INSERT INTO users (name, email, password, role, deleted_at) VALUES ('Gone', 'gone@hotel.test', 'x', 'admin', NOW())"
    );

    for (const args of [["--email", "nobody@hotel.test"], ["--email", "gone@hotel.test"], ["--email"]]) {
      const result = await adminReset(...args);
      assert.equal(result.ok, false, args.join(" "));
      assert.equal(result.password, undefined);
    }
    assert.equal((await userByEmail("gone@hotel.test")).password, "x");
  });
});
