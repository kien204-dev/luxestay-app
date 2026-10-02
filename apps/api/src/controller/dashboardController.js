const path = require("path");
const pool = require("../db/db.js");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { getPropertySettings } = require("../services/propertySettings");
const { todayInAppTimezone } = require("../utils/time");

// pdfkit's built-in standard fonts (Helvetica etc.) have no Vietnamese
// glyph coverage, so PDF text needs an embedded Unicode font — Noto Sans
// (SIL Open Font License, free to embed) is bundled in assets/fonts for
// exactly this. See assets/fonts/README.md for provenance/license.
const VI_FONT_PATH = path.join(__dirname, "../../assets/fonts/NotoSans-Regular.ttf");

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_COLORS = {
  confirmed: "#67e8b4",
  pending: "#fbbf24",
  completed: "#9fa7ff",
  cancelled: "#f87171",
};

const ANALYTICS_RANGES = ["today", "week", "month", "year"];
const STATS_RANGES = ["today", "week", "month", "year", "all"];

const RANGE_LABEL = {
  today: "Hôm nay",
  week: "7 ngày qua",
  month: "Tháng này",
  year: "Năm nay",
  all: "Tất cả thời gian",
};

const STATUS_LABEL_VI = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

const BRAND_NAVY = "FF0A1128";

// Builds the [start, end) window plus empty buckets for a given range, so
// callers never hardcode "this year" and can bucket by hour/day/month.
function getRangeWindow(range) {
  const now = new Date();

  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return {
      start,
      end,
      buckets: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`),
      indexOf: (ts) => new Date(ts).getHours(),
    };
  }

  if (range === "week") {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      start,
      end,
      buckets: Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
        return WEEKDAY_LABELS[d.getDay()];
      }),
      indexOf: (ts) => Math.floor((new Date(ts) - start) / (24 * 60 * 60 * 1000)),
    };
  }

  if (range === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysInMonth = Math.round((end - start) / (24 * 60 * 60 * 1000));
    return {
      start,
      end,
      buckets: Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
      indexOf: (ts) => new Date(ts).getDate() - 1,
    };
  }

  // "year" (also used as the buckets source when stats range is "all")
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return {
    start,
    end,
    buckets: MONTH_LABELS,
    indexOf: (ts) => new Date(ts).getMonth(),
  };
}

// How many rooms have a guest tonight. Counted from confirmed bookings that
// cover today, not from rooms.status: that flag means "has some booking in
// the future" and would call a room occupied weeks before anyone arrives.
async function computeRoomOccupancy() {
  const result = await pool.query(
    `
    SELECT
      COUNT(*)::int AS "totalRooms",
      COUNT(*) FILTER (WHERE status = 'maintenance')::int AS "maintenanceRooms",
      COUNT(*) FILTER (
        WHERE status != 'maintenance' AND EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.room_id = rooms.id
            AND b.status = 'confirmed'
            AND b.check_in <= $1::date
            AND b.check_out > $1::date
        )
      )::int AS "occupiedRooms"
    FROM rooms
    `,
    [todayInAppTimezone()]
  );

  const row = result.rows[0] || {};
  const totalRooms = Number(row.totalRooms) || 0;
  const maintenanceRooms = Number(row.maintenanceRooms) || 0;
  const bookedRooms = Number(row.occupiedRooms) || 0;

  return {
    totalRooms,
    maintenanceRooms,
    // Kept under their existing names for the dashboard cards and export.
    bookedRooms,
    availableRooms: Math.max(totalRooms - maintenanceRooms - bookedRooms, 0),
  };
}

// Shared by the /stats route and the export endpoint, so the export never
// runs a second, parallel version of this aggregation.
async function computeDashboardStats(rangeInput) {
  const range = STATS_RANGES.includes(rangeInput) ? rangeInput : "all";
  const window = range === "all" ? null : getRangeWindow(range);

  const bookingWhere = window
    ? "WHERE COALESCE(created_at, check_in::timestamp) >= $1 AND COALESCE(created_at, check_in::timestamp) < $2"
    : "";
  // Revenue is money actually received. A confirmed booking nobody has paid
  // for yet is reported separately as outstanding.
  const revenueWhere = window
    ? `${bookingWhere} AND payment_status = 'paid'`
    : "WHERE payment_status = 'paid'";
  const outstandingWhere = `${window ? `${bookingWhere} AND` : "WHERE"} status IN ('confirmed', 'completed') AND payment_status IN ('unpaid', 'pending', 'failed')`;
  const params = window ? [window.start, window.end] : [];

  const occupancy = await computeRoomOccupancy();

  const result = await pool.query(
    `
    SELECT
      (SELECT COUNT(*) FROM rooms)::int AS "totalRooms",
      (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL)::int AS "totalUsers",
      (SELECT COUNT(*) FROM bookings ${bookingWhere})::int AS "totalBookings",
      COALESCE((
        SELECT SUM(total_price)
        FROM bookings
        ${revenueWhere}
      ), 0)::numeric AS "revenue",
      COALESCE((
        SELECT SUM(discount_amount)
        FROM bookings
        ${revenueWhere}
      ), 0)::numeric AS "totalDiscount",
      COALESCE((
        SELECT SUM(total_price)
        FROM bookings
        ${outstandingWhere}
      ), 0)::numeric AS "outstanding"
    `,
    params
  );

  const stats = result.rows[0] || {};
  const revenue = Number(stats.revenue) || 0;
  const totalDiscount = Number(stats.totalDiscount) || 0;

  return {
    range,
    totalRooms: occupancy.totalRooms,
    availableRooms: occupancy.availableRooms,
    bookedRooms: occupancy.bookedRooms,
    maintenanceRooms: occupancy.maintenanceRooms,
    totalUsers: Number(stats.totalUsers) || 0,
    totalBookings: Number(stats.totalBookings) || 0,
    // revenue: paid bookings, net of coupon discounts. outstanding: confirmed
    // or completed stays that have not been paid for yet.
    revenue,
    outstanding: Number(stats.outstanding) || 0,
    grossRevenue: revenue + totalDiscount,
    totalDiscount,
  };
}

exports.getDashboardStats = async (req, res) => {
  try {
    const stats = await computeDashboardStats(req.query.range);
    res.json(stats);
  } catch (err) {
    console.error("GET DASHBOARD STATS ERROR:", err);
    res.status(500).json({
      message: "Server error when loading dashboard stats",
    });
  }
};

// Shared by the /analytics route and the export endpoint.
async function computeDashboardAnalytics(rangeInput) {
  const range = ANALYTICS_RANGES.includes(rangeInput) ? rangeInput : "year";
  const { start, end, buckets, indexOf } = getRangeWindow(range);

  const [
    bookingsInRangeResult,
    bookingsByStatusResult,
    topRoomsResult,
    occupancyResult,
    recentBookingsResult,
  ] = await Promise.all([
    pool.query(
      `
      SELECT COALESCE(created_at, check_in::timestamp) AS ts, total_price, status, payment_status
      FROM bookings
      WHERE COALESCE(created_at, check_in::timestamp) >= $1
        AND COALESCE(created_at, check_in::timestamp) < $2
      `,
      [start, end]
    ),
    pool.query(
      `
      SELECT status, COUNT(*)::int AS count
      FROM bookings
      WHERE COALESCE(created_at, check_in::timestamp) >= $1
        AND COALESCE(created_at, check_in::timestamp) < $2
      GROUP BY status
      ORDER BY status
      `,
      [start, end]
    ),
    pool.query(
      `
      SELECT
        r.id AS room_id,
        r.room_name,
        r.room_type,
        COUNT(b.id)::int AS booking_count,
        COALESCE(SUM(b.total_price) FILTER (WHERE b.payment_status = 'paid'), 0)::numeric AS revenue
      FROM rooms r
      JOIN bookings b ON b.room_id = r.id
        AND COALESCE(b.created_at, b.check_in::timestamp) >= $1
        AND COALESCE(b.created_at, b.check_in::timestamp) < $2
      GROUP BY r.id, r.room_name, r.room_type
      ORDER BY booking_count DESC, revenue DESC, r.room_name ASC
      LIMIT 5
      `,
      [start, end]
    ),
    computeRoomOccupancy().then((occupancy) => ({ rows: [occupancy] })),
    pool.query(`
      SELECT
        b.id,
        b.check_in,
        b.check_out,
        b.total_price,
        b.status,
        b.created_at,
        u.name AS user_name,
        r.room_name
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN rooms r ON b.room_id = r.id
      ORDER BY b.id DESC
      LIMIT 5
    `),
  ]);

  const revenueByMonth = buckets.map((label) => ({ month: label, revenue: 0 }));
  const bookingsByMonth = buckets.map((label) => ({ month: label, bookings: 0 }));

  bookingsInRangeResult.rows.forEach((row) => {
    const idx = indexOf(row.ts);
    if (idx < 0 || idx >= buckets.length) return;

    bookingsByMonth[idx].bookings += 1;
    if (row.payment_status === "paid") {
      revenueByMonth[idx].revenue += Number(row.total_price) || 0;
    }
  });

  const occupancy = occupancyResult.rows[0] || {};
  const totalRooms = Number(occupancy.totalRooms) || 0;
  const bookedRooms = Number(occupancy.bookedRooms) || 0;

  return {
    range,
    revenueByMonth,
    bookingsByMonth,
    bookingsByStatus: bookingsByStatusResult.rows.map((row) => ({
      status: row.status || "pending",
      count: Number(row.count) || 0,
      color: STATUS_COLORS[row.status] || "#94a3b8",
    })),
    topRooms: topRoomsResult.rows.map((row) => ({
      room_id: Number(row.room_id),
      room_name: row.room_name,
      room_type: row.room_type,
      booking_count: Number(row.booking_count) || 0,
      revenue: Number(row.revenue) || 0,
    })),
    occupancy: {
      totalRooms,
      bookedRooms,
      availableRooms: Number(occupancy.availableRooms) || 0,
      maintenanceRooms: Number(occupancy.maintenanceRooms) || 0,
      occupancyRate: totalRooms ? Math.round((bookedRooms / totalRooms) * 100) : 0,
    },
    recentBookings: recentBookingsResult.rows,
  };
}

exports.getDashboardAnalytics = async (req, res) => {
  try {
    const analytics = await computeDashboardAnalytics(req.query.range);
    res.json(analytics);
  } catch (err) {
    console.error("GET DASHBOARD ANALYTICS ERROR:", err);
    res.status(500).json({
      message: "Server error when loading dashboard analytics",
    });
  }
};

function formatVnd(value) {
  return `${(Number(value) || 0).toLocaleString("vi-VN")} đ`;
}

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    cell.alignment = { vertical: "middle" };
  });
  row.height = 20;
}

// analytics is null when the range doesn't support a breakdown (only
// computeDashboardStats's "all" range lacks one) — the summary sheet still
// gets built either way, from the exact same stats object /stats returns.
async function buildDashboardExcelBuffer(stats, analytics, propertyName) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = propertyName;
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Tổng quan");
  summarySheet.columns = [
    { header: "Chỉ số", key: "label", width: 34 },
    { header: "Giá trị", key: "value", width: 22 },
  ];
  styleHeaderRow(summarySheet.getRow(1));
  [
    ["Khoảng thời gian", RANGE_LABEL[stats.range] || stats.range],
    ["Tổng số phòng", stats.totalRooms],
    ["Phòng trống", stats.availableRooms],
    ["Phòng đã đặt", stats.bookedRooms],
    ["Tổng người dùng", stats.totalUsers],
    ["Tổng booking", stats.totalBookings],
    ["Doanh thu gộp (trước giảm giá)", stats.grossRevenue],
    ["Tổng đã giảm giá (coupon)", stats.totalDiscount],
    ["Doanh thu thực thu (sau giảm giá)", stats.revenue],
  ].forEach(([label, value]) => summarySheet.addRow({ label, value }));
  summarySheet.getColumn("value").numFmt = "#,##0";

  if (!analytics) {
    summarySheet.addRow([]);
    summarySheet.addRow({
      label: "Ghi chú",
      value: "Chi tiết theo trạng thái/kỳ/top phòng chỉ khả dụng cho range today/week/month/year.",
    });
    return workbook.xlsx.writeBuffer();
  }

  const statusSheet = workbook.addWorksheet("Theo trạng thái");
  statusSheet.columns = [
    { header: "Trạng thái", key: "status", width: 22 },
    { header: "Số lượng", key: "count", width: 14 },
  ];
  styleHeaderRow(statusSheet.getRow(1));
  analytics.bookingsByStatus.forEach((item) => {
    statusSheet.addRow({ status: STATUS_LABEL_VI[item.status] || item.status, count: item.count });
  });

  const breakdownSheet = workbook.addWorksheet("Theo thời gian");
  breakdownSheet.columns = [
    { header: "Kỳ", key: "period", width: 14 },
    { header: "Số booking", key: "bookings", width: 14 },
    { header: "Doanh thu", key: "revenue", width: 20 },
  ];
  styleHeaderRow(breakdownSheet.getRow(1));
  analytics.bookingsByMonth.forEach((item, i) => {
    breakdownSheet.addRow({
      period: item.month,
      bookings: item.bookings,
      revenue: analytics.revenueByMonth[i]?.revenue || 0,
    });
  });
  breakdownSheet.getColumn("revenue").numFmt = "#,##0";

  const topRoomsSheet = workbook.addWorksheet("Top phòng");
  topRoomsSheet.columns = [
    { header: "Tên phòng", key: "room_name", width: 32 },
    { header: "Loại phòng", key: "room_type", width: 16 },
    { header: "Số lượt đặt", key: "booking_count", width: 14 },
    { header: "Doanh thu", key: "revenue", width: 20 },
  ];
  styleHeaderRow(topRoomsSheet.getRow(1));
  analytics.topRooms.forEach((room) => topRoomsSheet.addRow(room));
  topRoomsSheet.getColumn("revenue").numFmt = "#,##0";

  return workbook.xlsx.writeBuffer();
}

function buildDashboardPdfBuffer(stats, analytics, propertyName) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.font(VI_FONT_PATH);
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).fillColor("#0A1128").text(`Báo cáo Dashboard - ${propertyName}`, { align: "center" });
    doc.moveDown(0.3);
    doc
      .fontSize(11)
      .fillColor("#555555")
      .text(
        `Khoảng thời gian: ${RANGE_LABEL[stats.range] || stats.range}  -  Xuất lúc: ${new Date().toLocaleString("vi-VN")}`,
        { align: "center" }
      );
    doc.moveDown(1.5);

    doc.fontSize(14).fillColor("#0A1128").text("Tổng quan");
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#000000");
    [
      ["Tổng số phòng", String(stats.totalRooms)],
      ["Phòng trống", String(stats.availableRooms)],
      ["Phòng đã đặt", String(stats.bookedRooms)],
      ["Tổng người dùng", String(stats.totalUsers)],
      ["Tổng booking", String(stats.totalBookings)],
      ["Doanh thu gộp (trước giảm giá)", formatVnd(stats.grossRevenue)],
      ["Tổng đã giảm giá (coupon)", formatVnd(stats.totalDiscount)],
      ["Doanh thu thực thu (sau giảm giá)", formatVnd(stats.revenue)],
    ].forEach(([label, value]) => {
      doc.text(`${label}: ${value}`);
    });

    if (!analytics) {
      doc.moveDown(1);
      doc
        .fontSize(9)
        .fillColor("#888888")
        .text("Chi tiết theo trạng thái/kỳ/top phòng chỉ khả dụng cho range today/week/month/year.");
      doc.end();
      return;
    }

    doc.moveDown(1);
    doc.fontSize(14).fillColor("#0A1128").text("Theo trạng thái");
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#000000");
    analytics.bookingsByStatus.forEach((item) => {
      doc.text(`${STATUS_LABEL_VI[item.status] || item.status}: ${item.count}`);
    });

    doc.moveDown(1);
    doc.fontSize(14).fillColor("#0A1128").text("Doanh thu theo kỳ");
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor("#000000");
    analytics.bookingsByMonth.forEach((item, i) => {
      const revenue = analytics.revenueByMonth[i]?.revenue || 0;
      doc.text(`${item.month}: ${item.bookings} booking, ${formatVnd(revenue)}`);
    });

    if (analytics.topRooms.length > 0) {
      doc.moveDown(1);
      doc.fontSize(14).fillColor("#0A1128").text("Top phòng được đặt nhiều nhất");
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("#000000");
      analytics.topRooms.forEach((room, i) => {
        doc.text(
          `${i + 1}. ${room.room_name} (${room.room_type}) - ${room.booking_count} lượt, ${formatVnd(room.revenue)}`
        );
      });
    }

    doc.end();
  });
}

const EXPORT_FORMATS = new Set(["xlsx", "pdf"]);

// Reuses computeDashboardStats/computeDashboardAnalytics as-is — this
// endpoint only formats their existing output into a downloadable file, it
// never queries the database on its own.
exports.exportDashboardReport = async (req, res) => {
  try {
    const format = String(req.query.format || "").toLowerCase();
    if (!EXPORT_FORMATS.has(format)) {
      return res.status(400).json({ message: "format phải là 'xlsx' hoặc 'pdf'" });
    }

    const stats = await computeDashboardStats(req.query.range);
    const hasBreakdown = ANALYTICS_RANGES.includes(stats.range);
    const analytics = hasBreakdown ? await computeDashboardAnalytics(stats.range) : null;

    const propertyName = (await getPropertySettings()).name;
    const filenameBase = `luxestay-dashboard-${stats.range}-${new Date().toISOString().slice(0, 10)}`;

    if (format === "xlsx") {
      const buffer = await buildDashboardExcelBuffer(stats, analytics, propertyName);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.xlsx"`);
      return res.send(buffer);
    }

    const buffer = await buildDashboardPdfBuffer(stats, analytics, propertyName);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filenameBase}.pdf"`);
    return res.send(buffer);
  } catch (err) {
    console.error("EXPORT DASHBOARD REPORT ERROR:", err);
    res.status(500).json({ message: "Lỗi server khi xuất báo cáo" });
  }
};
