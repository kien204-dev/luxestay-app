import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getBookings, cancelBooking } from "../services/bookingService";
import { createPayment } from "../services/paymentService";
import { createReview } from "../services/reviewService";
import { normalizeImageUrl, useFallbackImage } from "../utils/imageUrl";
import { useToast } from "../context/ToastContext";
import { usePaymentProviders } from "../utils/usePaymentProviders";
import Icon from "../utils/icon";
import ConfirmModal from "../components/ConfirmModal";
import StarRating from "../components/StarRating";

const PAGE_SIZE = 5;

function getStatusFilterOptions(t) {
  return [
    { value: "", label: t("myBookings:filters.statusOptions.all") },
    { value: "pending", label: t("myBookings:filters.statusOptions.pending") },
    { value: "confirmed", label: t("myBookings:filters.statusOptions.confirmed") },
    { value: "completed", label: t("myBookings:filters.statusOptions.completed") },
    { value: "cancelled", label: t("myBookings:filters.statusOptions.cancelled") },
  ];
}

const STATUS_STYLE = {
  confirmed: { color: "#67e8b4", bg: "rgba(103,232,180,0.12)" },
  pending: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  cancelled: { color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  completed: { color: "#9fa7ff", bg: "rgba(159,167,255,0.12)" },
};

function getStatusLabel(t) {
  return {
    confirmed: t("myBookings:status.confirmed"),
    pending: t("myBookings:status.pending"),
    cancelled: t("myBookings:status.cancelled"),
    completed: t("myBookings:status.completed"),
  };
}

const PAYMENT_STATUS_STYLE = {
  unpaid: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
  pending: { color: "#fbbf24", bg: "rgba(251,191,36,0.12)" },
  paid: { color: "#059669", bg: "rgba(5,150,105,0.12)" },
  failed: { color: "#dc2626", bg: "rgba(220,38,38,0.12)" },
  refunded: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

function getPaymentStatusLabel(t) {
  return {
    unpaid: t("myBookings:paymentStatus.unpaid"),
    pending: t("myBookings:paymentStatus.pending"),
    paid: t("myBookings:paymentStatus.paid"),
    failed: t("myBookings:paymentStatus.failed"),
    refunded: t("myBookings:paymentStatus.refunded"),
  };
}

function formatMoney(value, lang = "vi") {
  const amount = (Number(value) || 0).toLocaleString(lang === "en" ? "en-US" : "vi-VN");
  return lang === "en" ? `${amount} VND` : `${amount} đ`;
}

function formatDate(value, lang = "vi") {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(lang === "en" ? "en-US" : "vi-VN");
}

function calculateNights(checkIn, checkOut) {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

function buildTimeline(booking, t) {
  const status = booking.status || "pending";
  const items = [
    {
      label: t("myBookings:timeline.created"),
      date: booking.created_at,
      active: true,
    },
  ];

  if (status === "cancelled") {
    items.push({
      label: t("myBookings:timeline.cancelled"),
      date: null,
      active: true,
      note: t("myBookings:timeline.cancelledNote"),
    });
  } else {
    items.push({
      label: status === "pending" ? t("myBookings:timeline.pending") : t("myBookings:timeline.confirmed"),
      date: status === "pending" ? null : booking.created_at,
      active: ["pending", "confirmed", "completed"].includes(status),
    });

    items.push({
      label: t("myBookings:timeline.checkIn"),
      date: booking.check_in,
      active: ["confirmed", "completed"].includes(status),
    });

    items.push({
      label: status === "completed" ? t("myBookings:timeline.checkOutCompleted") : t("myBookings:timeline.checkOut"),
      date: booking.check_out,
      active: status === "completed",
    });
  }

  return items;
}

export default function MyBookings() {
  const navigate = useNavigate();
  const toast = useToast();
  const paymentProviders = usePaymentProviders();
  const { t, i18n } = useTranslation("myBookings");
  const lang = i18n.language;
  const statusFilterOptions = getStatusFilterOptions(t);
  const statusLabel = getStatusLabel(t);
  const paymentStatusLabel = getPaymentStatusLabel(t);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });

  const loadBookings = useCallback(
    async (targetPage) => {
      try {
        setLoading(true);
        setError("");
        const res = await getBookings({
          page: targetPage,
          limit: PAGE_SIZE,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(fromDate ? { from: fromDate } : {}),
          ...(toDate ? { to: toDate } : {}),
        });
        setBookings(res.data.data);
        setMeta({ total: res.data.total, totalPages: res.data.totalPages });
        setPage(res.data.page);
      } catch (err) {
        setError(
          err.response?.data?.message || t("myBookings:errors.loadFailed")
        );
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, fromDate, toDate, t]
  );

  useEffect(() => {
    loadBookings(1);
  }, [loadBookings]);

  const requestCancel = (id) => setBookingToCancel(id);

  const confirmCancel = async () => {
    const id = bookingToCancel;
    if (id == null) return;

    setCancellingId(id);
    try {
      await cancelBooking(id);
      setSelectedBooking((booking) =>
        booking?.id === id ? { ...booking, status: "cancelled" } : booking
      );
      await loadBookings(page);
      toast.success(t("myBookings:errors.cancelSuccess"));
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
      style={{ minHeight: "100vh", background: "#fafafa", color: "#1A1C1E" }}
    >
      <style>{`
        @media (max-width: 720px) {
          .my-bookings-header {
            align-items: flex-start !important;
            flex-direction: column !important;
            padding: 14px 18px !important;
          }
          .my-booking-card {
            grid-template-columns: 1fr !important;
          }
          .my-booking-image {
            min-height: 180px !important;
          }
          .my-booking-actions {
            align-items: flex-start !important;
            padding-top: 0 !important;
          }
          .booking-detail-panel {
            max-height: 92vh !important;
            overflow-y: auto !important;
          }
          .booking-detail-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <header
        className="my-bookings-header"
        style={{
          background: "#fff",
          borderBottom: "1px solid #e2e8f0",
          padding: "16px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => navigate("/booking")}
            style={{
              background: "transparent",
              border: "none",
              color: "#002366",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {t("myBookings:header.back")}
          </button>
          <h1
            className="font-headline"
            style={{
              margin: 0,
              fontSize: 22,
              color: "#002366",
            }}
          >
            {t("myBookings:header.title")}
          </h1>
        </div>
        <button
          onClick={() => loadBookings(page)}
          disabled={loading}
          style={{
            padding: "8px 16px",
            background: "#002366",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: loading ? "not-allowed" : "pointer",
            fontSize: 13,
          }}
        >
          {loading ? t("myBookings:header.refreshing") : t("myBookings:header.refresh")}
        </button>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "flex-end",
            marginBottom: 24,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#64748b",
                marginBottom: 6,
              }}
            >
              {t("myBookings:filters.status")}
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 13,
                minWidth: 160,
              }}
            >
              {statusFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#64748b",
                marginBottom: 6,
              }}
            >
              {t("myBookings:filters.fromDate")}
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 13,
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#64748b",
                marginBottom: 6,
              }}
            >
              {t("myBookings:filters.toDate")}
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                fontSize: 13,
              }}
            />
          </div>
          {(statusFilter || fromDate || toDate) && (
            <button
              onClick={() => {
                setStatusFilter("");
                setFromDate("");
                setToDate("");
              }}
              style={{
                padding: "8px 14px",
                background: "transparent",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                color: "#64748b",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {t("myBookings:filters.clear")}
            </button>
          )}
        </div>

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
              onClick={() => navigate("/booking")}
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
            {bookings.map((b) => {
              const style = STATUS_STYLE[b.status] || STATUS_STYLE.pending;
              const pmtStyle = PAYMENT_STATUS_STYLE[b.payment_status] || PAYMENT_STATUS_STYLE.unpaid;
              const canCancel = ["pending", "confirmed"].includes(b.status);

              return (
                <div
                  className="my-booking-card"
                  key={b.id}
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
                  <div
                    className="my-booking-image"
                    style={{
                      minHeight: 120,
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={normalizeImageUrl(b.room_image)}
                      alt={b.room_name || "Room"}
                      onError={useFallbackImage}
                      style={{
                        width: "100%",
                        height: "100%",
                        minHeight: 120,
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                  <div style={{ padding: "20px 24px" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "capitalize",
                          color: style.color,
                          background: style.bg,
                        }}
                      >
                        {statusLabel[b.status] || b.status}
                      </span>
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>
                        #{String(b.id).padStart(4, "0")}
                      </span>
                      {b.payment_status && b.payment_status !== "unpaid" && (
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 20,
                            fontSize: 11,
                            fontWeight: 700,
                            color: pmtStyle.color,
                            background: pmtStyle.bg,
                          }}
                        >
                          {paymentStatusLabel[b.payment_status] || b.payment_status}
                        </span>
                      )}
                    </div>
                    <h3
                      style={{
                        margin: "0 0 6px",
                        color: "#002366",
                        fontSize: 18,
                      }}
                    >
                      {b.room_name}
                    </h3>
                    <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: 13 }}>
                      {b.room_type}
                      {b.room_capacity ? ` · ${t("myBookings:card.maxGuests", { count: b.room_capacity })}` : ""}
                    </p>
                    <p style={{ margin: 0, color: "#475569", fontSize: 14 }}>
                      {formatDate(b.check_in, lang)} → {formatDate(b.check_out, lang)}
                    </p>
                  </div>
                  <div
                    className="my-booking-actions"
                    style={{
                      padding: "20px 24px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      justifyContent: "center",
                      gap: 10,
                    }}
                  >
                    <strong style={{ color: "#C5A059", fontSize: 18 }}>
                      {formatMoney(b.total_price, lang)}
                    </strong>
                    <span style={{ color: "#94a3b8", fontSize: 11, textAlign: "right" }}>
                      {t("myBookings:card.totalLocked")}
                    </span>
                    <button
                      onClick={() => setSelectedBooking(b)}
                      style={{
                        padding: "8px 14px",
                        background: "#002366",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {t("myBookings:card.details")}
                    </button>
                    {b.status === "pending" && ["unpaid", "failed", undefined].includes(b.payment_status) && (
                      <button
                        onClick={() => {
                          setPayError("");
                          setPayingBooking(b);
                        }}
                        style={{
                          padding: "8px 14px",
                          background: "#C5A059",
                          color: "#000",
                          border: "none",
                          borderRadius: 6,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {t("myBookings:card.pay")}
                      </button>
                    )}
                    {canCancel && (
                      <button
                        onClick={() => requestCancel(b.id)}
                        disabled={cancellingId === b.id}
                        style={{
                          padding: "8px 14px",
                          background: "transparent",
                          color: "#dc2626",
                          border: "1px solid #fecaca",
                          borderRadius: 6,
                          cursor:
                            cancellingId === b.id ? "not-allowed" : "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {cancellingId === b.id ? t("myBookings:card.cancelling") : t("myBookings:card.cancelBooking")}
                      </button>
                    )}
                    {b.status === "completed" && (
                      submittedReviews[b.id] ? (
                        <div style={{ textAlign: "right" }}>
                          <StarRating value={submittedReviews[b.id].rating} size={13} />
                          <p style={{ margin: "4px 0 0", color: "#94a3b8", fontSize: 11 }}>
                            {t("myBookings:card.reviewed")}
                          </p>
                        </div>
                      ) : b.has_review ? (
                        <span style={{ color: "#94a3b8", fontSize: 11 }}>{t("myBookings:card.reviewed")}</span>
                      ) : (
                        <button
                          onClick={() => setReviewingBooking(b)}
                          style={{
                            padding: "8px 14px",
                            background: "transparent",
                            color: "#C5A059",
                            border: "1px solid #C5A059",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {t("myBookings:card.reviewThisRoom")}
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
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
              onClick={() => loadBookings(page - 1)}
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
              onClick={() => loadBookings(page + 1)}
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
        message={t("myBookings:cancelModal.message", { id: String(bookingToCancel).padStart(4, "0") })}
        confirmLabel={t("myBookings:cancelModal.confirmLabel")}
        cancelLabel={t("myBookings:cancelModal.cancelLabel")}
        tone="danger"
        loading={cancellingId === bookingToCancel}
        onConfirm={confirmCancel}
        onCancel={() => setBookingToCancel(null)}
      />

      {payingBooking && (
        <div
          onClick={() => !payingProvider && setPayingBooking(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 3200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 380,
              background: "#fff",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 24px 80px rgba(15,23,42,0.25)",
            }}
          >
            <h3 className="font-headline" style={{ margin: "0 0 6px", color: "#002366", fontSize: 20 }}>
              {t("myBookings:paymentModal.title")}
            </h3>
            <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 13 }}>
              {t("myBookings:paymentModal.summary", {
                id: String(payingBooking.id).padStart(4, "0"),
                amount: formatMoney(payingBooking.total_price, lang),
              })}
            </p>

            {payError && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  color: "#b91c1c",
                  fontSize: 12,
                  marginBottom: 16,
                  padding: "8px 10px",
                }}
              >
                {payError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => handlePayNow("vnpay")}
                disabled={payingProvider !== null}
                style={{
                  width: "100%",
                  padding: "14px",
                  border: "none",
                  background: "#002366",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: payingProvider !== null ? "not-allowed" : "pointer",
                  opacity: payingProvider !== null && payingProvider !== "vnpay" ? 0.5 : 1,
                  borderRadius: 6,
                }}
              >
                {payingProvider === "vnpay" ? t("myBookings:paymentModal.redirecting") : t("myBookings:paymentModal.payVnpay")}
              </button>

              {paymentProviders.includes("momo") && (
                <button
                  type="button"
                  onClick={() => handlePayNow("momo")}
                  disabled={payingProvider !== null}
                  style={{
                    width: "100%",
                    padding: "14px",
                    border: "none",
                    background: "#a50064",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: payingProvider !== null ? "not-allowed" : "pointer",
                    opacity: payingProvider !== null && payingProvider !== "momo" ? 0.5 : 1,
                    borderRadius: 6,
                  }}
                >
                  {payingProvider === "momo" ? t("myBookings:paymentModal.redirecting") : t("myBookings:paymentModal.payMomo")}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setPayingBooking(null)}
              disabled={payingProvider !== null}
              style={{
                width: "100%",
                padding: "10px",
                border: "1px solid #d1d5db",
                background: "transparent",
                color: "#6b7280",
                fontSize: 12,
                fontWeight: 600,
                cursor: payingProvider !== null ? "not-allowed" : "pointer",
                borderRadius: 6,
              }}
            >
              {t("myBookings:paymentModal.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewModal({ booking, toast, onClose, onSubmitted }) {
  const { t, i18n } = useTranslation("myBookings");
  const lang = i18n.language;
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rating) {
      setError(t("myBookings:errors.reviewRatingRequired"));
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await createReview(booking.room_id, {
        booking_id: booking.id,
        rating,
        comment: comment.trim() || undefined,
      });
      toast.success(res.message || t("myBookings:errors.reviewSuccess"));
      onSubmitted({ rating, comment: comment.trim() });
    } catch (err) {
      setError(err.response?.data?.message || t("myBookings:errors.reviewFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={() => !submitting && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.65)",
        zIndex: 3300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 24px 80px rgba(15,23,42,0.25)",
        }}
      >
        <h3 className="font-headline" style={{ margin: "0 0 6px", color: "#002366", fontSize: 20 }}>
          {t("myBookings:reviewModal.title", { roomName: booking.room_name })}
        </h3>
        <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 13 }}>
          {formatDate(booking.check_in, lang)} → {formatDate(booking.check_out, lang)}
        </p>

        <label
          style={{
            display: "block",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#64748b",
            marginBottom: 8,
            fontWeight: 700,
          }}
        >
          {t("myBookings:reviewModal.starsLabel")}
        </label>
        <div style={{ marginBottom: 20 }}>
          <StarRating value={rating} onChange={setRating} size={28} />
        </div>

        <label
          style={{
            display: "block",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#64748b",
            marginBottom: 8,
            fontWeight: 700,
          }}
        >
          {t("myBookings:reviewModal.commentLabel")}
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={t("myBookings:reviewModal.commentPlaceholder")}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 8,
            outline: "none",
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
            boxSizing: "border-box",
            marginBottom: 16,
          }}
        />

        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              color: "#b91c1c",
              fontSize: 12,
              marginBottom: 16,
              padding: "8px 10px",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "transparent",
              color: "#475569",
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            {t("myBookings:reviewModal.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: 8,
              border: "none",
              background: "#002366",
              color: "#fff",
              fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? t("myBookings:reviewModal.submitting") : t("myBookings:reviewModal.submit")}
          </button>
        </div>
      </form>
    </div>
  );
}

function BookingDetailModal({ booking, onClose }) {
  const { t, i18n } = useTranslation("myBookings");
  const lang = i18n.language;
  const statusLabel = getStatusLabel(t);
  const style = STATUS_STYLE[booking.status] || STATUS_STYLE.pending;
  const nights = calculateNights(booking.check_in, booking.check_out);
  const timeline = buildTimeline(booking, t);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.65)",
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="booking-detail-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 920,
          background: "#fff",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(15,23,42,0.35)",
        }}
      >
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: 12 }}>
              {t("myBookings:detailModal.bookingId", { id: String(booking.id).padStart(4, "0") })}
            </p>
            <h2 style={{ margin: 0, color: "#002366", fontSize: 22 }}>
              {t("myBookings:detailModal.title")}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "1px solid #e2e8f0",
              background: "#fff",
              cursor: "pointer",
              fontSize: 20,
              color: "#334155",
            }}
          >
            ×
          </button>
        </div>

        <div
          className="booking-detail-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "320px 1fr",
            gap: 0,
          }}
        >
          <div
            style={{
              minHeight: 280,
              overflow: "hidden",
            }}
          >
            <img
              src={normalizeImageUrl(booking.room_image)}
              alt={booking.room_name || "Room"}
              onError={useFallbackImage}
              style={{
                width: "100%",
                height: "100%",
                minHeight: 280,
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>

          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: "0 0 6px", color: "#002366", fontSize: 20 }}>
                  {booking.room_name || "-"}
                </h3>
                <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
                  {booking.room_type || "-"}
                  {booking.room_capacity ? ` · ${t("myBookings:card.maxGuests", { count: booking.room_capacity })}` : ""}
                </p>
              </div>
              <span
                style={{
                  alignSelf: "flex-start",
                  padding: "5px 12px",
                  borderRadius: 20,
                  color: style.color,
                  background: style.bg,
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {statusLabel[booking.status] || booking.status || statusLabel.pending}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <DetailItem label={t("myBookings:detailModal.checkIn")} value={formatDate(booking.check_in, lang)} />
              <DetailItem label={t("myBookings:detailModal.checkOut")} value={formatDate(booking.check_out, lang)} />
              <DetailItem label={t("myBookings:detailModal.nights")} value={t("myBookings:detailModal.nightsValue", { count: nights })} />
              <DetailItem label={t("myBookings:detailModal.guests")} value={t("myBookings:detailModal.guestsValue", { count: booking.guests || 1 })} />
              {booking.room_capacity && (
                <DetailItem label={t("myBookings:detailModal.roomCapacity")} value={t("myBookings:detailModal.roomCapacityValue", { count: booking.room_capacity })} />
              )}
              {booking.room_price !== undefined && booking.room_price !== null && (
                <DetailItem label={t("myBookings:detailModal.currentRoomPrice")} value={t("myBookings:detailModal.perNight", { amount: formatMoney(booking.room_price, lang) })} />
              )}
              <DetailItem label={t("myBookings:detailModal.createdAt")} value={formatDate(booking.created_at, lang)} />
              <DetailItem label={t("myBookings:detailModal.totalLocked")} value={formatMoney(booking.total_price, lang)} highlight />
              <DetailItem label={t("myBookings:detailModal.status")} value={statusLabel[booking.status] || booking.status || "-"} />
            </div>

            <div
              style={{
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ margin: "0 0 4px", color: "#002366", fontSize: 16 }}>
                  {t("myBookings:detailModal.timelineTitle")}
                </h3>
                <p style={{ margin: 0, color: "#64748b", fontSize: 12, lineHeight: 1.5 }}>
                  {t("myBookings:detailModal.timelineNote")}
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {timeline.map((item, index) => (
                  <div key={`${item.label}-${index}`} style={{ display: "flex", gap: 12 }}>
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: item.active ? "#002366" : "#cbd5e1",
                        marginTop: 4,
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <p style={{ margin: 0, color: item.active ? "#1e293b" : "#94a3b8", fontWeight: 700, fontSize: 13 }}>
                        {item.label}
                      </p>
                      <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: 12 }}>
                        {item.date ? formatDate(item.date, lang) : t("myBookings:detailModal.asOfCurrentStatus")}
                      </p>
                      {item.note && (
                        <p style={{ margin: "3px 0 0", color: "#94a3b8", fontSize: 12 }}>
                          {item.note}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, highlight = false }) {
  return (
    <div
      style={{
        background: highlight ? "#fffbeb" : "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <p style={{ margin: "0 0 5px", color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </p>
      <p style={{ margin: 0, color: highlight ? "#C5A059" : "#1e293b", fontWeight: 800, fontSize: 14 }}>
        {value}
      </p>
    </div>
  );
}
