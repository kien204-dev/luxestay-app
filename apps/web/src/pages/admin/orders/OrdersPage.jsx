import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { KpiCard, PageHeader, RefreshButton } from "../../../components/admin/ui";
import { useBookingNotifications } from "../../../context/BookingNotificationsContext";
import { useToast } from "../../../context/ToastContext";
import { getBookingSummary } from "../../../services/bookingService";
import { formatMoney } from "../../../utils/format";
import Icon from "../../../utils/icon";
import { useAsyncData } from "../../../utils/useAsyncData";
import WalkInBookingModal from "./WalkInBookingModal";
import OrdersList from "./OrdersList";
import ReviewsPanel from "./ReviewsPanel";
import { bookingCode } from "../../../utils/bookingCode";

// Admin: totals, the booking list (one page at a time) and guest reviews.
export default function OrdersPage() {
  const { t, i18n } = useTranslation("orders");
  const toast = useToast();
  const { clearNewBookingCount } = useBookingNotifications();
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const summary = useAsyncData("orders-summary", getBookingSummary);

  // Opening the page counts as having seen the new bookings.
  useEffect(() => {
    clearNewBookingCount();
  }, [clearNewBookingCount]);

  const refresh = () => {
    summary.reload();
    setRefreshKey((key) => key + 1);
  };

  const kpis = summary.data
    ? [
        { label: t("kpi.revenue"), value: formatMoney(summary.data.revenue, i18n.language), icon: Icon.Revenue, tone: "success" },
        { label: t("kpi.pending"), value: summary.data.pending, icon: Icon.Booking, tone: "warning" },
        { label: t("kpi.refundPending"), value: summary.data.refundPending, icon: Icon.AlertCircle, tone: "danger" },
        { label: t("kpi.total"), value: summary.data.total, icon: Icon.Orders },
      ]
    : ["revenue", "pending", "refundPending", "total"].map((key) => ({ label: t(`kpi.${key}`), value: "", loading: true }));

  return (
    <div data-testid="orders-page">
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<RefreshButton onClick={refresh} loading={summary.loading} />} />

      <div className="adm-kpis">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <OrdersList refreshKey={refreshKey} onChanged={summary.reload} onWalkIn={() => setWalkInOpen(true)} />
      <ReviewsPanel />

      {walkInOpen && (
        <WalkInBookingModal
          onClose={() => setWalkInOpen(false)}
          onCreated={(booking) => {
            setWalkInOpen(false);
            toast.success(t("toast.walkInCreated", { code: bookingCode(booking.id) }));
            refresh();
          }}
        />
      )}
    </div>
  );
}
