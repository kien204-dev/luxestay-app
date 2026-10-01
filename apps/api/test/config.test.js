const assert = require("node:assert/strict");
const { test } = require("node:test");

const { getEnvProblems } = require("../src/config/env");
const { isStrongPassword } = require("../src/utils/password");
const { escapeHtml } = require("../src/utils/html");
const { listMigrationFiles } = require("../src/db/migrate");
const { assertResetAllowed } = require("../src/db/reset");

const validEnv = {
  DB_USER: "postgres",
  DB_PASSWORD: "secret",
  DB_NAME: "luxestay",
  JWT_SECRET: "x".repeat(32),
};

test("startup config check accepts a complete environment", () => {
  assert.deepEqual(getEnvProblems(validEnv), []);
});

test("startup config check reports missing, short and placeholder values", () => {
  assert.equal(getEnvProblems({}).length, 4);
  assert.match(getEnvProblems({ ...validEnv, JWT_SECRET: "short" })[0], /at least 32/);
  assert.match(
    getEnvProblems({ ...validEnv, JWT_SECRET: "replace_with_a_long_random_secret" })[0],
    /placeholder/
  );
});

test("password rule needs 8+ characters with letters and numbers", () => {
  assert.equal(isStrongPassword("abc12345"), true);
  assert.equal(isStrongPassword("abc1234"), false);
  assert.equal(isStrongPassword("abcdefgh"), false);
  assert.equal(isStrongPassword("12345678"), false);
  assert.equal(isStrongPassword(12345678), false);
});

test("escapeHtml neutralises markup in user-supplied text", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('1')">&`),
    "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;"
  );
});

test("migrations run in order, starting with the base schema", () => {
  const files = listMigrationFiles();
  assert.equal(files[0], "000_base_schema.sql");
  assert.deepEqual(files, [...files].sort());
});

test("db:reset refuses non-local or production databases unless allowed", () => {
  const saved = { ...process.env };
  try {
    delete process.env.ALLOW_DB_RESET;
    process.env.NODE_ENV = "development";

    process.env.DB_HOST = "localhost";
    assert.doesNotThrow(assertResetAllowed);

    process.env.DB_HOST = "ep-example.neon.tech";
    assert.throws(assertResetAllowed, /Refusing to reset/);

    process.env.DB_HOST = "localhost";
    process.env.NODE_ENV = "production";
    assert.throws(assertResetAllowed, /Refusing to reset/);

    process.env.ALLOW_DB_RESET = "true";
    assert.doesNotThrow(assertResetAllowed);
  } finally {
    process.env = saved;
  }
});
