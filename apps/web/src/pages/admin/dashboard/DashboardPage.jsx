import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, KpiCard, PageHeader } from "../../../components/admin/ui";
import { useToast } from "../../../context/ToastContext";
import { exportDashboardReport, getDashboardAnalytics, getDashboardStats } from "../../../services/dashboardService";
import { apiErrorText } from "../../../utils/apiError";
import { formatMoney } from "../../../utils/format";
import Icon from "../../../utils/icon";
import { useAsyncData } from "../../../utils/useAsyncData";
import DashboardCharts from "./DashboardCharts";
import RecentBookings from "./RecentBookings";

const RANGES = ["today", "week", "month", "year", "all"];
const EMPTY_ANALYTICS = { revenueByMonth: [], bookingsByMonth: [], bookingsByStatus: [], topRooms: [], occupancy: {}, recentBookings: [] };

function normalizeAnalytics(data) {
  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    ...EMPTY_ANALYTICS,
    ...data,
    revenueByMonth: list(data?.revenueByMonth),
    bookingsByMonth: list(data?.bookingsByMonth),
    bookingsByStatus: list(data?.bookingsByStatus).map((item) => ({ name: item.status || "pending", value: Number(item.count) || 0 })),
    topRooms: list(data?.topRooms),
    recentBookings: list(data?.recentBookings),
  };
}

// Admin home: figures for the chosen period, tonight's occupancy, charts
// (bucketed in the property's timezone by the API) and recent bookings.
export default function DashboardPage() {
  const { t, i18n } = useTranslation("dashboard");
  const toast = useToast();
  const [range, setRange] = useState("year");
  const [exporting, setExporting] = useState(null);
  // A refresh reports its outcome; loads from changing the range stay quiet.
  const announce = useRef(false);

  const { data, loading, error, reload } = useAsyncData(`dashboard:${range}`, async () => {
    const shouldAnnounce = announce.current;
    announce.current = false;
    // "All time" has no chart buckets of its own; the charts show this year.
    const [stats, analytics] = await Promise.all([getDashboardStats(range), getDashboardAnalytics(range === "all" ? "year" : range)]);
    if (shouldAnnounce) toast.success(t("errors.refreshed"));
    return { stats, analytics: normalizeAnalytics(analytics) };
  });

  const stats = data?.stats || {};
  const analytics = data?.analytics || EMPTY_ANALYTICS;
  const note = t(`rangeNote.${range}`);
  const occupancy = analytics.occupancy || {};
  const number = (value) => (Number(value) || 0).toLocaleString(i18n.language === "en" ? "en-US" : "vi-VN");

  const cards = [
    { label: t("statCards.totalRooms.label"), value: number(stats.totalRooms), sub: t("statCards.totalRooms.note"), icon: Icon.Rooms },
    { label: t("statCards.occupiedTonight.label"), value: `${number(stats.bookedRooms)} · ${occupancy.occupancyRate ?? 0}%`, sub: t("statCards.occupiedTonight.note"), icon: Icon.Booking, tone: "warning" },
    { label: t("statCards.availableRooms.label"), value: number(stats.availableRooms), sub: t("statCards.availableRooms.note"), icon: Icon.Hotel, tone: "success" },
    { label: t("statCards.totalBookings.label"), value: number(stats.totalBookings), sub: `${note} · ${t("statCards.totalBookings.noteSuffix")}`, icon: Icon.Orders, tone: "info" },
    { label: t("statCards.revenue.label"), value: formatMoney(stats.revenue, i18n.language), sub: `${note} · ${t("statCards.revenue.noteSuffix")}`, icon: Icon.Revenue, tone: "success" },
    { label: t("statCards.outstanding.label"), value: formatMoney(stats.outstanding, i18n.language), sub: `${note} · ${t("statCards.outstanding.noteSuffix")}`, icon: Icon.AlertCircle, tone: "danger" },
  ];

  const exportReport = async (format) => {
    setExporting(format);
    try {
      await exportDashboardReport(range, format);
    } catch (err) {
      toast.error(apiErrorText(err, "dashboard:errors.exportFailed"));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div data-testid="dashboard-page">
      <PageHeader
        title={t("header.title")}
        subtitle={t("header.subtitle")}
        actions={
          <>
            <div className="adm-chips" role="group" aria-label={t("rangeLabel")}>
              {RANGES.map((value) => (
                <button key={value} type="button" className={`adm-chip ${range === value ? "is-active" : ""}`} aria-pressed={range === value} onClick={() => setRange(value)} disabled={loading}>
                  {t(`rangeOptions.${value}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="adm-btn adm-btn--muted"
              onClick={() => {
                announce.current = true;
                reload();
              }}
              disabled={loading}
            >
              <Icon.Refresh />
              {loading ? t("refresh.loading") : t("refresh.refresh")}
            </button>
            {["xlsx", "pdf"].map((format) => (
              <button key={format} type="button" className="adm-btn adm-btn--ghost" onClick={() => exportReport(format)} disabled={loading || exporting !== null}>
                <Icon.Download />
                {exporting === format ? t("export.exporting") : t(format === "xlsx" ? "export.excel" : "export.pdf")}
              </button>
            ))}
          </>
        }
      />

      <Alert>{error ? apiErrorText(error, "dashboard:errors.loadFailed") : ""}</Alert>

      <div className="adm-kpis">
        {cards.map((card) => (
          <KpiCard key={card.label} {...card} loading={!data} />
        ))}
      </div>

      {data && (
        <>
          {range === "all" && <p className="adm-note" style={{ margin: "0 0 4px" }}>{t("chartsAllNote")}</p>}
          <DashboardCharts analytics={analytics} />
          <RecentBookings bookings={analytics.recentBookings} />
        </>
      )}
    </div>
  );
}
