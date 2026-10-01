const assert = require("node:assert/strict");
const { test } = require("node:test");

const { getEnvProblems } = require("../src/config/env");
const { describeConfig, SECRET_VARIABLES } = require("../src/config/summary");
const { isStrongPassword } = require("../src/utils/password");
const { escapeHtml } = require("../src/utils/html");
const { listMigrationFiles } = require("../src/db/migrate");
const { assertResetAllowed } = require("../src/db/reset");
const { dateInTimezone, daysBetween, isValidTimezone } = require("../src/utils/time");
const { formatVnpayDate, getVnpayConfig } = require("../src/services/vnpayService");
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

test("the VNPay return URL follows the web address unless set explicitly", () => {
  const saved = { ...process.env };
  try {
    delete process.env.VNPAY_RETURN_URL;
    delete process.env.CLIENT_URL;
    process.env.FRONTEND_URL = "https://stay.example.com/";
    assert.equal(getVnpayConfig().returnUrl, "https://stay.example.com/payment/result");

    process.env.VNPAY_RETURN_URL = "https://other.example.com/done";
    assert.equal(getVnpayConfig().returnUrl, "https://other.example.com/done");
  } finally {
    process.env = saved;
  }
});

test("the startup summary shows what is configured without printing any secret", () => {
  const saved = { ...process.env };
  try {
    // Every secret gets a recognisable value; none of them may show up.
    for (const name of SECRET_VARIABLES) process.env[name] = `LEAK-${name}-VALUE`;
    Object.assign(process.env, {
      NODE_ENV: "production",
      CLIENT_URL: "https://stay.example.com",
      FRONTEND_URL: "https://stay.example.com",
      ALLOWED_ORIGINS: "https://abc.trycloudflare.com",
      TRUST_PROXY_HOPS: "2",
      AUTH_COOKIE_SECURE: "true",
      AUTH_COOKIE_SAME_SITE: "lax",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "587",
      SMTP_FROM: "LuxeStay <no-reply@example.com>",
      VNPAY_PAY_URL: "https://user:LEAK-URL-PASSWORD@sandbox.vnpayment.vn/paymentv2/vpcpay.html?token=LEAK-QUERY",
      MOMO_ENABLED: "false",
    });
    delete process.env.VNPAY_RETURN_URL;

    const text = describeConfig().join("\n");

    assert.doesNotMatch(text, /LEAK-/);
    assert.match(text, /Web address\s+https:\/\/stay\.example\.com/);
    assert.match(text, /Allowed origins\s+https:\/\/stay\.example\.com, https:\/\/abc\.trycloudflare\.com/);
    assert.match(text, /Trusted proxies\s+2/);
    assert.match(text, /Session cookie\s+secure=true sameSite=lax/);
    assert.match(text, /Email\s+on/);
    assert.match(text, /VNPay\s+on/);
    assert.match(text, /pay URL\s+https:\/\/sandbox\.vnpayment\.vn\/paymentv2\/vpcpay\.html$/m);
    assert.match(text, /return URL\s+https:\/\/stay\.example\.com\/payment\/result/);
    assert.match(text, /MoMo\s+off \(MOMO_ENABLED is not true\)/);
    assert.match(text, /VNPAY_HASH_SECRET=set/);
    assert.match(text, /JWT_SECRET=set/);

    delete process.env.VNPAY_HASH_SECRET;
    const withoutSecret = describeConfig().join("\n");
    assert.match(withoutSecret, /VNPay\s+off \(missing: VNPAY_HASH_SECRET\)/);
    assert.match(withoutSecret, /VNPAY_HASH_SECRET=empty/);
  } finally {
    process.env = saved;
  }
});

test("booking emails escape what guests and admins typed", () => {
  const { buildBookingEmail } = require("../src/services/bookingEmails");
  const email = buildBookingEmail(
    "confirmed",
    {
      id: 7,
      language: "vi",
      user_name: '<script>alert("x")</script>',
      room_name: "Phòng <b>VIP</b>",
      room_location: "Hà Nội",
      check_in: "2031-03-11",
      check_out: "2031-03-13",
      guests: 2,
      total_price: 1500000,
      discount_amount: 0,
      payment_status: "paid",
    },
    {
      name: "Nhà nghỉ <Hoa & Sữa>",
      phone: "0901",
      email: "",
      address: "",
      checkInTime: "14:00",
      checkOutTime: "12:00",
      freeCancellationDays: 3,
    }
  );

  assert.equal(email.subject, "Xác nhận đặt phòng #BK-0007");
  assert.doesNotMatch(email.html, /<script>|<b>VIP<\/b>|<Hoa/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /Nhà nghỉ &lt;Hoa &amp; Sữa&gt;/);
  // The plain-text part keeps the original characters.
  assert.ok(email.text.includes("Nhà nghỉ <Hoa & Sữa>"));
  assert.ok(email.text.includes("1.500.000 đ"));
  assert.ok(email.text.includes("từ 14:00"));
  assert.ok(email.text.includes("trước 12:00"));
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
