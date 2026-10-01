const assert = require("node:assert/strict");
const test = require("node:test");

test("password reset SMTP transport is forced to IPv4", async () => {
  const nodemailerPath = require.resolve("nodemailer");
  const emailServicePath = require.resolve("../src/services/emailService");
  const originalNodemailerModule = require.cache[nodemailerPath];
  const originalEnvironment = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
  };

  let transportOptions;

  try {
    require.cache[nodemailerPath] = {
      id: nodemailerPath,
      filename: nodemailerPath,
      loaded: true,
      exports: {
        createTransport(options) {
          transportOptions = options;
          return {
            async sendMail() {},
          };
        },
      },
    };
    delete require.cache[emailServicePath];

    Object.assign(process.env, {
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
      SMTP_USER: "sender@example.com",
      SMTP_PASS: "app-password",
      SMTP_FROM: "LuxeStay <sender@example.com>",
    });

    const { sendPasswordResetEmail } = require(emailServicePath);
    await sendPasswordResetEmail({
      to: "recipient@example.com",
      name: "Test User",
      resetUrl: "https://example.com/reset-password?token=test",
    });

    assert.equal(transportOptions.family, 4);
    assert.equal(transportOptions.host, "127.0.0.1");
    assert.equal(transportOptions.port, 587);
    assert.equal(transportOptions.secure, false);
    assert.equal(transportOptions.tls.servername, "127.0.0.1");
  } finally {
    delete require.cache[emailServicePath];
    if (originalNodemailerModule) {
      require.cache[nodemailerPath] = originalNodemailerModule;
    } else {
      delete require.cache[nodemailerPath];
    }

    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("SMTP hostname resolution requests IPv4 only", async () => {
  const { resolveSmtpIpv4 } = require("../src/services/emailService");
  let receivedOptions;

  const address = await resolveSmtpIpv4("smtp.gmail.com", async (_host, options) => {
    receivedOptions = options;
    return { address: "142.250.4.108", family: 4 };
  });

  assert.deepEqual(receivedOptions, { family: 4 });
  assert.equal(address, "142.250.4.108");
});
