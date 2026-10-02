const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { pruneUploads } = require("../src/scripts/prune-uploads");

const DAY = 24 * 60 * 60 * 1000;

// A pool that answers each reference query with the given rows.
function fakePool(refs) {
  return {
    query: async (sql) => {
      if (sql.includes("FROM rooms")) return { rows: refs.rooms || [] };
      if (sql.includes("FROM room_images")) return { rows: refs.roomImages || [] };
      if (sql.includes("FROM users")) return { rows: refs.users || [] };
      if (sql.includes("FROM property_settings")) return { rows: refs.settings || [] };
      throw new Error("unexpected query: " + sql);
    },
  };
}

function makeUploads(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "luxestay-prune-"));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), "x");
  }
  return root;
}

test("uploads:prune lists only old files nothing refers to, and deletes only when asked", async () => {
  const root = makeUploads([
    "rooms/main.png",
    "rooms/gallery.png",
    "rooms/absolute.png",
    "rooms/orphan.png",
    "avatars/used.png",
    "avatars/orphan.png",
    "branding/logo.png",
  ]);
  const pool = fakePool({
    rooms: [{ ref: "/uploads/rooms/main.png" }, { ref: "http://localhost:5000/uploads/rooms/absolute.png" }],
    roomImages: [{ ref: "/uploads/rooms/gallery.png" }],
    users: [{ ref: "/uploads/avatars/used.png" }, { ref: "https://lh3.example/photo.jpg" }],
    settings: [{ ref: "/uploads/branding/logo.png" }],
  });

  try {
    // Fresh files are left alone: someone may be about to save the form.
    assert.deepEqual(await pruneUploads(pool, { uploadsRoot: root, remove: true }), []);

    const later = Date.now() + 2 * DAY;
    const listed = await pruneUploads(pool, { uploadsRoot: root, now: later });
    assert.deepEqual(listed.map((item) => `${item.folder}/${item.file}`).sort(), ["avatars/orphan.png", "rooms/orphan.png"]);
    assert.ok(fs.existsSync(path.join(root, "rooms/orphan.png")), "a dry run must not delete");

    await pruneUploads(pool, { uploadsRoot: root, remove: true, now: later });
    assert.ok(!fs.existsSync(path.join(root, "rooms/orphan.png")));
    assert.ok(!fs.existsSync(path.join(root, "avatars/orphan.png")));
    for (const kept of ["rooms/main.png", "rooms/gallery.png", "rooms/absolute.png", "avatars/used.png", "branding/logo.png"]) {
      assert.ok(fs.existsSync(path.join(root, kept)), kept + " is referenced and must stay");
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
