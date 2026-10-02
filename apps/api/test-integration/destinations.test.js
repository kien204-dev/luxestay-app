// The seed's destination photos on real PostgreSQL: every sample destination
// gets its bundled photo and credit, the home page query returns them, and
// seeding again leaves an admin's choice alone.
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
const fs = require("node:fs");
const path = require("node:path");
const { after, before, describe, it } = require("node:test");

const pool = require("../src/db/db");
const { reset } = require("../src/db/reset");
const { seed } = require("../src/db/seed");
const app = require("../server");

const credits = JSON.parse(fs.readFileSync(path.join(__dirname, "../seed-assets/destinations/credits.json"), "utf8"));

let server;
let baseUrl;

describe("seeded destination photos", () => {
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

  it("gives every sample destination its bundled photo and credit", async () => {
    const response = await fetch(`${baseUrl}/api/rooms/destinations`);
    assert.equal(response.status, 200);
    const destinations = await response.json();

    // The names come from the room data; each one has a bundled photo.
    assert.equal(destinations.length, credits.length);
    for (const destination of destinations) {
      const credit = credits.find((item) => item.destination === destination.name);
      assert.ok(credit, `no bundled photo for ${destination.name}`);
      assert.equal(destination.image, `/uploads/destinations/seed-${credit.file}`);
      assert.equal(destination.credit.license, credit.license);
      assert.equal(destination.credit.author, credit.author);

      const image = await fetch(`${baseUrl}${destination.image}`);
      assert.equal(image.status, 200, destination.image);
    }

    const page = await (await fetch(`${baseUrl}/api/destinations/credits`)).json();
    assert.equal(page.length, credits.length);
    assert.ok(page.every((item) => item.sourceUrl.startsWith("https://commons.wikimedia.org/wiki/File:")));
  });

  it("does not overwrite a photo an admin chose when seeding again", async () => {
    await pool.query("UPDATE destination_images SET image_url = '/uploads/destinations/chosen.png' WHERE name = 'Hà Nội'");
    await seed(pool, { log: () => {} });

    const row = await pool.query("SELECT image_url FROM destination_images WHERE name = 'Hà Nội'");
    assert.equal(row.rows[0].image_url, "/uploads/destinations/chosen.png");
  });
});
