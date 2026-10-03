const pool = require("../db/db.js");
const emailService = require("./emailService.js");
const { getPropertySettings } = require("./propertySettings.js");
const { getPublicWebUrl } = require("./allowedOrigins.js");
const { escapeHtml } = require("../utils/html.js");
const { daysBetween } = require("../utils/time.js");

// Emails a guest receives about one booking:
//   received   the booking exists and is waiting for payment
//   confirmed  the booking is confirmed (paid online, paid at the desk, or
//              confirmed by the property)
//   cancelled  the booking was cancelled by the guest or the property
//   expired    the booking cancelled itself: it was not paid in time
//
// They are sent after the database transaction has committed and never
// awaited by the request: a mail server being slow or down must not delay or
// fail a booking. Failures are logged.

const SUPPORTED_LANGUAGES = ["vi", "en"];
const LOCALES = { vi: "vi-VN", en: "en-US" };

const TEXT = {
  vi: {
    subject: {
      received: "Đã nhận đặt phòng {code} – chờ thanh toán",
      confirmed: "Xác nhận đặt phòng {code}",
      cancelled: "Đặt phòng {code} đã được hủy",
      expired: "Đặt phòng {code} đã tự hủy do quá hạn thanh toán",
    },
    greeting: "Xin chào {name},",
    intro: {
      received: "Chúng tôi đã nhận đặt phòng của bạn tại {property}. Phòng được giữ {minutes} phút để bạn thanh toán; quá thời gian này đặt phòng sẽ tự hủy.",
      confirmed: "Đặt phòng của bạn tại {property} đã được xác nhận. Hẹn gặp bạn!",
      cancelled: "Đặt phòng của bạn tại {property} đã được hủy.",
      expired: "Đặt phòng của bạn tại {property} đã tự hủy vì chưa được thanh toán trong {minutes} phút giữ chỗ. Nếu vẫn muốn ở, bạn có thể đặt lại; phòng có thể vẫn còn trống.",
    },
    refundPending: "Khoản bạn đã thanh toán sẽ được hoàn lại. Chúng tôi sẽ liên hệ khi hoàn tiền xong.",
    labels: {
      code: "Mã đặt phòng",
      room: "Phòng",
      checkIn: "Nhận phòng",
      checkOut: "Trả phòng",
      nights: "Số đêm",
      guests: "Số khách",
      discount: "Giảm giá",
      total: "Tổng tiền",
      payment: "Thanh toán",
    },
    from: "từ {time}",
    before: "trước {time}",
    payment: {
      unpaid: "Chưa thanh toán",
      pending: "Đang xử lý",
      paid: "Đã thanh toán",
      failed: "Thanh toán chưa thành công",
      refund_pending: "Chờ hoàn tiền",
      refunded: "Đã hoàn tiền",
    },
    policy: "Đặt phòng đã thanh toán được hủy miễn phí và hoàn tiền đến trước ngày nhận phòng {days} ngày. Đặt phòng chưa thanh toán có thể hủy bất cứ lúc nào.",
    manage: "Xem, thanh toán hoặc hủy đặt phòng",
    contact: "Liên hệ",
  },
  en: {
    subject: {
      received: "Booking {code} received – awaiting payment",
      confirmed: "Booking {code} confirmed",
      cancelled: "Booking {code} cancelled",
      expired: "Booking {code} cancelled: payment not received in time",
    },
    greeting: "Hello {name},",
    intro: {
      received: "We have received your booking at {property}. The room is held for {minutes} minutes while you pay; after that the booking cancels itself.",
      confirmed: "Your booking at {property} is confirmed. We look forward to seeing you!",
      cancelled: "Your booking at {property} has been cancelled.",
      expired: "Your booking at {property} has been cancelled because it was not paid within the {minutes}-minute hold. If you still want to stay, you can book again; the room may still be free.",
    },
    refundPending: "Your payment will be refunded. We will be in touch once the refund has been made.",
    labels: {
      code: "Booking code",
      room: "Room",
      checkIn: "Check-in",
      checkOut: "Check-out",
      nights: "Nights",
      guests: "Guests",
      discount: "Discount",
      total: "Total",
      payment: "Payment",
    },
    from: "from {time}",
    before: "before {time}",
    payment: {
      unpaid: "Not paid yet",
      pending: "Processing",
      paid: "Paid",
      failed: "Payment not completed",
      refund_pending: "Refund pending",
      refunded: "Refunded",
    },
    policy: "A paid booking can be cancelled for free, with a refund, until {days} day(s) before check-in. An unpaid booking can be cancelled at any time.",
    manage: "View, pay for or cancel your booking",
    contact: "Contact",
  },
};

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

function bookingCode(id) {
  return `#BK-${String(id).padStart(4, "0")}`;
}

function formatDate(dateStr, lang) {
  return new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`).toLocaleDateString(LOCALES[lang], {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMoney(value, lang) {
  const amount = (Number(value) || 0).toLocaleString(LOCALES[lang]);
  return lang === "en" ? `${amount} VND` : `${amount} đ`;
}

function getPendingTtlMinutes() {
  const ttl = Number(process.env.PENDING_BOOKING_TTL_MINUTES || 30);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 30;
}

// Pure: turns a booking row (joined with its room and account) into the
// email to send. Exported for tests.
function buildBookingEmail(kind, booking, property) {
  const lang = SUPPORTED_LANGUAGES.includes(booking.language) ? booking.language : "vi";
  const t = TEXT[lang];
  const code = bookingCode(booking.id);
  const checkIn = String(booking.check_in).slice(0, 10);
  const checkOut = String(booking.check_out).slice(0, 10);
  const name = booking.guest_name || booking.user_name || "";
  const discount = Number(booking.discount_amount) || 0;

  const rows = [
    [t.labels.code, code],
    [t.labels.room, [booking.room_name, booking.room_location].filter(Boolean).join(" – ")],
    [t.labels.checkIn, `${formatDate(checkIn, lang)}, ${fill(t.from, { time: property.checkInTime })}`],
    [t.labels.checkOut, `${formatDate(checkOut, lang)}, ${fill(t.before, { time: property.checkOutTime })}`],
    [t.labels.nights, String(daysBetween(checkIn, checkOut))],
    [t.labels.guests, String(booking.guests)],
    ...(discount > 0
      ? [[t.labels.discount, `−${formatMoney(discount, lang)}${booking.coupon_code ? ` (${booking.coupon_code})` : ""}`]]
      : []),
    [t.labels.total, formatMoney(booking.total_price, lang)],
    [t.labels.payment, t.payment[booking.payment_status] || booking.payment_status],
  ];

  const paragraphs = [
    fill(t.intro[kind], { property: property.name, minutes: getPendingTtlMinutes() }),
    ...(kind === "cancelled" && booking.payment_status === "refund_pending" ? [t.refundPending] : []),
  ];
  const policy = kind === "cancelled" || kind === "expired" ? "" : fill(t.policy, { days: property.freeCancellationDays });
  const manageUrl = `${getPublicWebUrl()}/my-bookings`;
  const contactLines = [property.address, property.phone, property.email].filter(Boolean);

  const text = [
    fill(t.greeting, { name }),
    "",
    ...paragraphs,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    ...(policy ? [policy, ""] : []),
    `${t.manage}: ${manageUrl}`,
    "",
    property.name,
    ...contactLines,
  ].join("\n");

  const cell = "padding:6px 12px 6px 0;vertical-align:top;";
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1c1e;max-width:560px;">
  <p>${escapeHtml(fill(t.greeting, { name }))}</p>
  ${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("\n  ")}
  <table style="border-collapse:collapse;margin:16px 0;">
    ${rows
      .map(
        ([label, value]) =>
          `<tr><td style="${cell}color:#64748b;">${escapeHtml(label)}</td><td style="${cell}font-weight:bold;">${escapeHtml(value)}</td></tr>`
      )
      .join("\n    ")}
  </table>
  ${policy ? `<p style="color:#64748b;font-size:13px;">${escapeHtml(policy)}</p>` : ""}
  <p><a href="${escapeHtml(manageUrl)}">${escapeHtml(t.manage)}</a></p>
  <p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:12px;">
    <strong>${escapeHtml(property.name)}</strong>${contactLines.map((line) => `<br>${escapeHtml(line)}`).join("")}
  </p>
</div>`.trim();

  return { subject: fill(t.subject[kind], { code }), text, html };
}

// A booking with the room, account and coupon details that emails and the
// PDF confirmation both need.
async function loadBookingDetails(bookingId) {
  const result = await pool.query(
    `SELECT b.*, u.name AS user_name, u.email AS user_email,
            r.room_name, r.location AS room_location, c.code AS coupon_code
     FROM bookings b
     JOIN users u ON b.user_id = u.id
     JOIN rooms r ON b.room_id = r.id
     LEFT JOIN coupons c ON b.coupon_id = c.id
     WHERE b.id = $1`,
    [bookingId]
  );
  return result.rows[0] || null;
}

// Who the email goes to. A booking entered by an admin for a walk-in guest
// goes to that guest's address if one was given, and to nobody otherwise
// (never to the admin's own account).
function recipientOf(booking) {
  if (booking.guest_name) return booking.guest_email || null;
  return booking.user_email || null;
}

async function sendBookingEmail(kind, bookingId) {
  if (!emailService.isEmailConfigured()) return;

  const booking = await loadBookingDetails(bookingId);
  if (!booking) return;

  const to = recipientOf(booking);
  if (!to) return;

  const property = await getPropertySettings();
  await emailService.sendEmail({
    to,
    fromName: property.name,
    ...buildBookingEmail(kind, booking, property),
  });
}

// Fire and forget: call after COMMIT, do not await.
function notifyBooking(kind, bookingId) {
  return sendBookingEmail(kind, bookingId).catch((err) => {
    console.error(`BOOKING EMAIL FAILED (${kind}, booking ${bookingId}):`, err.message);
  });
}

module.exports = { SUPPORTED_LANGUAGES, buildBookingEmail, loadBookingDetails, notifyBooking };
