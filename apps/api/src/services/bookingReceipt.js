const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { daysBetween } = require("../utils/time.js");

// A one-page booking confirmation the guest can keep or print: who, which
// room, when, and what was charged. It is a confirmation of the booking, not
// a tax invoice.

// pdfkit's built-in fonts have no Vietnamese glyphs; Noto Sans is bundled
// for this (see assets/fonts/README.md).
const FONT_PATH = path.join(__dirname, "../../assets/fonts/NotoSans-Regular.ttf");
const UPLOADS_DIR = path.join(__dirname, "../../uploads");

const NAVY = "#002366";
const MUTED = "#64748b";
const INK = "#1a1c1e";
const LOCALES = { vi: "vi-VN", en: "en-US" };

const TEXT = {
  vi: {
    title: "Phiếu xác nhận đặt phòng",
    code: "Mã đặt phòng",
    issued: "Ngày lập",
    guest: "Khách",
    stay: "Thông tin lưu trú",
    room: "Phòng",
    checkIn: "Nhận phòng",
    checkOut: "Trả phòng",
    from: "từ",
    before: "trước",
    nights: "Số đêm",
    guests: "Số khách",
    charges: "Chi phí",
    perNight: "Giá mỗi đêm",
    subtotal: "Tạm tính",
    discount: "Giảm giá",
    total: "Tổng cộng",
    status: "Trạng thái",
    payment: "Thanh toán",
    statuses: { pending: "Chờ thanh toán", confirmed: "Đã xác nhận", completed: "Hoàn tất", cancelled: "Đã hủy" },
    payments: {
      unpaid: "Chưa thanh toán",
      pending: "Đang xử lý",
      paid: "Đã thanh toán",
      failed: "Thanh toán chưa thành công",
      refund_pending: "Chờ hoàn tiền",
      refunded: "Đã hoàn tiền",
    },
    note: "Đây là phiếu xác nhận đặt phòng, không phải hóa đơn giá trị gia tăng.",
  },
  en: {
    title: "Booking confirmation",
    code: "Booking code",
    issued: "Issued",
    guest: "Guest",
    stay: "Stay",
    room: "Room",
    checkIn: "Check-in",
    checkOut: "Check-out",
    from: "from",
    before: "before",
    nights: "Nights",
    guests: "Guests",
    charges: "Charges",
    perNight: "Price per night",
    subtotal: "Subtotal",
    discount: "Discount",
    total: "Total",
    status: "Status",
    payment: "Payment",
    statuses: { pending: "Awaiting payment", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled" },
    payments: {
      unpaid: "Not paid yet",
      pending: "Processing",
      paid: "Paid",
      failed: "Payment not completed",
      refund_pending: "Refund pending",
      refunded: "Refunded",
    },
    note: "This is a booking confirmation, not a tax invoice.",
  },
};

function formatMoney(value, lang) {
  const amount = (Number(value) || 0).toLocaleString(LOCALES[lang]);
  return lang === "en" ? `${amount} VND` : `${amount} đ`;
}

function formatDate(dateStr, lang) {
  return new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`).toLocaleDateString(LOCALES[lang], {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function bookingCode(id) {
  return `#BK-${String(id).padStart(4, "0")}`;
}

// Only a logo this app stored itself, and only in a format pdfkit can embed.
function localLogoPath(logoUrl) {
  if (typeof logoUrl !== "string" || !logoUrl.startsWith("/uploads/branding/")) return null;
  if (!/\.(png|jpe?g)$/i.test(logoUrl)) return null;

  const file = path.join(UPLOADS_DIR, "branding", path.basename(logoUrl));
  return fs.existsSync(file) ? file : null;
}

// The numbers printed on the receipt, taken from what the booking stored at
// the time (total_price, discount_amount), not recomputed from today's room
// price.
function receiptAmounts(booking) {
  const nights = daysBetween(String(booking.check_in).slice(0, 10), String(booking.check_out).slice(0, 10));
  const total = Number(booking.total_price) || 0;
  const discount = Number(booking.discount_amount) || 0;
  const subtotal = total + discount;

  return { nights, total, discount, subtotal, perNight: nights > 0 ? subtotal / nights : subtotal };
}

function buildReceiptPdf(booking, property, { language } = {}) {
  const lang = TEXT[language] ? language : TEXT[booking.language] ? booking.language : "vi";
  const t = TEXT[lang];
  const amounts = receiptAmounts(booking);
  const guestName = booking.guest_name || booking.user_name || "";
  const guestContact = [booking.guest_name ? booking.guest_phone : null, booking.guest_name ? booking.guest_email : booking.user_email]
    .filter(Boolean)
    .join(" · ");

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4", info: { Title: `${t.title} ${bookingCode(booking.id)}` } });
    doc.font(FONT_PATH);
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    // ---- property header
    const logo = localLogoPath(property.logoUrl);
    let headerX = left;
    if (logo) {
      try {
        doc.image(logo, left, 46, { fit: [56, 56] });
        headerX = left + 70;
      } catch {
        // An unreadable logo must not cost the guest their receipt.
      }
    }
    doc.fontSize(20).fillColor(NAVY).text(property.name, headerX, 50, { width: width - (headerX - left) });
    doc.fontSize(9).fillColor(MUTED);
    [property.address, [property.phone, property.email].filter(Boolean).join(" · ")]
      .filter(Boolean)
      .forEach((line) => doc.text(line, headerX));

    doc.y = Math.max(doc.y, 112);
    doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor("#e2e8f0").stroke();
    doc.moveDown(1);

    // ---- title
    doc.fontSize(16).fillColor(INK).text(t.title, left);
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor(MUTED).text(
      `${t.code}: ${bookingCode(booking.id)}    ${t.issued}: ${formatDate(new Date().toISOString(), lang)}`
    );
    doc.moveDown(1.2);

    const heading = (label) => {
      doc.fontSize(12).fillColor(NAVY).text(label, left);
      doc.moveDown(0.4);
    };
    const row = (label, value, { strong = false } = {}) => {
      const y = doc.y;
      doc.fontSize(10).fillColor(MUTED).text(label, left, y, { width: 170 });
      doc.fontSize(strong ? 12 : 10).fillColor(strong ? NAVY : INK).text(value, left + 180, y, { width: width - 180 });
      doc.moveDown(0.5);
    };

    heading(t.guest);
    row(t.guest, guestName);
    if (guestContact) row("", guestContact);
    doc.moveDown(0.6);

    heading(t.stay);
    row(t.room, [booking.room_name, booking.room_location].filter(Boolean).join(" – "));
    row(t.checkIn, `${formatDate(booking.check_in, lang)} (${t.from} ${property.checkInTime})`);
    row(t.checkOut, `${formatDate(booking.check_out, lang)} (${t.before} ${property.checkOutTime})`);
    row(t.nights, String(amounts.nights));
    row(t.guests, String(booking.guests));
    doc.moveDown(0.6);

    heading(t.charges);
    row(t.perNight, formatMoney(amounts.perNight, lang));
    row(t.subtotal, formatMoney(amounts.subtotal, lang));
    if (amounts.discount > 0) {
      row(`${t.discount}${booking.coupon_code ? ` (${booking.coupon_code})` : ""}`, `−${formatMoney(amounts.discount, lang)}`);
    }
    row(t.total, formatMoney(amounts.total, lang), { strong: true });
    doc.moveDown(0.6);

    row(t.status, t.statuses[booking.status] || booking.status);
    row(t.payment, t.payments[booking.payment_status] || booking.payment_status);

    doc.moveDown(2);
    doc.fontSize(8).fillColor(MUTED).text(t.note, left, doc.y, { width });

    doc.end();
  });
}

module.exports = { bookingCode, buildReceiptPdf, receiptAmounts };
