const nodemailer = require("nodemailer");
const dns = require("node:dns").promises;
const net = require("node:net");
const { APP_NAME } = require("../config/brand");
const { escapeHtml } = require("../utils/html");

function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM,
  };
}

function assertEmailConfigured() {
  const config = getSmtpConfig();
  const missing = [];

  if (!config.host) missing.push("SMTP_HOST");
  if (!process.env.SMTP_PORT) missing.push("SMTP_PORT");
  if (!config.user) missing.push("SMTP_USER");
  if (!config.pass) missing.push("SMTP_PASS (or SMTP_PASSWORD)");
  if (!config.from) missing.push("SMTP_FROM");

  if (missing.length > 0) {
    throw new Error(`SMTP is not configured. Missing: ${missing.join(", ")}`);
  }

  return config;
}

async function resolveSmtpIpv4(host, lookup = dns.lookup) {
  if (net.isIPv4(host)) return host;

  const result = await lookup(host, { family: 4 });
  if (!result?.address || !net.isIPv4(result.address)) {
    throw new Error(`SMTP host ${host} did not resolve to an IPv4 address`);
  }

  return result.address;
}

function isEmailConfigured() {
  try {
    assertEmailConfigured();
    return true;
  } catch {
    return false;
  }
}

async function createTransporter(config) {
  const ipv4Host = await resolveSmtpIpv4(config.host);
  return nodemailer.createTransport({
    host: ipv4Host,
    port: config.port,
    secure: config.secure,
    // Keep this option for Node transports that honor it. Resolving the host
    // above is what guarantees IPv4 with Nodemailer 9's own DNS resolver.
    family: 4,
    tls: {
      // TLS certificate verification must still use the original SMTP hostname.
      servername: config.host,
    },
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const config = assertEmailConfigured();
  const transporter = await createTransporter(config);

  await transporter.sendMail({
    from: config.from,
    to,
    subject: `Reset your ${APP_NAME} password`,
    text: [
      `Hello ${name || "there"},`,
      "",
      `We received a request to reset your ${APP_NAME} password.`,
      `Open this link to reset your password: ${resetUrl}`,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <p>Hello ${escapeHtml(name || "there")},</p>
      <p>We received a request to reset your ${escapeHtml(APP_NAME)} password.</p>
      <p><a href="${escapeHtml(resetUrl)}">Reset your password</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });
}

// Plain-text operational notice to the property's admins.
async function sendAdminEmail({ to, subject, text }) {
  const config = assertEmailConfigured();
  const transporter = await createTransporter(config);

  await transporter.sendMail({ from: config.from, to, subject, text });
}

module.exports = {
  assertEmailConfigured,
  isEmailConfigured,
  sendAdminEmail,
  resolveSmtpIpv4,
  sendPasswordResetEmail,
};
