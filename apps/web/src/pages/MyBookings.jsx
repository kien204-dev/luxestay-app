import { useEffect, useState } from "react";
import { useAsyncData } from "../utils/useAsyncData";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getBookings, cancelBooking, getBookingPolicy } from "../services/bookingService";
import { createPayment } from "../services/paymentService";
import { useToast } from "../context/ToastContext";
import { usePaymentProviders } from "../utils/usePaymentProviders";
import ConfirmModal from "../components/ConfirmModal";
import BookingCard from "../components/myBookings/BookingCard";
import BookingDetailModal from "../components/myBookings/BookingDetailModal";
import BookingFilters from "../components/myBookings/BookingFilters";
import PaymentModal from "../components/myBookings/PaymentModal";
import ReviewModal from "../components/myBookings/ReviewModal";
import { PAGE_SIZE } from "../components/myBookings/helpers";
import "../styles/my-bookings.css";

export default function MyBookings() {
  const navigate = useNavigate();
  const toast = useToast();
  const paymentProviders = usePaymentProviders();
  const [freeCancellationDays, setFreeCancellationDays] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getBookingPolicy()
      .then((res) => {
        if (!cancelled) setFreeCancellationDays(res.data?.freeCancellationDays ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const { t } = useTranslation("myBookings");
  const [cancellingId, setCancellingId] = useState(null);
  const [bookingToCancel, setBookingToCancel] = useState(null);
  const [payingBooking, setPayingBooking] = useState(null);
  const [payingProvider, setPayingProvider] = useState(null);
  const [payError, setPayError] = useState("");
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [reviewingBooking, setReviewingBooking] = useState(null);
  const [submittedReviews, setSubmittedReviews] = useState({});
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  // One request per combination of filters and page; changing any of them
  // (see changeFilter / setPage) loads the matching list.
  const bookingsQuery = useAsyncData(
    `my-bookings:${statusFilter}:${fromDate}:${toDate}:${page}`,
    async () => {
      const res = await getBookings({
        page,
        limit: PAGE_SIZE,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(fromDate ? { from: fromDate } : {}),
        ...(toDate ? { to: toDate } : {}),
      });
      return res.data;
    }
  );

  const bookings = bookingsQuery.data?.data || [];
  const meta = {
    total: bookingsQuery.data?.total ?? 0,
    totalPages: bookingsQuery.data?.totalPages ?? 1,
  };
  const loading = bookingsQuery.loading;
  const error = bookingsQuery.error
    ? bookingsQuery.error.response?.data?.message || t("myBookings:errors.loadFailed")
    : "";
  const reloadBookings = bookingsQuery.reload;
  const setBookings = (update) =>
    bookingsQuery.setData((current) => (current ? { ...current, data: update(current.data) } : current));

  // A new filter always starts again from the first page.
  const changeFilters = (changes) => {
    if ("statusFilter" in changes) setStatusFilter(changes.statusFilter);
    if ("fromDate" in changes) setFromDate(changes.fromDate);
    if ("toDate" in changes) setToDate(changes.toDate);
    setPage(1);
  };

  const openPayment = (booking) => {
    setPayError("");
    setPayingBooking(booking);
  };

  const requestCancel = (id) => setBookingToCancel(id);

  const confirmCancel = async () => {
    const id = bookingToCancel;
    if (id == null) return;

    setCancellingId(id);
    try {
      const res = await cancelBooking(id);
      const cancelled = res.data?.booking || {};
      setSelectedBooking((booking) =>
        booking?.id === id
          ? { ...booking, status: "cancelled", payment_status: cancelled.payment_status ?? booking.payment_status }
          : booking
      );
      reloadBookings();
      toast.success(
        cancelled.payment_status === "refund_pending"
          ? t("myBookings:errors.cancelSuccessRefund")
          : t("myBookings:errors.cancelSuccess")
      );
      setBookingToCancel(null);
    } catch (err) {
      toast.error(err.response?.data?.message || t("myBookings:errors.cancelFailed"));
    } finally {
      setCancellingId(null);
    }
  };

  const handleReviewSubmitted = (bookingId, review) => {
    setSubmittedReviews((prev) => ({ ...prev, [bookingId]: review }));
    setBookings((list) =>
      list.map((b) => (b.id === bookingId ? { ...b, has_review: true } : b))
    );
    setReviewingBooking(null);
  };

  const handlePayNow = async (provider) => {
    if (!payingBooking) return;

    setPayError("");
    setPayingProvider(provider);
    try {
      const res = await createPayment(payingBooking.id, provider);
      window.location.href = res.data.payUrl;
    } catch (err) {
      setPayError(
        err.response?.data?.message || t("myBookings:errors.paymentInitFailed")
      );
      setPayingProvider(null);
    }
  };

  return (
    <div
      className="font-body"
      style={{ background: "#fafafa", color: "#1A1C1E" }}
    >
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <div className="my-bookings-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <h1 className="font-headline" style={{ margin: 0, fontSize: 28, color: "#002366" }}>
            {t("myBookings:header.title")}
          </h1>
          <button
            onClick={reloadBookings}
            disabled={loading}
            style={{ padding: "8px 16px", background: "#002366", color: "#fff", border: "none", borderRadius: 6, cursor: loading ? "not-allowed" : "pointer", fontSize: 13 }}
          >
            {loading ? t("myBookings:header.refreshing") : t("myBookings:header.refresh")}
          </button>
        </div>

        <BookingFilters statusFilter={statusFilter} fromDate={fromDate} toDate={toDate} onChange={changeFilters} />

        {error && (
          <div
            style={{
              background: "#fef2f2",
              color: "#b91c1c",
              padding: 16,
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  overflow: "hidden",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                  display: "grid",
                  gridTemplateColumns: "140px 1fr auto",
                  gap: 0,
                }}
              >
                <div className="luxe-skeleton-light" style={{ minHeight: 120, borderRadius: 0 }} />
                <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="luxe-skeleton-light" style={{ height: 14, width: "30%" }} />
                  <div className="luxe-skeleton-light" style={{ height: 18, width: "50%" }} />
                  <div className="luxe-skeleton-light" style={{ height: 14, width: "40%" }} />
                </div>
                <div style={{ padding: "20px 24px", display: "flex", alignItems: "center" }}>
                  <div className="luxe-skeleton-light" style={{ height: 32, width: 90 }} />
                </div>
              </div>
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <span style={{ color: "#C5A059", display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <Icon.CalendarOff />
            </span>
            <p style={{ color: "#64748b", marginBottom: 20 }}>
              {statusFilter || fromDate || toDate
                ? t("myBookings:empty.filtered")
                : t("myBookings:empty.none")}
            </p>
            <button
              onClick={() => navigate("/rooms")}
              style={{
                padding: "12px 24px",
                background: "#002366",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {t("myBookings:empty.exploreRooms")}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {bookings.map((booking) => (
              <BookingCard
                key={booking.id}
                booking={booking}
                cancelling={cancellingId === booking.id}
                submittedReview={submittedReviews[booking.id]}
                onDetails={setSelectedBooking}
                onPay={openPayment}
                onCancel={requestCancel}
                onReview={setReviewingBooking}
              />
            ))}
          </div>
        )}

        {!loading && meta.totalPages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 16,
              marginTop: 28,
            }}
          >
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1 || loading}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: page <= 1 ? "#cbd5e1" : "#002366",
                cursor: page <= 1 ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {t("myBookings:pagination.prev")}
            </button>
            <span style={{ color: "#64748b", fontSize: 13 }}>
              {t("myBookings:pagination.pageInfo", { page, totalPages: meta.totalPages, total: meta.total })}
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= meta.totalPages || loading}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: page >= meta.totalPages ? "#cbd5e1" : "#002366",
                cursor: page >= meta.totalPages ? "not-allowed" : "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {t("myBookings:pagination.next")}
            </button>
          </div>
        )}
      </main>

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
        />
      )}

      {reviewingBooking && (
        <ReviewModal
          booking={reviewingBooking}
          toast={toast}
          onClose={() => setReviewingBooking(null)}
          onSubmitted={(review) => handleReviewSubmitted(reviewingBooking.id, review)}
        />
      )}

      <ConfirmModal
        variant="light"
        open={bookingToCancel != null}
        title={t("myBookings:cancelModal.title")}
        message={
          t("myBookings:cancelModal.message", { id: String(bookingToCancel).padStart(4, "0") }) +
          (freeCancellationDays != null
            ? ` ${t("myBookings:cancelModal.policy", { count: freeCancellationDays })}`
            : "")
        }
        confirmLabel={t("myBookings:cancelModal.confirmLabel")}
        cancelLabel={t("myBookings:cancelModal.cancelLabel")}
        tone="danger"
        loading={cancellingId === bookingToCancel}
        onConfirm={confirmCancel}
        onCancel={() => setBookingToCancel(null)}
      />

      {payingBooking && (
        <PaymentModal
          booking={payingBooking}
          providers={paymentProviders}
          payingProvider={payingProvider}
          error={payError}
          onPay={handlePayNow}
          onClose={() => setPayingBooking(null)}
        />
      )}
    </div>
  );
}
