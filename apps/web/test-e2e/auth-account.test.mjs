// The sign-in pages, My account, photo credits, 404 and 403 in a real
// browser, against the built web app and the real API: every state of each
// page, both themes, the phone layout, and what each shows coming from the
// API (demo sign-ins, Google on or off, the password rule, the reset link's
// lifetime, the image limits).
//
// Screenshots are written to test-results/phase-9/app/.
//
// Run with `npm run test:e2e` from the repository root.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { startInbox } from "./inbox.mjs";
import { startStack } from "./stack.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = path.resolve(HERE, "../../../test-results/phase-9/app");
const AUTH = JSON.parse(fs.readFileSync(path.join(HERE, "../src/locales/vi/auth.json"), "utf8"));
const ACCOUNT = JSON.parse(fs.readFileSync(path.join(HERE, "../src/locales/vi/account.json"), "utf8"));
const requireApi = createRequire(path.resolve(HERE, "../../api/server.js"));

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const ADMIN = { email: "admin@example.com", password: "Admin-E2E-12345" };

let stack;
let inbox;
let accounts = 0;

async function openPage({ viewport = DESKTOP, colorScheme = "light" } = {}) {
  const context = await stack.browser.newContext({ locale: "vi-VN", viewport, colorScheme });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    // Requests a test refuses on purpose (wrong password, 403...) and the
    // websocket this test server does not carry are not errors in the page.
    if (message.type() === "error" && !/Failed to load resource|WebSocket|Google sign-in failed/i.test(text)) {
      problems.push(`console: ${text}`);
    }
  });
  return { context, page, problems };
}

async function shot(page, name) {
  fs.mkdirSync(SCREENSHOTS, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  // Lazy images below the fold load once scrolled to; never wait on one for long.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    window.scrollTo(0, 0);
    const settle = (image) => Promise.race([image.decode().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 2000))]);
    await Promise.all(Array.from(document.images, settle));
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SCREENSHOTS, `${name}.png`), fullPage: true });
}

// The heading levels in page order never skip one (h1 → h3).
async function headingSkips(page) {
  return page.evaluate(() => {
    const levels = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      .filter((heading) => heading.getClientRects().length > 0)
      .map((heading) => Number(heading.tagName[1]));
    const skips = [];
    levels.forEach((level, index) => {
      const previous = index ? levels[index - 1] : 0;
      if (level > previous + 1) skips.push(`h${previous || 0} → h${level}`);
    });
    return { levels, skips };
  });
}

async function sidewaysOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function api(pathname, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${stack.baseUrl}${pathname}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null), cookie: response.headers.get("set-cookie")?.split(";", 1)[0] };
}

// A new guest account of its own for each test.
async function newGuest(name = "Khách Thử") {
  accounts += 1;
  const account = { name, email: `guest${accounts}.${Date.now()}@example.com`, password: "Guest-pass-2026" };
  const created = await api("/api/register", { method: "POST", body: account });
  assert.equal(created.status, 201);
  return account;
}

// Signs the page's browser in as the account (cookie + the user the app
// remembers), the way the login form leaves it.
async function signIn(page, account) {
  const response = await page.request.post(`${stack.baseUrl}/api/login`, { data: { email: account.email, password: account.password } });
  assert.equal(response.status(), 200);
  const { user } = await response.json();
  await page.goto(`${stack.baseUrl}/credits`);
  await page.evaluate((stored) => localStorage.setItem("user", JSON.stringify(stored)), user);
  return user;
}

// Layout shifts after the page starts drawing, with the API answering
// `delayMs` late (a real network), as a sum like CLS.
async function layoutShift(url, viewport, delayMs) {
  const { context, page } = await openPage({ viewport });
  await page.route("**/api/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.continue();
  });
  await page.addInitScript(() => {
    window.__shift = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  await page.goto(url);
  await page.getByTestId("login-page").waitFor();
  await page.waitForTimeout(delayMs + 500);
  const shift = await page.evaluate(() => window.__shift);
  await context.close();
  return shift;
}

describe("Sign-in pages, My account and the small pages in the browser", () => {
  before(async () => {
    inbox = await startInbox();
    process.env.SEED_ADMIN_PASSWORD = ADMIN.password;
    stack = await startStack();
    // Reset emails go to the test inbox.
    Object.assign(process.env, { SMTP_HOST: "127.0.0.1", SMTP_PORT: String(inbox.port), SMTP_FROM: "LuxeStay <no-reply@example.com>", RESET_TOKEN_TTL_MINUTES: "20" });
  });

  after(async () => {
    process.env.DEMO_MODE = "";
    await stack?.stop();
    await inbox?.close();
  });

  it("login: demo sign-ins from the API, Google button, errors under their box, the admin notice", async () => {
    process.env.DEMO_MODE = "true";
    const { getSeedAccounts } = requireApi("./src/db/seed");
    for (const [viewport, label] of [[DESKTOP, "desktop"], [PHONE, "mobile"]]) {
      for (const colorScheme of ["light", "dark"]) {
        const { context, page, problems } = await openPage({ viewport, colorScheme });
        await page.goto(`${stack.baseUrl}/login`);
        await page.getByTestId("login-page").waitFor();
        const strip = await page.getByTestId("demo-accounts").innerText();
        for (const account of getSeedAccounts()) {
          assert.ok(strip.includes(account.email) && strip.includes(account.password), `demo strip lists ${account.email}`);
        }
        assert.equal(await page.getByTestId("google-sign-in").count(), 1);
        assert.deepEqual((await headingSkips(page)).skips, []);
        assert.ok((await sidewaysOverflow(page)) <= 0, "nothing sticks out sideways");
        await shot(page, `login-${label}-${colorScheme}`);
        assert.deepEqual(problems, []);
        await context.close();
      }
    }

    // Not a demo: no strip. Google switched off on the API: no button, no "or".
    process.env.DEMO_MODE = "";
    {
      const { context, page } = await openPage();
      await page.route("**/api/settings/public", async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        await route.fulfill({ response, json: { ...body, auth: { ...body.auth, googleLogin: false } } });
      });
      await page.goto(`${stack.baseUrl}/login`);
      await page.getByTestId("login-page").waitFor();
      assert.equal(await page.getByTestId("demo-banner").count(), 0);
      assert.equal(await page.getByTestId("google-sign-in").count(), 0);
      assert.equal(await page.locator(".au__or").count(), 0);
      await shot(page, "login-desktop-no-demo-no-google");
      await context.close();
    }

    const guest = await newGuest();
    const { context, page, problems } = await openPage();
    await page.goto(`${stack.baseUrl}/login`);
    await page.getByTestId("login-page").waitFor();

    // Format errors, each under its own box.
    await page.locator("#login-email").fill("minhanh@gmail");
    await page.getByRole("button", { name: AUTH.login.signIn, exact: true }).click();
    assert.equal(await page.locator("#login-email-error").innerText(), AUTH.errors.invalidEmail);
    assert.equal(await page.locator("#login-password-error").innerText(), AUTH.errors.passwordRequired);
    assert.equal(await page.locator("#login-email").getAttribute("aria-invalid"), "true");
    assert.equal(await page.locator("#login-email").getAttribute("aria-describedby"), "login-email-error");
    await shot(page, "login-desktop-errors");

    // Wrong password: said under the password box, without saying which was wrong.
    await page.locator("#login-email").fill(guest.email);
    await page.locator("#login-password").fill("Wrong-pass-1");
    await page.getByRole("button", { name: AUTH.login.signIn, exact: true }).click();
    await page.locator("#login-password-error").waitFor();
    assert.equal(await page.locator("#login-password-error").innerText(), AUTH.errors.wrongCredentials);
    await shot(page, "login-desktop-wrong-password");

    // An admin's Google account: refused by the API (403), notice names it.
    await page.evaluate((email) => { window.__e2eGoogleAccount = { uid: "google-admin", email, name: "Admin" }; }, ADMIN.email);
    await page.getByTestId("google-sign-in").click();
    const notice = page.getByTestId("admin-notice");
    await notice.waitFor();
    assert.ok((await notice.innerText()).includes(ADMIN.email));
    assert.ok((await notice.innerText()).includes(AUTH.adminNotice.title));
    assert.equal(await page.locator("#login-email").inputValue(), ADMIN.email);
    assert.equal((await page.request.get(`${stack.baseUrl}/api/users/me`)).status(), 401, "no session for the admin");
    await shot(page, "login-desktop-admin-notice");
    await page.evaluate(() => { delete window.__e2eGoogleAccount; });

    // Submitting: the button keeps its size and shows it is busy.
    await page.route("**/api/login", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.locator("#login-email").fill(guest.email);
    await page.locator("#login-password").fill(guest.password);
    const button = page.getByRole("button", { name: AUTH.login.signIn, exact: true });
    const before = await button.boundingBox();
    await button.click();
    await page.locator("button.is-loading[aria-busy='true']").waitFor();
    const during = await page.locator("button.is-loading").boundingBox();
    assert.deepEqual([during.width, during.height], [before.width, before.height]);
    await shot(page, "login-desktop-submitting");
    await page.waitForURL(`${stack.baseUrl}/`);
    assert.deepEqual(problems, []);
    await context.close();
  });

  it("login: nothing moves while the API answers late, and the only heading is the h1", async () => {
    process.env.DEMO_MODE = "true";
    for (const viewport of [PHONE, DESKTOP]) {
      const shift = await layoutShift(`${stack.baseUrl}/login`, viewport, 800);
      assert.ok(shift < 0.01, `layout shift ${shift.toFixed(3)} at ${viewport.width}px`);
    }
    const { context, page } = await openPage({ viewport: PHONE });
    await page.goto(`${stack.baseUrl}/login`);
    await page.getByTestId("login-page").waitFor();
    assert.deepEqual((await headingSkips(page)).levels, [1]);
    await context.close();
    process.env.DEMO_MODE = "";
  });

  it("sign-up: meter and checklist from the API's rule, errors under their box, an email already used", async () => {
    const existing = await newGuest();
    const settings = await api("/api/settings/public");
    const { context, page, problems } = await openPage();
    await page.goto(`${stack.baseUrl}/register`);
    await page.getByTestId("register-page").waitFor();
    await shot(page, "register-desktop-light");

    // The checklist is the API's rule, nothing more.
    const rules = await page.getByTestId("password-rules").locator("li").count();
    assert.equal(rules, settings.body.auth.passwordRules.length);

    await page.getByRole("button", { name: AUTH.register.create }).click();
    assert.equal(await page.locator("#register-name-error").innerText(), AUTH.errors.nameRequired);
    assert.equal(await page.locator("#register-email-error").innerText(), AUTH.errors.invalidEmail);
    assert.equal(await page.locator("#register-password-error").innerText(), AUTH.errors.passwordRequired);
    await shot(page, "register-desktop-errors");

    const meter = page.locator(".pw-meter");
    for (const [password, strength, met] of [["abc", "weak", 1], ["abcdefgh", "medium", 2], ["abcdefg1", "strong", 3]]) {
      await page.locator("#register-password").fill(password);
      assert.equal(await meter.getAttribute("data-strength"), strength, password);
      assert.equal(await page.locator(".pw-rules li.ok").count(), met, password);
      if (strength !== "strong") await shot(page, `register-desktop-${strength}`);
    }
    // "ă" alone is not a letter to the API, so not to the checklist either.
    await page.locator("#register-password").fill("ăăăăăăă1");
    assert.equal(await meter.getAttribute("data-strength"), "medium");

    await page.locator("#register-name").fill("Khách Mới");
    await page.locator("#register-email").fill(existing.email);
    await page.locator("#register-password").fill("Another-pass-1");
    await page.getByRole("button", { name: AUTH.register.create }).click();
    const exists = page.locator("#register-email-error");
    await exists.waitFor();
    assert.ok((await exists.innerText()).startsWith("Email này đã có tài khoản."));
    assert.equal(await exists.locator("a").count(), 2);
    await shot(page, "register-desktop-email-exists");

    const email = `new.${Date.now()}@example.com`;
    await page.locator("#register-email").fill(email);
    await page.getByRole("button", { name: AUTH.register.create }).click();
    await page.waitForURL(/\/login/);
    assert.equal(await page.locator("#login-email").inputValue(), email);
    assert.ok((await page.getByRole("status").first().innerText()).includes(AUTH.register.success));
    await shot(page, "register-desktop-done-login");
    assert.deepEqual(problems, []);
    await context.close();

    for (const colorScheme of ["light", "dark"]) {
      const phone = await openPage({ viewport: PHONE, colorScheme });
      await phone.page.goto(`${stack.baseUrl}/register`);
      await phone.page.getByTestId("register-page").waitFor();
      await phone.page.locator("#register-password").fill("abcdefgh");
      await phone.page.getByRole("button", { name: AUTH.register.create }).click();
      assert.ok((await sidewaysOverflow(phone.page)) <= 0);
      await shot(phone.page, `register-mobile-${colorScheme}-errors`);
      await phone.context.close();
    }
  });

  it("password reset: the real email, send again by the API's limit, the new password, used and expired links", async () => {
    const guest = await newGuest("Khách Quên Mật Khẩu");
    const { context, page, problems } = await openPage();
    await page.goto(`${stack.baseUrl}/login`);
    await page.locator("#login-email").fill(guest.email);
    await page.getByRole("link", { name: AUTH.login.forgot }).click();
    await page.getByTestId("forgot-page").waitFor();
    // Carried over from the login form; the link lifetime is the API's.
    assert.equal(await page.locator("#forgot-email").inputValue(), guest.email);
    assert.ok((await page.locator(".au__lead").innerText()).includes("20 phút"));
    await shot(page, "forgot-desktop-light");

    await page.locator("#forgot-email").fill("not-an-email");
    await page.getByRole("button", { name: AUTH.forgot.send }).click();
    assert.equal(await page.locator("#forgot-email-error").innerText(), AUTH.errors.invalidEmail);
    await shot(page, "forgot-desktop-error");

    await page.locator("#forgot-email").fill(guest.email);
    const mark = inbox.messages.length;
    await page.getByRole("button", { name: AUTH.forgot.send }).click();
    await page.getByTestId("forgot-sent").waitFor();
    assert.ok((await page.getByTestId("forgot-sent").innerText()).includes(guest.email));
    await shot(page, "sent-desktop-light");
    const email = await inbox.next(guest.email, mark);
    const link = email.text.match(/https?:\/\/[^\s"<>]+\/reset-password\?token=[a-f0-9]+/)[0];

    // The same answer for an email with no account (nothing is given away).
    const unknown = await api("/api/forgot-password", { method: "POST", body: { email: "nobody@example.com" } });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.body.code, "RESET_EMAIL_SENT");

    // Send again: the limiter is off in tests, so the answer carries no rate
    // limit headers and the button stays available.
    assert.equal(await page.getByTestId("resend").isEnabled(), true);
    // With the API's limit used up (the headers as the API sends them), it
    // counts down for as long as the API says.
    await page.route("**/api/forgot-password", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", headers: { RateLimit: '"5-in-1hrs"; r=0; t=42' }, body: JSON.stringify({ code: "RESET_EMAIL_SENT" }) })
    );
    await page.getByTestId("resend").click();
    await page.getByTestId("resend-limit").waitFor();
    assert.equal(await page.getByTestId("resend").isDisabled(), true);
    assert.match(await page.getByTestId("resend").innerText(), /^Gửi lại sau 0:4[12]$/);
    assert.ok((await page.getByTestId("resend-limit").innerText()).includes("5 lần gửi trong 60 phút"));
    await shot(page, "sent-desktop-countdown");
    await page.unroute("**/api/forgot-password");

    for (const colorScheme of ["light", "dark"]) {
      const phone = await openPage({ viewport: PHONE, colorScheme });
      await phone.page.goto(`${stack.baseUrl}/forgot-password`);
      await phone.page.locator("#forgot-email").fill("someone@example.com");
      await phone.page.getByRole("button", { name: AUTH.forgot.send }).click();
      await phone.page.getByTestId("forgot-sent").waitFor();
      await shot(phone.page, `sent-mobile-${colorScheme}`);
      await phone.context.close();
    }

    // The link from the email: names the account, checklist, meter.
    await page.goto(link);
    await page.getByTestId("reset-page").waitFor();
    assert.ok((await page.locator(".au__lead").innerText()).includes(guest.email));
    const save = page.getByRole("button", { name: AUTH.reset.submit });
    await page.locator("#reset-password").fill("anh123");
    assert.equal(await save.isDisabled(), true, "a password the API would refuse cannot be sent");
    await shot(page, "reset-desktop-weak");
    await page.locator("#reset-password").fill("Vinh-Ha-Long-2026");
    await page.locator("#reset-confirm").fill("Vinh-Ha-Long-2025");
    await shot(page, "reset-desktop-strong");
    await save.click();
    assert.equal(await page.locator("#reset-confirm-error").innerText(), AUTH.errors.passwordMismatch);
    await shot(page, "reset-desktop-mismatch");
    await page.locator("#reset-confirm").fill("Vinh-Ha-Long-2026");
    await save.click();
    await page.getByTestId("reset-done").waitFor();
    await shot(page, "reset-desktop-done");
    assert.equal((await api("/api/login", { method: "POST", body: { email: guest.email, password: "Vinh-Ha-Long-2026" } })).status, 200);

    // The same link again: used.
    await page.goto(link);
    await page.getByTestId("reset-used").waitFor();
    await shot(page, "reset-desktop-used");

    // An expired link: its own times.
    const token = crypto.randomBytes(32).toString("hex");
    await stack.pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at)
       SELECT id, $2, NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '30 minutes' FROM users WHERE email = $1`,
      [guest.email, crypto.createHash("sha256").update(token).digest("hex")]
    );
    await page.goto(`${stack.baseUrl}/reset-password?token=${token}`);
    await page.getByTestId("reset-expired").waitFor();
    assert.ok((await page.locator(".au__lead").innerText()).includes("20 phút"));
    await shot(page, "reset-desktop-expired");

    await page.goto(`${stack.baseUrl}/reset-password?token=not-a-token`);
    await page.getByTestId("reset-invalid").waitFor();
    await shot(page, "reset-desktop-invalid");
    assert.deepEqual(problems, []);
    await context.close();

    for (const colorScheme of ["light", "dark"]) {
      const phone = await openPage({ viewport: PHONE, colorScheme });
      await phone.page.goto(`${stack.baseUrl}/reset-password?token=${token}`);
      await phone.page.getByTestId("reset-expired").waitFor();
      await shot(phone.page, `reset-mobile-${colorScheme}-expired`);
      await phone.context.close();
    }
  });

  it("My account: photo with progress, cancel and the pipeline's limits, details, password", async () => {
    const guest = await newGuest("Nguyễn Thử Nghiệm");
    const { context, page, problems } = await openPage();
    await signIn(page, guest);
    await page.goto(`${stack.baseUrl}/settings`);
    await page.getByTestId("profile-form").waitFor();
    assert.equal(await page.locator(".av__img").innerText(), "TN");
    assert.deepEqual((await headingSkips(page)).skips, []);
    await shot(page, "account-desktop-light-initials");

    // Limits of the image pipeline (10 MB; JPG, PNG, WEBP), said at once.
    const input = page.getByTestId("avatar-input");
    await input.setInputFiles({ name: "big.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(11 * 1024 * 1024) });
    assert.match(await page.getByTestId("avatar-error").innerText(), /Ảnh quá lớn \(11 MB\)\. Chọn ảnh JPG, PNG hoặc WEBP tối đa 10 MB\./);
    await shot(page, "account-desktop-avatar-too-large");
    await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    assert.equal(await page.getByTestId("avatar-error").innerText(), ACCOUNT.avatar.badType);

    // A real photo over a slow line: progress, then cancel.
    const sharp = requireApi("sharp");
    const photo = await sharp({ create: { width: 1600, height: 1600, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 60 } } }).jpeg({ quality: 95 }).toBuffer();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: 256 * 1024 });
    await input.setInputFiles({ name: "anh-dai-dien.jpg", mimeType: "image/jpeg", buffer: photo });
    const progress = page.getByTestId("avatar-progress");
    await progress.waitFor();
    await page.waitForTimeout(1500);
    assert.match(await progress.innerText(), /Đang tải lên anh-dai-dien\.jpg · \d+% · [\d,]+ MB/);
    await shot(page, "account-desktop-avatar-uploading");
    await page.getByRole("button", { name: ACCOUNT.avatar.cancel }).click();
    await progress.waitFor({ state: "detached" });
    assert.equal((await api("/api/users/me", { cookie: (await context.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") })).body.avatar_url, null);

    // And all the way: saved on the account straight away.
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await input.setInputFiles({ name: "anh-dai-dien.jpg", mimeType: "image/jpeg", buffer: photo });
    await page.locator(".av__img img").waitFor();
    await page.getByRole("button", { name: ACCOUNT.avatar.remove }).waitFor();
    await shot(page, "account-desktop-avatar-photo");

    // Details: phone checked as the API checks it, error under the box.
    await page.locator("#profile-phone").fill("908 214");
    await page.getByRole("button", { name: ACCOUNT.profile.save }).click();
    assert.equal(await page.locator("#profile-phone-error").innerText(), ACCOUNT.profile.phoneInvalid);
    await page.locator("#profile-email").fill(ADMIN.email);
    await page.locator("#profile-phone").fill("0908 214 556");
    await page.getByRole("button", { name: ACCOUNT.profile.save }).click();
    await page.locator("#profile-email-error").waitFor();
    await shot(page, "account-desktop-details-errors");

    await page.locator("#profile-email").fill(guest.email);
    await page.route("**/api/users/me", async (route) => {
      if (route.request().method() === "PUT") await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.continue();
    });
    await page.getByRole("button", { name: ACCOUNT.profile.save }).click();
    await page.locator(".ac-card__f .is-loading").waitFor();
    await shot(page, "account-desktop-saving");
    await page.getByText(ACCOUNT.profile.saved).waitFor();
    await page.unroute("**/api/users/me");
    // The photo stayed through the details save.
    assert.equal(await page.locator(".av__img img").count(), 1);

    // Remove the photo: back to the initials.
    await page.getByRole("button", { name: ACCOUNT.avatar.remove }).click();
    await page.getByText(ACCOUNT.avatar.removed).waitFor();
    assert.equal(await page.locator(".av__img img").count(), 0);

    // Password: the current one wrong, said under its box.
    await page.getByRole("link", { name: ACCOUNT.nav.password }).click();
    await page.getByTestId("password-form").waitFor();
    await shot(page, "account-desktop-password");
    await page.locator("#password-current").fill("Not-my-pass-1");
    await page.locator("#password-new").fill("Vinh-Ha-Long-2026");
    await page.locator("#password-confirm").fill("Vinh-Ha-Long-2026");
    await page.getByRole("button", { name: ACCOUNT.password.submit }).click();
    await page.locator("#password-current-error").waitFor();
    assert.equal(await page.locator("#password-current-error").innerText(), "Mật khẩu hiện tại không đúng.");
    await shot(page, "account-desktop-password-wrong-current");
    await page.locator("#password-current").fill(guest.password);
    await page.getByRole("button", { name: ACCOUNT.password.submit }).click();
    await page.getByText(ACCOUNT.password.changed).waitFor();
    assert.deepEqual(problems, []);

    // Sign out from the account menu.
    await page.getByTestId("account-page").getByRole("button", { name: ACCOUNT.nav.logout }).click();
    await page.waitForURL(`${stack.baseUrl}/`);
    await context.close();

    // Dark, and the phone layout.
    const other = await newGuest("Trần Minh Anh");
    for (const [viewport, label] of [[DESKTOP, "desktop"], [PHONE, "mobile"]]) {
      for (const colorScheme of ["light", "dark"]) {
        if (label === "desktop" && colorScheme === "light") continue;
        const view = await openPage({ viewport, colorScheme });
        await signIn(view.page, other);
        await view.page.goto(`${stack.baseUrl}/settings`);
        await view.page.getByTestId("profile-form").waitFor();
        assert.ok((await sidewaysOverflow(view.page)) <= 0);
        await shot(view.page, `account-${label}-${colorScheme}`);
        await view.page.goto(`${stack.baseUrl}/settings/password`);
        await view.page.getByTestId("password-form").waitFor();
        await view.page.locator("#password-new").fill("abcdefgh");
        await view.page.getByRole("button", { name: ACCOUNT.password.submit }).click();
        await shot(view.page, `account-${label}-${colorScheme}-password-errors`);
        await view.context.close();
      }
    }
  });

  it("My account: a temporary password holds the account on the password form; an admin sees it in the admin area", async () => {
    const guest = await newGuest("Khách Mật Khẩu Tạm");
    await stack.pool.query("UPDATE users SET must_change_password = TRUE WHERE email = $1", [guest.email]);
    const { context, page } = await openPage();
    await signIn(page, guest);
    await page.goto(`${stack.baseUrl}/my-bookings`);
    await page.waitForURL(`${stack.baseUrl}/settings/password`);
    await page.getByTestId("must-change").waitFor();
    await shot(page, "account-desktop-must-change");
    await context.close();

    const admin = await openPage();
    await signIn(admin.page, ADMIN);
    await admin.page.goto(`${stack.baseUrl}/settings`);
    await admin.page.getByTestId("profile-form").waitFor();
    assert.equal(await admin.page.locator(".adm-shell").count(), 1);
    await shot(admin.page, "account-desktop-admin");
    await admin.context.close();
  });

  it("credits, 404 and 403", async () => {
    for (const [viewport, label] of [[DESKTOP, "desktop"], [PHONE, "mobile"]]) {
      for (const colorScheme of ["light", "dark"]) {
        const { context, page, problems } = await openPage({ viewport, colorScheme });
        await page.goto(`${stack.baseUrl}/credits`);
        await page.locator(".cr-item").first().waitFor();
        const credits = await api("/api/destinations/credits");
        assert.equal(await page.locator(".cr-item").count(), credits.body.length);
        assert.deepEqual((await headingSkips(page)).skips, []);
        assert.ok((await sidewaysOverflow(page)) <= 0);
        await shot(page, `credits-${label}-${colorScheme}`);

        await page.goto(`${stack.baseUrl}/no-such-page`);
        await page.getByTestId("error-notFound").waitFor();
        assert.deepEqual((await headingSkips(page)).skips, []);
        assert.ok((await sidewaysOverflow(page)) <= 0);
        await shot(page, `404-${label}-${colorScheme}`);
        assert.deepEqual(problems, []);
        await context.close();
      }
    }

    // The 404 search goes to the room list for that destination.
    const { context, page } = await openPage();
    await page.goto(`${stack.baseUrl}/no-such-page`);
    await page.getByRole("searchbox").fill("Đà Nẵng");
    await page.getByRole("searchbox").press("Enter");
    await page.waitForURL(/\/rooms\?location=/);
    assert.equal(new URL(page.url()).searchParams.get("location"), "Đà Nẵng");
    await context.close();

    // A guest opening the admin area: 403 naming the account and the address.
    const guest = await newGuest();
    for (const [viewport, label] of [[DESKTOP, "desktop"], [PHONE, "mobile"]]) {
      for (const colorScheme of ["light", "dark"]) {
        const view = await openPage({ viewport, colorScheme });
        await signIn(view.page, guest);
        await view.page.goto(`${stack.baseUrl}/admin/orders`);
        await view.page.getByTestId("error-forbidden").waitFor();
        const text = await view.page.getByTestId("error-forbidden").innerText();
        assert.ok(text.includes(guest.email) && text.includes("/admin/orders"));
        assert.ok((await sidewaysOverflow(view.page)) <= 0);
        await shot(view.page, `403-${label}-${colorScheme}`);
        if (label === "desktop" && colorScheme === "light") {
          await view.page.getByRole("button", { name: "Đăng nhập tài khoản khác" }).click();
          await view.page.waitForURL(/\/login\?next=%2Fadmin%2Forders/);
        }
        await view.context.close();
      }
    }
  });
});
