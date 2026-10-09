import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Pagination from "../components/guest/Pagination";
import StateMessage from "../components/guest/StateMessage";
import GuestIcon from "../components/guest/icons";
import BookingCard from "../components/myBookings/BookingCard";
import BookingDetailModal from "../components/myBookings/BookingDetailModal";
import CancelModal from "../components/myBookings/CancelModal";
import PaymentModal from "../components/myBookings/PaymentModal";
import ReviewModal from "../components/myBookings/ReviewModal";
import { PAGE_SIZE } from "../components/myBookings/helpers";
import { useToast } from "../context/ToastContext";
import { cancelBooking, getBookingCounts, getBookings } from "../services/bookingService";
import { createPayment } from "../services/paymentService";
import { apiErrorText } from "../utils/apiError";
import { useAsyncData } from "../utils/useAsyncData";
import { useBookingPolicy } from "../utils/useBookingPolicy";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { usePaymentProviders } from "../utils/usePaymentProviders";
import "../styles/rooms.css";
import "../styles/booking.css";

// The tabs, and what each asks the API for. They are the booking's real
// states; "refund" is a cancelled booking whose payment is waiting to be
// sent back.
const TABS = [
  { key: "all", query: {} },
  { key: "pending", query: { status: "pending" } },
  { key: "confirmed", query: { status: "confirmed" } },
  { key: "completed", query: { status: "completed" } },
  { key: "cancelled", query: { status: "cancelled" } },
  { key: "refund_pending", query: { payment_status: "refund_pending" } },
];

export default function MyBookings() {
  const { t } = useTranslation("myBookings");
  useDocumentTitle(t("header.title"));
  const toast = useToast();
  const policy = useBookingPolicy();
  const paymentProviders = usePaymentProviders();

  const [tab, setTab] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [cancellingBusy, setCancellingBusy] = useState(false);
  const [paying, setPaying] = useState(null);
  const [payingProvider, setPayingProvider] = useState(null);
  const [payError, setPayError] = useState("");
  const [reviewing, setReviewing] = useState(null);

  // One request per combination of tab, dates and page.
  const list = useAsyncData(`my-bookings:${tab}:${fromDate}:${toDate}:${page}`, async () => {
    const res = await getBookings({
      page,
      limit: PAGE_SIZE,
      ...TABS.find((item) => item.key === tab).query,
      ...(fromDate ? { from: fromDate } : {}),
      ...(toDate ? { to: toDate } : {}),
    });
    return res.data;
  });
  const counts = useAsyncData("my-booking-counts", getBookingCounts);

  const bookings = list.data?.data || [];
  const total = list.data?.total ?? 0;
  const totalPages = list.data?.totalPages ?? 1;
  const filtered = tab !== "all" || fromDate || toDate;
  const state = list.loading ? "loading" : list.error ? "error" : bookings.length === 0 ? "empty" : "ready";

  // A new tab or date always starts again from the first page.
  const choose = (change) => {
    change();
    setPage(1);
  };
  const reload = () => {
    list.reload();
    counts.reload();
  };

  const confirmCancel = async () => {
    setCancellingBusy(true);
    try {
      const res = await cancelBooking(cancelling.id);
      const cancelled = res.data?.booking || {};
      toast.success(cancelled.payment_status === "refund_pending" ? t("errors.cancelSuccessRefund") : t("errors.cancelSuccess"));
      setCancelling(null);
      setSelectedBooking(null);
      reload();
    } catch (err) {
      // The dialog stays open with the booking as it was.
      toast.error(apiErrorText(err, "myBookings:errors.cancelFailed"));
    } finally {
      setCancellingBusy(false);
    }
  };

  const payNow = async (provider) => {
    setPayError("");
    setPayingProvider(provider);
    try {
      const res = await createPayment(paying.id, provider);
      window.location.href = res.data.payUrl;
    } catch (err) {
      setPayError(apiErrorText(err, "myBookings:errors.paymentInitFailed"));
      setPayingProvider(null);
    }
  };

  return (
    <div className="guest-container my-bookings" data-testid="my-bookings" data-state={state}>
      <div className="page-head">
        <ol className="crumbs">
          <li><Link to="/">{t("site:list.home")}</Link></li>
          <li aria-current="page">{t("header.title")}</li>
        </ol>
        <h1>{t("header.title")}</h1>
      </div>

      <div className="booking-tabs" role="tablist" aria-label={t("filters.status")}>
        {TABS.map(({ key }) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => choose(() => setTab(key))} data-testid={`tab-${key}`}>
            {t(`tabs.${key}`)}
            {counts.data && <span>{counts.data[key] ?? 0}</span>}
          </button>
        ))}
      </div>

      <div className="booking-filters">
        <div className="g-field">
          <label className="g-label" htmlFor="bookings-from">{t("filters.fromDate")}</label>
          <input id="bookings-from" className="g-input" type="date" value={fromDate} onChange={(e) => choose(() => setFromDate(e.target.value))} />
        </div>
        <div className="g-field">
          <label className="g-label" htmlFor="bookings-to">{t("filters.toDate")}</label>
          <input id="bookings-to" className="g-input" type="date" value={toDate} onChange={(e) => choose(() => setToDate(e.target.value))} />
        </div>
        {(fromDate || toDate) && (
          <button type="button" className="g-btn g-btn--link" onClick={() => choose(() => { setFromDate(""); setToDate(""); })}>{t("filters.clear")}</button>
        )}
        <button type="button" className="g-btn g-btn--outline booking-refresh" onClick={reload} disabled={list.loading}>
          <GuestIcon.Retry small />
          {list.loading ? t("header.refreshing") : t("header.refresh")}
        </button>
      </div>

      {state === "loading" && (
        <div aria-busy="true" data-testid="bookings-loading">
          <span className="sr-only" role="status">{t("header.refreshing")}</span>
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="my-booking-card">
              <span className="luxe-skeleton-light" style={{ minHeight: 160 }} />
              <div className="my-booking-main">
                <span className="luxe-skeleton-light" style={{ width: 120, height: 24 }} />
                <span className="luxe-skeleton-light" style={{ width: "55%", height: 28 }} />
                <span className="luxe-skeleton-light" style={{ width: "70%", height: 12 }} />
              </div>
              <div className="my-booking-side">
                <span className="luxe-skeleton-light" style={{ width: 140, height: 28 }} />
                <span className="luxe-skeleton-light" style={{ width: 180, height: 44 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {state === "error" && (
        <StateMessage error heading="h2" title={t("errors.loadFailed")} text={t("errors.loadFailedText")} testId="bookings-error">
          <button type="button" className="g-btn g-btn--primary" onClick={reload}>
            <GuestIcon.Retry />
            {t("site:list.retry")}
          </button>
        </StateMessage>
      )}

      {state === "empty" && (
        <StateMessage heading="h2" title={filtered ? t(`emptyTab.${tab}`) : t("empty.title")} text={filtered ? t("empty.filtered") : t("empty.none")} testId="bookings-empty">
          <Link className="g-btn g-btn--primary" to="/rooms">{t("empty.exploreRooms")}</Link>
        </StateMessage>
      )}

      {state === "ready" && (
        <>
          <div className="my-booking-list">
            {bookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                policy={policy}
                onDetails={setSelectedBooking}
                onPay={(b) => { setPayError(""); setPaying(b); }}
                onCancel={setCancelling}
                onReview={setReviewing}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onChange={setPage} rangeKey="list.showingBookings" />
        </>
      )}

      {selectedBooking && <BookingDetailModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} />}

      {paying && (
        <PaymentModal
          booking={paying}
          providers={paymentProviders}
          payingProvider={payingProvider}
          error={payError}
          onPay={payNow}
          onClose={() => setPaying(null)}
        />
      )}

      {reviewing && (
        <ReviewModal
          booking={reviewing}
          toast={toast}
          onClose={() => setReviewing(null)}
          onSubmitted={() => {
            setReviewing(null);
            list.setData((current) =>
              current ? { ...current, data: current.data.map((b) => (b.id === reviewing.id ? { ...b, has_review: true } : b)) } : current
            );
          }}
        />
      )}

      {cancelling && (
        <CancelModal booking={cancelling} policy={policy} cancelling={cancellingBusy} onConfirm={confirmCancel} onClose={() => setCancelling(null)} />
      )}
    </div>
  );
}
