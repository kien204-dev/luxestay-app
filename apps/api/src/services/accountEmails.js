const emailService = require("./emailService");
const { getPropertySettings } = require("./propertySettings");
const { getAppTimezone } = require("../utils/time");
const { escapeHtml } = require("../utils/html");

const TEXT = {
  vi: {
    subject: "Email đăng nhập {property} của bạn đã được đổi",
    greeting: "Xin chào {name},",
    body: "Email đăng nhập tài khoản {property} của bạn vừa được đổi từ {old} sang {new} lúc {time}. Các thiết bị đang đăng nhập đã được đăng xuất.",
    notYou: "Nếu không phải bạn đổi, hãy liên hệ {property} ngay để khoá tài khoản.",
    contact: "Liên hệ",
  },
  en: {
    subject: "The sign-in email of your {property} account was changed",
    greeting: "Hello {name},",
    body: "The sign-in email of your {property} account was changed from {old} to {new} at {time}. Devices that were signed in have been signed out.",
    notYou: "If this was not you, contact {property} right away so the account can be locked.",
    contact: "Contact",
  },
};

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

// "vi" unless the browser asked for English.
function languageOf(acceptLanguage) {
  return /^en\b/i.test(String(acceptLanguage || "").trim()) ? "en" : "vi";
}

// Pure: the notice sent to the OLD address after an email change. Exported
// for tests.
function buildEmailChangedNotice({ name, oldEmail, newEmail, changedAt, lang, property }) {
  const t = TEXT[lang] || TEXT.vi;
  const time = new Date(changedAt).toLocaleString(lang === "en" ? "en-GB" : "vi-VN", {
    timeZone: getAppTimezone(),
    dateStyle: "short",
    timeStyle: "short",
  });
  const values = { name: name || oldEmail, property: property.name, old: oldEmail, new: newEmail, time };
  const contact = [property.phone, property.email].filter(Boolean);
  const paragraphs = [fill(t.body, values), fill(t.notYou, values)];
  const text = [fill(t.greeting, values), "", ...paragraphs, ...(contact.length ? ["", `${t.contact}: ${contact.join(" · ")}`] : [])].join("\n");
  const html = [
    `<p>${escapeHtml(fill(t.greeting, values))}</p>`,
    ...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`),
    ...(contact.length ? [`<p>${escapeHtml(t.contact)}: ${escapeHtml(contact.join(" · "))}</p>`] : []),
  ].join("\n");
  return { to: oldEmail, subject: fill(t.subject, values), text, html };
}

// Tells the old address that the account's email changed. Never throws: the
// change itself has already happened; a failure is logged.
async function notifyEmailChanged({ name, oldEmail, newEmail, acceptLanguage }) {
  try {
    if (!emailService.isEmailConfigured()) {
      console.warn(`EMAIL CHANGE NOTICE NOT SENT (SMTP not configured): account ${newEmail}`);
      return;
    }
    const property = await getPropertySettings();
    const notice = buildEmailChangedNotice({ name, oldEmail, newEmail, changedAt: new Date(), lang: languageOf(acceptLanguage), property });
    await emailService.sendEmail({ ...notice, fromName: property.name });
  } catch (err) {
    console.error("EMAIL CHANGE NOTICE FAILED:", err.message);
  }
}

module.exports = { buildEmailChangedNotice, notifyEmailChanged };
