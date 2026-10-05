// Which account a Google sign-in may end up in, on real PostgreSQL.
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

// Google's signature check is the one thing replaced: a "token" is the JSON
// of the Google account it stands for. Everything after it is the real code.
const firebase = require("../src/services/firebaseAdmin");
firebase.isGoogleLoginConfigured = () => true;
firebase.verifyFirebaseIdToken = async (token) => ({
  email_verified: true,
  firebase: { sign_in_provider: "google.com" },
  ...JSON.parse(token),
});

const pool = require("../src/db/db");
const { reset } = require("../src/db/reset");
const { run } = require("../src/scripts/admin-reset");
const app = require("../server");

let server;
let baseUrl;

async function post(path, body, cookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
    cookie: response.headers.get("set-cookie")?.split(";", 1)[0],
  };
}

function googleLogin(account) {
  return post("/api/google-login", { idToken: JSON.stringify(account) });
}

async function userByEmail(email) {
  return (await pool.query("SELECT * FROM users WHERE email = $1", [email])).rows[0];
}

async function whoAmI(cookie) {
  const response = await fetch(`${baseUrl}/api/users/me`, { headers: { Cookie: cookie } });
  return response.json();
}

describe("Google sign-in and existing accounts", () => {
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

  it("creates a guest account for a new Google account and finds it again", async () => {
    const first = await googleLogin({ uid: "uid-new", email: "New.Guest@Example.com", name: "New Guest" });

    assert.equal(first.status, 200);
    assert.equal(first.body.linked, false);
    assert.equal(first.body.user.role, "user");
    assert.equal((await userByEmail("new.guest@example.com")).google_uid, "uid-new");

    const again = await googleLogin({ uid: "uid-new", email: "new.guest@example.com", name: "New Guest" });
    assert.equal(again.status, 200);
    assert.equal(again.body.user.id, first.body.user.id);
    assert.equal((await whoAmI(again.cookie)).email, "new.guest@example.com");
  });

  it("refuses Google for an admin that was never linked, even with the admin's verified email", async () => {
    const before = await userByEmail("admin@example.com");

    for (const email of ["admin@example.com", "Admin@Example.com"]) {
      const refused = await googleLogin({ uid: "uid-claims-admin", email, name: "Not The Admin" });

      assert.equal(refused.status, 403);
      assert.equal(refused.body.code, "GOOGLE_ADMIN_PASSWORD_REQUIRED");
      assert.equal(refused.body.user, undefined);
      assert.equal(refused.cookie, undefined, "no session is started");
    }

    assert.deepEqual(await userByEmail("admin@example.com"), before, "the admin account is untouched");
    const withPassword = await post("/api/login", { email: "admin@example.com", password: "Admin-Integration-1" });
    assert.equal(withPassword.status, 200, "the password still works");
  });

  it("links a guest's password account on the first Google sign-in", async () => {
    await post("/api/register", { name: "Guest", email: "guest@hotel.test", password: "Guest-Passw0rd" });

    const linked = await googleLogin({ uid: "uid-guest", email: "guest@hotel.test", name: "Guest" });

    assert.equal(linked.status, 200);
    assert.equal(linked.body.linked, true);
    assert.equal(linked.body.code, "GOOGLE_LINKED");
    assert.equal(linked.body.user.role, "user");
    assert.equal((await userByEmail("guest@hotel.test")).google_uid, "uid-guest");
  });

  it("refuses a different Google account once the email is linked", async () => {
    const before = await userByEmail("guest@hotel.test");

    const refused = await googleLogin({ uid: "uid-someone-else", email: "guest@hotel.test", name: "Someone Else" });

    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, "GOOGLE_ACCOUNT_MISMATCH");
    assert.equal(refused.cookie, undefined, "no session is started");
    assert.deepEqual(await userByEmail("guest@hotel.test"), before, "the link is not replaced");

    const owner = await googleLogin({ uid: "uid-guest", email: "guest@hotel.test", name: "Guest" });
    assert.equal(owner.status, 200, "the linked Google account still gets in");
    assert.equal(owner.body.linked, false);
  });

  it("refuses Google for an admin whose Google account is already linked; the password still works", async () => {
    // A guest who signed in with Google and was made an admin afterwards.
    await pool.query("UPDATE users SET role = 'admin' WHERE email = 'guest@hotel.test'");
    const before = await userByEmail("guest@hotel.test");

    for (const uid of ["uid-guest", "uid-someone-else"]) {
      const refused = await googleLogin({ uid, email: "guest@hotel.test", name: "Guest" });

      assert.equal(refused.status, 403, uid);
      assert.equal(refused.body.code, "GOOGLE_ADMIN_PASSWORD_REQUIRED", uid);
      assert.equal(refused.body.user, undefined);
      assert.equal(refused.cookie, undefined, "no session is started");
    }
    assert.deepEqual(await userByEmail("guest@hotel.test"), before, "the account is untouched");

    const withPassword = await post("/api/login", { email: "guest@hotel.test", password: "Guest-Passw0rd" });
    assert.equal(withPassword.status, 200);
    assert.equal(withPassword.body.user.role, "admin");
  });

  it("gives an admin who only ever had Google a password through admin:reset", async () => {
    // Created by Google sign-in (random password nobody knows), then promoted.
    await pool.query("UPDATE users SET role = 'admin' WHERE email = 'new.guest@example.com'");
    const refused = await googleLogin({ uid: "uid-new", email: "new.guest@example.com", name: "New Guest" });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, "GOOGLE_ADMIN_PASSWORD_REQUIRED");

    const lines = [];
    assert.equal(await run(pool, ["--email", "new.guest@example.com"], (line) => lines.push(line)), true);
    const temporary = lines.join("\n").match(/Temporary password.*: (\S+)$/m)[1];

    const withPassword = await post("/api/login", { email: "new.guest@example.com", password: temporary });
    assert.equal(withPassword.status, 200);
    assert.equal(withPassword.body.user.role, "admin");
    assert.equal(withPassword.body.user.must_change_password, true);
  });

  it("lets the same person use Google again once they are no longer an admin", async () => {
    await pool.query("UPDATE users SET role = 'user' WHERE email = 'guest@hotel.test'");

    const owner = await googleLogin({ uid: "uid-guest", email: "guest@hotel.test", name: "Guest" });
    assert.equal(owner.status, 200);
    assert.equal(owner.body.user.role, "user");
  });
});
