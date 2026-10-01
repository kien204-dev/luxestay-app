// The S3 storage driver against an S3-compatible server (S3Mock, started by
// docker-compose.test.yml): uploads through the API land in the bucket,
// are publicly readable, and are removed when replaced.
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

const S3_ENDPOINT = `http://127.0.0.1:${process.env.TEST_S3_PORT || "54331"}`;
const BUCKET = "luxestay-test";
process.env.STORAGE_DRIVER = "s3";
process.env.S3_ENDPOINT = S3_ENDPOINT;
process.env.S3_REGION = "us-east-1";
process.env.S3_BUCKET = BUCKET;
// The test server accepts any credentials; these are placeholders, not secrets.
process.env.S3_ACCESS_KEY_ID = "test-access-key";
process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
process.env.S3_PUBLIC_URL = `${S3_ENDPOINT}/${BUCKET}`;

const assert = require("node:assert/strict");
const { after, before, describe, it } = require("node:test");
const {
  CreateBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} = require("@aws-sdk/client-s3");

const pool = require("../src/db/db");
const { reset } = require("../src/db/reset");
const { getEnvProblems } = require("../src/config/env");
const { ownFilename, removeUpload, storeUpload } = require("../src/services/storage");
const app = require("../server");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

let server;
let baseUrl;

async function prepareBucket() {
  const client = new S3Client({
    region: "us-east-1",
    endpoint: S3_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY },
  });

  // The server may still be starting when the tests begin.
  for (let attempt = 1; ; attempt++) {
    try {
      await client.send(new CreateBucketCommand({ Bucket: BUCKET }));
      break;
    } catch (err) {
      if (["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(err.name)) break;
      if (attempt >= 20) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // A real bucket needs a public-read policy so browsers can load the images
  // (see docs/configuration.md). The test server serves objects to anyone and
  // does not implement bucket policies, so a refusal here is expected.
  await client
    .send(
      new PutBucketPolicyCommand({
        Bucket: BUCKET,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            { Effect: "Allow", Principal: "*", Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${BUCKET}/*`] },
          ],
        }),
      })
    )
    .catch(() => {});
}

async function status(url) {
  return (await fetch(url)).status;
}

describe("S3-compatible storage", () => {
  before(async () => {
    await prepareBucket();
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

  it("accepts a complete S3 configuration at startup and names what is missing otherwise", () => {
    const base = { DB_USER: "u", DB_PASSWORD: "p", DB_NAME: "d", JWT_SECRET: "x".repeat(32) };
    assert.deepEqual(getEnvProblems(base), []);

    const savedUrl = process.env.S3_PUBLIC_URL;
    const savedBucket = process.env.S3_BUCKET;
    try {
      process.env.S3_PUBLIC_URL = "";
      process.env.S3_BUCKET = "";
      const problems = getEnvProblems(base).join(" | ");
      assert.match(problems, /S3_BUCKET/);
      assert.match(problems, /S3_PUBLIC_URL/);
    } finally {
      process.env.S3_PUBLIC_URL = savedUrl;
      process.env.S3_BUCKET = savedBucket;
    }
  });

  it("stores an object that is publicly readable, and removes it again", async () => {
    const reference = await storeUpload("rooms", "direct-test.png", PNG, "image/png");
    assert.equal(reference, `${process.env.S3_PUBLIC_URL}/rooms/direct-test.png`);

    const response = await fetch(reference);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);

    await removeUpload(reference, "rooms");
    assert.equal(await status(reference), 404);
  });

  it("only ever deletes its own objects", async () => {
    const mine = `${process.env.S3_PUBLIC_URL}/rooms/a.png`;
    assert.deepEqual(ownFilename(mine, "rooms"), { filename: "a.png", remote: true });
    // Another folder, another site, a path that climbs out, a lookalike prefix.
    assert.equal(ownFilename(mine, "avatars"), null);
    assert.equal(ownFilename("https://elsewhere.example/rooms/a.png", "rooms"), null);
    assert.equal(ownFilename(`${process.env.S3_PUBLIC_URL}/rooms/../branding/logo.png`, "rooms"), null);
    assert.equal(ownFilename(`https://evil.example/?u=${process.env.S3_PUBLIC_URL}/rooms/a.png`, "rooms"), null);
    assert.deepEqual(ownFilename("/uploads/rooms/b.png", "rooms"), { filename: "b.png", remote: false });
  });

  it("puts an avatar uploaded through the API in the bucket and removes the one it replaces", async () => {
    const login = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "User@12345" }),
    });
    const cookie = login.headers.get("set-cookie").split(";", 1)[0];

    const upload = async () => {
      const form = new FormData();
      form.append("image", new Blob([PNG], { type: "image/png" }), "avatar.png");
      const response = await fetch(`${baseUrl}/api/users/me/avatar`, { method: "POST", headers: { Cookie: cookie }, body: form });
      assert.equal(response.status, 201);
      return (await response.json()).avatarUrl;
    };
    const saveProfile = (avatarUrl) =>
      fetch(`${baseUrl}/api/users/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ name: "Khách Demo", email: "user@example.com", avatar_url: avatarUrl }),
      });

    const first = await upload();
    assert.ok(first.startsWith(`${process.env.S3_PUBLIC_URL}/avatars/`), first);
    assert.equal(await status(first), 200);
    assert.equal((await saveProfile(first)).status, 200);

    const second = await upload();
    assert.equal((await saveProfile(second)).status, 200);

    // Cleanup of the replaced file is best-effort and not awaited by the request.
    for (let attempt = 0; attempt < 20 && (await status(first)) !== 404; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(await status(first), 404, "the replaced avatar should be gone");
    assert.equal(await status(second), 200);
  });
});
