import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../utils/icon";
import RevenueChart from "../layout/components/chart/RevenueChart";
import OccupancyChart from "../layout/components/chart/OccupancyChart";
import BookingStatusChart from "../layout/components/chart/BookingStatusChart";
import BookingsByMonthChart from "../layout/components/chart/BookingsByMonthChart";
import TopRoomsChart from "../layout/components/chart/TopRoomsChart";
import { useToast } from "../context/ToastContext";
import {
  getDashboardAnalytics,
  getDashboardStats,
  exportDashboardReport,
} from "../services/dashboardService";

const DEFAULT_STATS = {
  totalRooms: 0,
  availableRooms: 0,
  bookedRooms: 0,
  totalUsers: 0,
  totalBookings: 0,
  revenue: 0,
};

const DEFAULT_ANALYTICS = {
  revenueByMonth: [],
  bookingsByMonth: [],
  bookingsByStatus: [],
  topRooms: [],
  occupancy: {
    totalRooms: 0,
    bookedRooms: 0,
    availableRooms: 0,
    maintenanceRooms: 0,
    occupancyRate: 0,
  },
  recentBookings: [],
};

function getRangeOptions(t) {
  return [
    { value: "today", label: t("dashboard:rangeOptions.today") },
    { value: "week", label: t("dashboard:rangeOptions.week") },
    { value: "month", label: t("dashboard:rangeOptions.month") },
    { value: "year", label: t("dashboard:rangeOptions.year") },
    { value: "all", label: t("dashboard:rangeOptions.all") },
  ];
}

function getRangeNote(t) {
  return {
    today: t("dashboard:rangeNote.today"),
    week: t("dashboard:rangeNote.week"),
    month: t("dashboard:rangeNote.month"),
    year: t("dashboard:rangeNote.year"),
    all: t("dashboard:rangeNote.all"),
  };
}

const statusStyle = {
  confirmed: { bg: "rgba(103,232,180,0.12)", color: "#67e8b4" },
  pending: { bg: "rgba(251,191,36,0.12)", color: "#fbbf24" },
  completed: { bg: "var(--color-gold-100)", color: "var(--color-gold-400)" },
  cancelled: { bg: "rgba(248,113,113,0.12)", color: "#f87171" },
};

const PANEL_STYLE = {
  background: "var(--color-navy-800)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: "var(--radius-lg)",
  padding: 24,
  boxShadow: "var(--shadow-card)",
};

function normalizeStats(stats) {
  return {
    totalRooms: Number(stats?.totalRooms) || 0,
    availableRooms: Number(stats?.availableRooms) || 0,
    bookedRooms: Number(stats?.bookedRooms) || 0,
    totalUsers: Number(stats?.totalUsers) || 0,
    totalBookings: Number(stats?.totalBookings) || 0,
    revenue: Number(stats?.revenue) || 0,
  };
}

function normalizeAnalytics(analytics) {
  return {
    revenueByMonth: Array.isArray(analytics?.revenueByMonth)
      ? analytics.revenueByMonth
      : [],
    bookingsByMonth: Array.isArray(analytics?.bookingsByMonth)
      ? analytics.bookingsByMonth
      : [],
    bookingsByStatus: Array.isArray(analytics?.bookingsByStatus)
      ? analytics.bookingsByStatus.map((item) => ({
          name: item.status || "pending",
          value: Number(item.count) || 0,
          color: item.color || "#94a3b8",
        }))
      : [],
    topRooms: Array.isArray(analytics?.topRooms) ? analytics.topRooms : [],
    occupancy: {
      totalRooms: Number(analytics?.occupancy?.totalRooms) || 0,
      bookedRooms: Number(analytics?.occupancy?.bookedRooms) || 0,
      availableRooms: Number(analytics?.occupancy?.availableRooms) || 0,
      maintenanceRooms: Number(analytics?.occupancy?.maintenanceRooms) || 0,
      occupancyRate: Number(analytics?.occupancy?.occupancyRate) || 0,
    },
    recentBookings: Array.isArray(analytics?.recentBookings)
      ? analytics.recentBookings
      : [],
  };
}

function formatMoney(value, lang = "vi") {
  return `${(Number(value) || 0).toLocaleString(lang === "en" ? "en-US" : "vi-VN")} VND`;
}

function formatDate(value, lang = "vi") {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(lang === "en" ? "en-US" : "vi-VN");
}

function StatCard({ label, value, note, icon, color, highlight }) {
  const IconComp = Icon[icon];
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...PANEL_STYLE,
        padding: "20px 24px",
        position: "relative",
        overflow: "hidden",
        border: highlight
          ? "1px solid var(--color-border)"
          : PANEL_STYLE.border,
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hovered ? "var(--shadow-card-hover)" : "var(--shadow-card)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -20,
          right: -20,
          width: 90,
          height: 90,
          background: color,
          borderRadius: "50%",
          opacity: 0.08,
          filter: "blur(20px)",
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <p
            style={{
              color: "var(--color-text-secondary)",
              fontFamily: "var(--font-sans)",
              fontSize: 11,
              marginBottom: 6,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </p>
          <p
            style={{
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-serif)",
              fontSize: 27,
              fontWeight: 700,
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            {value}
          </p>
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: `${color}1f`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            flexShrink: 0,
          }}
        >
          {IconComp && <IconComp />}
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          color: "var(--color-text-muted)",
          fontFamily: "var(--font-sans)",
          fontSize: 12,
        }}
      >
        {note}
      </div>
    </div>
  );
}

function SkeletonBlock({ height = 16, width = "100%", radius }) {
  return (
    <div
      className="luxe-skeleton"
      style={{
        height,
        width,
        borderRadius: radius,
      }}
    />
  );
}

function DashboardSkeleton() {
  const { t } = useTranslation("dashboard");
  return (
    <div aria-busy="true" aria-label={t("refresh.loading")}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ ...PANEL_STYLE, padding: "20px 24px" }}>
            <SkeletonBlock height={10} width="60%" />
            <div style={{ marginTop: 12 }}>
              <SkeletonBlock height={26} width="45%" />
            </div>
            <div style={{ marginTop: 14 }}>
              <SkeletonBlock height={10} width="80%" />
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...PANEL_STYLE, marginBottom: 24 }}>
        <SkeletonBlock height={14} width={180} />
        <div style={{ marginTop: 20 }}>
          <SkeletonBlock height={200} />
        </div>
      </div>

      <div style={{ ...PANEL_STYLE }}>
        <SkeletonBlock height={14} width={160} />
        <div
          style={{
            marginTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} height={36} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation("dashboard");
  const lang = i18n.language;
  const rangeOptions = getRangeOptions(t);
  const rangeNote = getRangeNote(t);
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [analytics, setAnalytics] = useState(DEFAULT_ANALYTICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState("year");
  const [exportingFormat, setExportingFormat] = useState(null);
  const toast = useToast();

  const loadDashboard = async (targetRange, options = {}) => {
    try {
      setLoading(true);
      setError("");

      const [statsData, analyticsData] = await Promise.all([
        getDashboardStats(targetRange),
        getDashboardAnalytics(targetRange),
      ]);

      setStats(normalizeStats(statsData));
      setAnalytics(normalizeAnalytics(analyticsData));
      if (options.announce) {
        toast.success(t("errors.refreshed"));
      }
    } catch (err) {
      const message = err.response?.data?.message || t("errors.loadFailed");
      setError(message);
      setStats(DEFAULT_STATS);
      setAnalytics(DEFAULT_ANALYTICS);
      if (options.announce) {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const handleExport = async (format) => {
    setExportingFormat(format);
    try {
      await exportDashboardReport(range, format);
    } catch (err) {
      toast.error(err.response?.data?.message || t("errors.exportFailed"));
    } finally {
      setExportingFormat(null);
    }
  };

  const occupancyRate =
    analytics.occupancy.occupancyRate ||
    (stats.totalRooms
      ? Math.round((stats.bookedRooms / stats.totalRooms) * 100)
      : 0);

  const statCards = [
    {
      label: t("statCards.totalRooms.label"),
      value: stats.totalRooms.toLocaleString(),
      note: t("statCards.totalRooms.note"),
      icon: "Rooms",
      color: "var(--color-gold-500)",
    },
    {
      label: t("statCards.availableRooms.label"),
      value: stats.availableRooms.toLocaleString(),
      note: t("statCards.availableRooms.note"),
      icon: "Hotel",
      color: "#67e8b4",
    },
    {
      label: t("statCards.bookedRooms.label"),
      value: stats.bookedRooms.toLocaleString(),
      note: t("statCards.bookedRooms.note"),
      icon: "Booking",
      color: "#fbbf24",
    },
    {
      label: t("statCards.totalUsers.label"),
      value: stats.totalUsers.toLocaleString(),
      note: t("statCards.totalUsers.note"),
      icon: "Users",
      color: "var(--color-gold-500)",
    },
    {
      label: t("statCards.totalBookings.label"),
      value: stats.totalBookings.toLocaleString(),
      note: `${rangeNote[range]} ${t("statCards.totalBookings.noteSuffix")}`,
      icon: "Orders",
      color: "#7dd3fc",
    },
    {
      label: t("statCards.revenue.label"),
      value: formatMoney(stats.revenue, lang),
      note: `${rangeNote[range]} ${t("statCards.revenue.noteSuffix")}`,
      icon: "Revenue",
      color: "var(--color-gold-500)",
      highlight: true,
    },
  ];

  const bookingStatusData = useMemo(
    () => analytics.bookingsByStatus,
    [analytics.bookingsByStatus],
  );
  const revenueData = useMemo(
    () => analytics.revenueByMonth,
    [analytics.revenueByMonth],
  );
  const bookingsByMonthData = useMemo(
    () => analytics.bookingsByMonth,
    [analytics.bookingsByMonth],
  );
  const topRoomsData = useMemo(() => analytics.topRooms, [analytics.topRooms]);
  const occupancyData = useMemo(
    () => [{ month: "Current", value: occupancyRate }],
    [occupancyRate],
  );
  const recentBookings = useMemo(
    () => analytics.recentBookings,
    [analytics.recentBookings],
  );

  return (
    <div
      style={{
        background: "var(--color-navy-900)",
        minHeight: "100vh",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-sans)",
        display: "flex",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-10%",
            left: "-5%",
            width: 500,
            height: 500,
            background: "var(--color-gold-500)",
            borderRadius: "50%",
            filter: "blur(120px)",
            opacity: 0.06,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-15%",
            right: "-5%",
            width: 600,
            height: 600,
            background: "#1c2b52",
            borderRadius: "50%",
            filter: "blur(120px)",
            opacity: 0.35,
          }}
        />
      </div>

      <main
        style={{
          flex: 1,
          padding: "28px 32px",
          overflowY: "auto",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 14,
            marginBottom: 28,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 26,
                fontWeight: 700,
                color: "var(--color-text-primary)",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              Admin Dashboard
            </h1>
            <p
              style={{
                color: "var(--color-text-muted)",
                fontSize: 13,
                margin: "4px 0 0",
              }}
            >
              Live hotel operations overview
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 4,
                padding: 4,
                borderRadius: 14,
                background: "var(--color-navy-700)",
                border: "1px solid var(--color-border-soft)",
              }}
            >
              {rangeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setRange(option.value)}
                  disabled={loading}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 10,
                    border: "none",
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: "var(--font-sans)",
                    cursor: loading ? "not-allowed" : "pointer",
                    background: range === option.value ? "var(--color-gold-500)" : "transparent",
                    color: range === option.value ? "var(--color-navy-950)" : "var(--color-text-secondary)",
                    transition: "background 0.15s ease, color 0.15s ease",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => loadDashboard(range, { announce: true })}
              disabled={loading}
              style={{
                padding: "8px 20px",
                borderRadius: 20,
                background:
                  "linear-gradient(135deg, var(--color-gold-400), var(--color-gold-500))",
                border: "none",
                color: "var(--color-navy-950)",
                fontWeight: 700,
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.75 : 1,
              }}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>

            <div style={{ display: "flex", gap: 6 }}>
              {["xlsx", "pdf"].map((format) => (
                <button
                  key={format}
                  onClick={() => handleExport(format)}
                  disabled={loading || exportingFormat !== null}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 20,
                    background: "transparent",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-gold-400)",
                    fontWeight: 700,
                    fontFamily: "var(--font-sans)",
                    fontSize: 13,
                    cursor:
                      loading || exportingFormat !== null
                        ? "not-allowed"
                        : "pointer",
                    opacity:
                      exportingFormat !== null && exportingFormat !== format
                        ? 0.5
                        : 1,
                  }}
                >
                  {exportingFormat === format
                    ? "Đang xuất..."
                    : `Xuất ${format === "xlsx" ? "Excel" : "PDF"}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 20,
              padding: "14px 16px",
              borderRadius: 12,
              color: "#f87171",
              background: "rgba(248,113,113,0.12)",
              border: "1px solid rgba(248,113,113,0.25)",
              fontSize: 13.5,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <DashboardSkeleton />
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
                marginBottom: 24,
              }}
            >
              {statCards.map((card) => (
                <StatCard key={card.label} {...card} />
              ))}
            </div>

            <div
              style={{ ...PANEL_STYLE, padding: "24px 28px", marginBottom: 24 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 20,
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-serif)",
                      fontSize: 17,
                      fontWeight: 700,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    Room Occupancy
                  </h2>
                  <p
                    style={{
                      margin: "4px 0 0",
                      color: "var(--color-text-muted)",
                      fontSize: 12,
                    }}
                  >
                    Current booked room ratio
                  </p>
                </div>
                <span
                  style={{
                    padding: "6px 14px",
                    borderRadius: 20,
                    background: "rgba(103,232,180,0.12)",
                    color: "#67e8b4",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {occupancyRate}%
                </span>
              </div>

              <div style={{ height: 240 }}>
                <OccupancyChart data={occupancyData} />
              </div>
            </div>

            <div style={PANEL_STYLE}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 18,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-serif)",
                    fontSize: 17,
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                  }}
                >
                  Recent Bookings
                </h2>
              </div>

              {recentBookings.length === 0 ? (
                <div
                  style={{
                    padding: "32px 12px",
                    textAlign: "center",
                    color: "var(--color-text-muted)",
                  }}
                >
                  <span
                    style={{
                      color: "var(--color-border)",
                      display: "flex",
                      justifyContent: "center",
                      marginBottom: 8,
                    }}
                  >
                    <Icon.CalendarOff />
                  </span>
                  No bookings in this period yet.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {[
                          "Booking ID",
                          "Guest",
                          "Room",
                          "Check-in",
                          "Check-out",
                          "Status",
                          "Amount",
                        ].map((header) => (
                          <th
                            key={header}
                            style={{
                              padding: "8px 12px",
                              textAlign: "left",
                              fontSize: 11,
                              color: "var(--color-text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              borderBottom:
                                "1px solid var(--color-border-soft)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentBookings.map((booking) => {
                        const style =
                          statusStyle[booking.status] || statusStyle.pending;

                        return (
                          <tr
                            key={booking.id}
                            style={{
                              borderBottom:
                                "1px solid var(--color-border-soft)",
                            }}
                          >
                            <td
                              style={{
                                padding: "12px",
                                fontSize: 13,
                                color: "var(--color-gold-400)",
                                fontWeight: 600,
                              }}
                            >
                              #BK-{String(booking.id).padStart(4, "0")}
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: 13,
                                color: "var(--color-text-primary)",
                              }}
                            >
                              {booking.user_name || "-"}
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: 13,
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              {booking.room_name || "-"}
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: 13,
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              {formatDate(booking.check_in)}
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: 13,
                                color: "var(--color-text-secondary)",
                              }}
                            >
                              {formatDate(booking.check_out)}
                            </td>
                            <td style={{ padding: "12px" }}>
                              <span
                                style={{
                                  padding: "3px 10px",
                                  borderRadius: 20,
                                  background: style.bg,
                                  color: style.color,
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}
                              >
                                {style.label}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: "12px",
                                fontSize: 13,
                                color: "var(--color-text-primary)",
                                fontWeight: 600,
                              }}
                            >
                              {formatMoney(booking.total_price)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ ...PANEL_STYLE, marginTop: 24 }}>
              <div style={{ marginBottom: 12 }}>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-serif)",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                  }}
                >
                  Revenue Overview
                </h3>
              </div>
              <RevenueChart data={revenueData} />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 20,
                marginTop: 20,
              }}
            >
              <div style={PANEL_STYLE}>
                <div style={{ marginBottom: 12 }}>
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-serif)",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    Bookings By Month
                  </h3>
                </div>
                <BookingsByMonthChart data={bookingsByMonthData} />
              </div>

              <div style={PANEL_STYLE}>
                <div style={{ marginBottom: 12 }}>
                  <h3
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-serif)",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--color-text-primary)",
                    }}
                  >
                    Top Booked Rooms
                  </h3>
                </div>

                {topRoomsData.length === 0 ? (
                  <div
                    style={{
                      padding: 24,
                      textAlign: "center",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    No room booking data.
                  </div>
                ) : (
                  <TopRoomsChart data={topRoomsData} />
                )}
              </div>
            </div>

            <div style={{ ...PANEL_STYLE, marginTop: 20 }}>
              <div style={{ marginBottom: 12 }}>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: "var(--font-serif)",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                  }}
                >
                  Booking Status
                </h3>
              </div>

              {bookingStatusData.length === 0 ? (
                <div
                  style={{
                    padding: 24,
                    textAlign: "center",
                    color: "var(--color-text-muted)",
                  }}
                >
                  No booking status data.
                </div>
              ) : (
                <>
                  <BookingStatusChart data={bookingStatusData} />
                  <div style={{ marginTop: 10 }}>
                    {bookingStatusData.map((item) => (
                      <div
                        key={item.name}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                          fontSize: 13,
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        <span>
                          <span
                            style={{
                              display: "inline-block",
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: item.color,
                              marginRight: 6,
                            }}
                          />
                          {item.name}
                        </span>
                        <span>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
