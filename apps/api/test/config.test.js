const assert = require("node:assert/strict");
const { test } = require("node:test");

const { getEnvProblems } = require("../src/config/env");
const { isStrongPassword } = require("../src/utils/password");
const { escapeHtml } = require("../src/utils/html");
const { listMigrationFiles } = require("../src/db/migrate");
const { assertResetAllowed } = require("../src/db/reset");
const { dateInTimezone, daysBetween, isValidTimezone } = require("../src/utils/time");
const { formatVnpayDate } = require("../src/services/vnpayService");
const { buildAllowedOrigins, getPublicWebUrl } = require("../src/services/allowedOrigins");

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

test("startup config check rejects an unknown timezone", () => {
  assert.match(getEnvProblems({ ...validEnv, APP_TIMEZONE: "Mars/Olympus" })[0], /APP_TIMEZONE/);
  assert.deepEqual(getEnvProblems({ ...validEnv, APP_TIMEZONE: "Asia/Ho_Chi_Minh" }), []);
  assert.equal(isValidTimezone("Asia/Ho_Chi_Minh"), true);
});

test("the property date follows its timezone, not the server clock", () => {
  // 18:30 UTC on the 10th is already 01:30 on the 11th in Vietnam.
  const instant = new Date("2031-03-10T18:30:00Z");
  assert.equal(dateInTimezone(instant, "Asia/Ho_Chi_Minh"), "2031-03-11");
  assert.equal(dateInTimezone(instant, "UTC"), "2031-03-10");
  assert.equal(dateInTimezone(new Date("2031-03-10T16:59:59Z"), "Asia/Ho_Chi_Minh"), "2031-03-10");

  assert.equal(daysBetween("2031-03-11", "2031-03-14"), 3);
  assert.equal(daysBetween("2031-03-11", "2031-03-10"), -1);
  assert.equal(daysBetween("2031-02-27", "2031-03-01"), 2);
});

test("VNPay timestamps are GMT+7 whatever the server timezone", () => {
  assert.equal(formatVnpayDate(new Date("2031-03-10T18:30:05Z")), "20310311013005");
  assert.equal(formatVnpayDate(new Date("2030-12-31T17:00:00Z")), "20310101000000");
});

test("allowed origins accept a comma separated list on top of the main address", () => {
  const origins = buildAllowedOrigins({
    NODE_ENV: "production",
    CLIENT_URL: "https://stay.example.com/",
    FRONTEND_URL: "https://stay.example.com",
    ALLOWED_ORIGINS: " https://abc.trycloudflare.com/ , http://localhost:8080,, ",
  });

  assert.deepEqual(
    [...origins].sort(),
    ["http://localhost:8080", "https://abc.trycloudflare.com", "https://stay.example.com"]
  );
});

test("allowed origins only include the dev server outside production", () => {
  assert.deepEqual([...buildAllowedOrigins({ NODE_ENV: "production" })], []);
  assert.deepEqual([...buildAllowedOrigins({})], ["http://localhost:5173"]);
});

test("the public web URL is the main address, without a trailing slash", () => {
  assert.equal(getPublicWebUrl({ FRONTEND_URL: "https://stay.example.com/" }), "https://stay.example.com");
  assert.equal(getPublicWebUrl({ CLIENT_URL: "https://c.example.com" }), "https://c.example.com");
  assert.equal(getPublicWebUrl({}), "http://localhost:5173");
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
