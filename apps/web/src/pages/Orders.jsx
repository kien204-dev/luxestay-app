import { useEffect, useMemo, useState } from "react";
import { useAsyncData } from "../utils/useAsyncData";
import {
  getBookings,
  updateBooking,
  deleteBooking,
  markBookingPaid,
  confirmRefund,
  getBookingSummary,
  downloadBookingReceipt,
} from "../services/bookingService";
import WalkInBookingModal from "../components/orders/WalkInBookingModal";
import { listReviews, setReviewHidden } from "../services/reviewService";
import { useToast } from "../context/ToastContext";
import { useBookingNotifications } from "../context/BookingNotificationsContext";
import Icon from "../utils/icon";
import useIsMobile from "../utils/useIsMobile";
import ConfirmModal from "../components/ConfirmModal";
import StarRating from "../components/StarRating";

const REVIEWS_PAGE_SIZE = 20;
// One shared empty list, so "no data yet" does not look like new data to useMemo.
const EMPTY_LIST = [];
const ORDERS_PAGE_SIZE = 20;

const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const statusStyle = {
  confirmed: { color: "var(--color-success)", bg: "rgba(103,232,180,0.12)" },
  pending: { color: "var(--color-warning)", bg: "rgba(251,191,36,0.12)" },
  cancelled: { color: "var(--color-danger)", bg: "rgba(248,113,113,0.12)" },
  completed: { color: "var(--color-info)", bg: "rgba(125,211,252,0.12)" },
};

const PANEL_STYLE = {
  background: "var(--color-navy-800)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
};

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("vi-VN") + " đ";
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("vi-VN");
}

const PAYMENT_LABEL = {
  unpaid: "Chưa thanh toán",
  pending: "Đang thanh toán",
  paid: "Đã thanh toán",
  failed: "Thanh toán lỗi",
  refund_pending: "Chờ hoàn tiền",
  refunded: "Đã hoàn tiền",
};

const PAYMENT_COLOR = {
  unpaid: "var(--color-text-muted)",
  pending: "var(--color-warning)",
  paid: "var(--color-success)",
  failed: "var(--color-danger)",
  refund_pending: "var(--color-warning)",
  refunded: "var(--color-text-muted)",
};

const REFUND_REASON_LABEL = {
  cancelled_by_guest: "Khách hủy sau khi đã thanh toán",
  cancelled_by_admin: "Quản trị hủy sau khi đã thanh toán",
  paid_after_cancellation: "Tiền về sau khi booking đã hủy/hết hạn, phòng không còn trống",
};

function canMarkPaid(order) {
  return (
    ["pending", "confirmed", "completed"].includes(order.status) &&
    ["unpaid", "pending", "failed"].includes(order.payment_status || "unpaid")
  );
}

// Payment state of one booking plus the one money action that applies to it:
// record a desk payment, or confirm a refund has been sent.
function OrderPayment({ order, busyId, onAction }) {
  const paymentStatus = order.payment_status || "unpaid";
  const busy = busyId === order.id;
  const action =
    paymentStatus === "refund_pending"
      ? { type: "refund", label: "Xác nhận hoàn tiền" }
      : canMarkPaid(order)
        ? { type: "mark-paid", label: "Đã thu tiền" }
        : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      <span
        title={REFUND_REASON_LABEL[order.refund_reason] || undefined}
        style={{ fontSize: 12, fontWeight: 700, color: PAYMENT_COLOR[paymentStatus] }}
      >
        {PAYMENT_LABEL[paymentStatus] || paymentStatus}
      </span>
      {paymentStatus === "refund_pending" && REFUND_REASON_LABEL[order.refund_reason] && (
        <span style={{ fontSize: 11, color: "var(--color-text-muted)", maxWidth: 220 }}>
          {REFUND_REASON_LABEL[order.refund_reason]}
        </span>
      )}
      {action && (
        <button
          onClick={() => onAction({ id: order.id, type: action.type })}
          disabled={busy}
          style={{
            background: "transparent",
            color: "var(--color-gold-400)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 700,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "..." : action.label}
        </button>
      )}
    </div>
  );
}

function OrderStatusSelect({ order, updatingId, onChange, fullWidth = false }) {
  const style = statusStyle[order.status] || statusStyle.pending;
  const nextOptions = STATUS_TRANSITIONS[order.status] || [];
  const selectableOptions = [order.status, ...nextOptions];
  const isTerminal = nextOptions.length === 0;

  return (
    <select
      value={order.status}
      disabled={updatingId === order.id || isTerminal}
      title={isTerminal ? "Trạng thái này không thể thay đổi thêm" : undefined}
      onChange={(e) => onChange(order.id, e.target.value)}
      style={{
        width: fullWidth ? "100%" : undefined,
        padding: "5px 10px",
        borderRadius: 20,
        color: style.color,
        background: style.bg,
        fontSize: 12,
        fontWeight: 700,
        border: "none",
        textTransform: "capitalize",
        cursor: isTerminal ? "not-allowed" : "pointer",
        opacity: isTerminal ? 0.7 : 1,
      }}
    >
      {selectableOptions.map((s) => (
        <option key={s} value={s} style={{ color: "#000", textTransform: "capitalize" }}>
          {s}
        </option>
      ))}
    </select>
  );
}

function Orders() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const { clearNewBookingCount } = useBookingNotifications();
  // The list is loaded one page at a time; the totals above it come from
  // their own request, so neither needs every booking in the browser.
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const bookingsQuery = useAsyncData(`orders:${page}:${statusFilter}:${paymentFilter}`, () =>
    getBookings({
      page,
      limit: ORDERS_PAGE_SIZE,
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(paymentFilter ? { payment_status: paymentFilter } : {}),
    }).then((res) => res.data)
  );
  const summaryQuery = useAsyncData("orders-summary", getBookingSummary);
  const summary = summaryQuery.data;
  const bookings = bookingsQuery.data?.data || EMPTY_LIST;
  const totalPages = bookingsQuery.data?.totalPages ?? 1;
  const totalMatching = bookingsQuery.data?.total ?? 0;
  const loading = bookingsQuery.loading;
  const error = bookingsQuery.error ? bookingsQuery.error.response?.data?.message || "Không tải được danh sách đơn đặt phòng" : "";
  const loadBookings = () => {
    bookingsQuery.reload();
    summaryQuery.reload();
  };
  // Accepts a new list or an updater, like a state setter; edits the rows of
  // the page currently shown.
  const setBookings = (update) =>
    bookingsQuery.setData((current) =>
      current
        ? { ...current, data: typeof update === "function" ? update(current.data) : update }
        : current
    );

  const changeFilter = (apply) => {
    apply();
    setPage(1);
  };

  const handleDownload = async (id) => {
    setDownloadingId(id);
    try {
      await downloadBookingReceipt(id);
    } catch (err) {
      toast.error(err.response?.data?.message || "Không tải được phiếu xác nhận");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleWalkInCreated = (booking) => {
    setWalkInOpen(false);
    toast.success(`Đã tạo đặt phòng #BK-${String(booking.id).padStart(4, "0")}`);
    setPage(1);
    loadBookings();
  };
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [bookingToDelete, setBookingToDelete] = useState(null);
  const [paymentAction, setPaymentAction] = useState(null);
  const [paymentBusyId, setPaymentBusyId] = useState(null);

  const [reviewsPage, setReviewsPage] = useState(1);
  const reviewsQuery = useAsyncData(`reviews:${reviewsPage}`, () =>
    listReviews({ page: reviewsPage, limit: REVIEWS_PAGE_SIZE })
  );
  const reviews = reviewsQuery.data?.data || EMPTY_LIST;
  const reviewsLoading = reviewsQuery.loading;
  const reviewsError = reviewsQuery.error ? reviewsQuery.error.response?.data?.message || "Không tải được danh sách đánh giá" : "";
  const reviewsTotalPages = reviewsQuery.data?.pagination?.totalPages ?? 1;
  const setReviews = (update) =>
    reviewsQuery.setData((current) => (current ? { ...current, data: update(current.data) } : current));
  const [roomNameFilter, setRoomNameFilter] = useState("");
  const [togglingReviewId, setTogglingReviewId] = useState(null);
  const [reviewToToggle, setReviewToToggle] = useState(null);

  // Simplest "seen" model this feature commits to: opening Orders at all
  // counts as catching up, no per-booking read tracking.
  useEffect(() => {
    clearNewBookingCount();
  }, [clearNewBookingCount]);

  const visibleReviews = useMemo(() => {
    const needle = roomNameFilter.trim().toLowerCase();
    if (!needle) return reviews;
    return reviews.filter((r) => (r.room_name || "").toLowerCase().includes(needle));
  }, [reviews, roomNameFilter]);

  const requestToggleReview = (review) =>
    setReviewToToggle({ ...review, nextHidden: !review.is_hidden });

  const confirmToggleReview = async () => {
    const target = reviewToToggle;
    if (!target) return;

    setTogglingReviewId(target.id);
    try {
      await setReviewHidden(target.id, target.nextHidden);
      setReviews((list) =>
        list.map((r) => (r.id === target.id ? { ...r, is_hidden: target.nextHidden } : r))
      );
      toast.success(target.nextHidden ? "Đã ẩn đánh giá" : "Đã hiện lại đánh giá");
      setReviewToToggle(null);
    } catch (err) {
      toast.error(err.response?.data?.message || "Thao tác thất bại, vui lòng thử lại");
    } finally {
      setTogglingReviewId(null);
    }
  };

  const cards = [
    { label: "Đã thu", value: summary ? formatMoney(summary.revenue) : "—" },
    { label: "Chờ thanh toán", value: summary ? summary.pending : "—" },
    { label: "Chờ hoàn tiền", value: summary ? summary.refundPending : "—" },
    { label: "Tổng số đơn", value: summary ? summary.total : "—" },
  ];

  const handleStatusChange = async (id, newStatus) => {
    const prev = bookings;
    setUpdatingId(id);
    setBookings((list) =>
      list.map((b) => (b.id === id ? { ...b, status: newStatus } : b))
    );

    try {
      const res = await updateBooking(id, newStatus);
      // The server may have changed more than the status (cancelling a paid
      // booking turns it into a pending refund).
      const saved = res.data?.booking;
      if (saved) {
        setBookings((list) =>
          list.map((b) =>
            b.id === id
              ? { ...b, status: saved.status, payment_status: saved.payment_status, refund_reason: saved.refund_reason }
              : b
          )
        );
      }
      toast.success(
        saved?.payment_status === "refund_pending"
          ? "Đã hủy đơn. Đơn này đã thanh toán nên cần hoàn tiền cho khách."
          : "Đã cập nhật trạng thái đơn đặt phòng"
      );
      summaryQuery.reload();
    } catch (err) {
      setBookings(prev);
      toast.error(
        err.response?.data?.message ||
          "Cập nhật trạng thái thất bại, vui lòng thử lại"
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmPaymentAction = async () => {
    if (!paymentAction) return;
    const { id, type } = paymentAction;

    setPaymentBusyId(id);
    try {
      const res = type === "refund" ? await confirmRefund(id) : await markBookingPaid(id);
      const saved = res.data.booking;
      setBookings((list) =>
        list.map((b) =>
          b.id === id ? { ...b, status: saved.status, payment_status: saved.payment_status } : b
        )
      );
      toast.success(res.data.message);
      setPaymentAction(null);
      summaryQuery.reload();
    } catch (err) {
      toast.error(err.response?.data?.message || "Thao tác thất bại, vui lòng thử lại");
    } finally {
      setPaymentBusyId(null);
    }
  };

  const requestDelete = (id) => setBookingToDelete(id);

  const confirmDelete = async () => {
    const id = bookingToDelete;
    if (id == null) return;

    setDeletingId(id);
    try {
      await deleteBooking(id);
      setBookings((list) => list.filter((b) => b.id !== id));
      toast.success("Đã xóa đơn đặt phòng");
      setBookingToDelete(null);
      loadBookings();
    } catch (err) {
      toast.error(err.response?.data?.message || "Xóa đơn đặt phòng thất bại");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <header
        style={{
          marginBottom: 28,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-serif)",
              fontSize: 28,
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Active Orders
          </h1>
          <p style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
            Manage hotel bookings and customer orders.
          </p>
        </div>
        <button
          onClick={loadBookings}
          disabled={loading}
          style={{
            background: "var(--color-gold-100)",
            color: "var(--color-gold-400)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: "10px 16px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          <Icon.Refresh />
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 20,
          marginBottom: 28,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              ...PANEL_STYLE,
              padding: 24,
            }}
          >
            <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: 14 }}>
              {card.label}
            </p>
            {loading ? (
              <div className="luxe-skeleton" style={{ height: 28, width: "60%", marginTop: 10 }} />
            ) : (
              <h2 style={{ color: "var(--color-text-primary)", fontSize: 28, margin: "10px 0 0" }}>
                {card.value}
              </h2>
            )}
          </div>
        ))}
      </div>

      <div style={{ ...PANEL_STYLE, overflow: "hidden" }}>
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--color-border-soft)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, color: "var(--color-text-primary)" }}>
            Order List
            <span style={{ color: "var(--color-text-muted)", fontSize: 13, fontWeight: 400, marginLeft: 10 }}>
              {totalMatching} đơn
            </span>
          </h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              aria-label="Lọc theo trạng thái"
              value={statusFilter}
              onChange={(e) => changeFilter(() => setStatusFilter(e.target.value))}
              style={filterSelectStyle}
            >
              <option value="">Mọi trạng thái</option>
              <option value="pending">Chờ thanh toán</option>
              <option value="confirmed">Đã xác nhận</option>
              <option value="completed">Hoàn tất</option>
              <option value="cancelled">Đã hủy</option>
            </select>
            <select
              aria-label="Lọc theo thanh toán"
              value={paymentFilter}
              onChange={(e) => changeFilter(() => setPaymentFilter(e.target.value))}
              style={filterSelectStyle}
            >
              <option value="">Mọi thanh toán</option>
              {Object.entries(PAYMENT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button type="button" onClick={() => setWalkInOpen(true)} style={primaryActionStyle}>
              + Đặt phòng tại quầy
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: "16px 22px", color: "var(--color-danger)", fontSize: 14 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 22 }} aria-busy="true" aria-label="Loading orders">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0" }}>
                <div className="luxe-skeleton" style={{ height: 14, width: "14%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "18%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "18%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "12%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "12%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "10%" }} />
              </div>
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <div style={{ padding: "56px 22px", textAlign: "center" }}>
            <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
              Chưa có đơn đặt phòng nào.
            </p>
          </div>
        ) : isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16 }}>
            {bookings.map((order) => (
              <div
                key={order.id}
                style={{
                  border: "1px solid var(--color-border-soft)",
                  borderRadius: "var(--radius-md)",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>
                    #BK-{String(order.id).padStart(4, "0")}
                  </span>
                  <OrderStatusSelect order={order} updatingId={updatingId} onChange={handleStatusChange} />
                </div>

                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  {order.guest_name || order.user_name}
                  <span style={{ color: "var(--color-text-muted)" }}>
                    {" · "}
                    {order.guest_name
                      ? [order.guest_phone, order.guest_email, "tại quầy"].filter(Boolean).join(" · ")
                      : order.user_email}
                  </span>
                </div>

                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  {order.room_name}
                  <span style={{ color: "var(--color-text-muted)" }}> · {order.room_type}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-muted)" }}>
                  <span>{formatDate(order.check_in)} → {formatDate(order.check_out)}</span>
                  <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
                    {formatMoney(order.total_price)}
                  </span>
                </div>

                <OrderPayment order={order} busyId={paymentBusyId} onAction={setPaymentAction} />

                <button
                  onClick={() => handleDownload(order.id)}
                  disabled={downloadingId === order.id}
                  style={pdfButtonStyle}
                >
                  {downloadingId === order.id ? "..." : "Tải phiếu PDF"}
                </button>

                <button
                  onClick={() => requestDelete(order.id)}
                  disabled={deletingId === order.id}
                  style={{
                    marginTop: 4,
                    background: "rgba(248,113,113,0.12)",
                    color: "var(--color-danger)",
                    border: "1px solid rgba(248,113,113,0.3)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: deletingId === order.id ? "not-allowed" : "pointer",
                  }}
                >
                  {deletingId === order.id ? "Đang xóa..." : "Xóa đơn"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {[
                    "Order ID",
                    "Customer",
                    "Room",
                    "Check-in",
                    "Check-out",
                    "Status",
                    "Amount",
                    "",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "14px 18px",
                        textAlign: "left",
                        color: "var(--color-text-muted)",
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        borderBottom: "1px solid var(--color-border-soft)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {bookings.map((order) => {
                  return (
                    <tr key={order.id}>
                      <td style={tdStyle}>#BK-{String(order.id).padStart(4, "0")}</td>
                      <td style={tdStyle}>
                        <div>{order.guest_name || order.user_name}</div>
                        <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                          {order.guest_name
                            ? [order.guest_phone, order.guest_email, "tại quầy"].filter(Boolean).join(" · ")
                            : order.user_email}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <div>{order.room_name}</div>
                        <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                          {order.room_type}
                        </div>
                      </td>
                      <td style={tdStyle}>{formatDate(order.check_in)}</td>
                      <td style={tdStyle}>{formatDate(order.check_out)}</td>
                      <td style={tdStyle}>
                        <OrderStatusSelect
                          order={order}
                          updatingId={updatingId}
                          onChange={handleStatusChange}
                        />
                      </td>
                      <td style={tdStyle}>
                        <div style={{ marginBottom: 6 }}>{formatMoney(order.total_price)}</div>
                        <OrderPayment order={order} busyId={paymentBusyId} onAction={setPaymentAction} />
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => handleDownload(order.id)}
                          disabled={downloadingId === order.id}
                          data-testid="order-receipt"
                          style={{ ...pdfButtonStyle, marginRight: 8 }}
                        >
                          {downloadingId === order.id ? "..." : "PDF"}
                        </button>
                        <button
                          onClick={() => requestDelete(order.id)}
                          disabled={deletingId === order.id}
                          style={{
                            background: "rgba(248,113,113,0.12)",
                            color: "var(--color-danger)",
                            border: "1px solid rgba(248,113,113,0.3)",
                            borderRadius: 8,
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor:
                              deletingId === order.id ? "not-allowed" : "pointer",
                          }}
                        >
                          {deletingId === order.id ? "..." : "Xóa"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 16,
              padding: "18px 22px",
              borderTop: "1px solid var(--color-border-soft)",
            }}
          >
            <button onClick={() => setPage(page - 1)} disabled={page <= 1 || loading} style={pagerButtonStyle}>
              ← Trước
            </button>
            <span style={{ color: "var(--color-text-muted)", fontSize: 13 }} data-testid="orders-page">
              Trang {page} / {totalPages}
            </span>
            <button onClick={() => setPage(page + 1)} disabled={page >= totalPages || loading} style={pagerButtonStyle}>
              Sau →
            </button>
          </div>
        )}
      </div>

      <div style={{ ...PANEL_STYLE, overflow: "hidden", marginTop: 28 }}>
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--color-border-soft)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, color: "var(--color-text-primary)" }}>Room Reviews</h2>
          <input
            type="text"
            value={roomNameFilter}
            onChange={(e) => setRoomNameFilter(e.target.value)}
            placeholder="Lọc theo tên phòng..."
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--color-border-soft)",
              background: "var(--color-navy-900)",
              color: "var(--color-text-primary)",
              fontSize: 13,
              minWidth: 220,
            }}
          />
        </div>

        {reviewsError && (
          <div style={{ padding: "16px 22px", color: "var(--color-danger)", fontSize: 14 }}>
            {reviewsError}
          </div>
        )}

        {reviewsLoading ? (
          <div style={{ padding: 22 }} aria-busy="true" aria-label="Loading reviews">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0" }}>
                <div className="luxe-skeleton" style={{ height: 14, width: "18%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "18%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "10%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "30%" }} />
                <div className="luxe-skeleton" style={{ height: 14, width: "10%" }} />
              </div>
            ))}
          </div>
        ) : visibleReviews.length === 0 ? (
          <div style={{ padding: "56px 22px", textAlign: "center" }}>
            <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
              {roomNameFilter ? "Không có đánh giá nào khớp với bộ lọc." : "Chưa có đánh giá nào."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Phòng", "Người đánh giá", "Sao", "Bình luận", "Ngày", "Trạng thái", ""].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "14px 18px",
                        textAlign: "left",
                        color: "var(--color-text-muted)",
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        borderBottom: "1px solid var(--color-border-soft)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleReviews.map((review) => (
                  <tr key={review.id}>
                    <td style={tdStyle}>{review.room_name}</td>
                    <td style={tdStyle}>
                      <div>{review.user_name}</div>
                      <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                        {review.user_email}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <StarRating value={review.rating} size={14} />
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 260 }}>
                      {review.comment || (
                        <span style={{ color: "var(--color-text-muted)" }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>{formatDate(review.created_at)}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 700,
                          color: review.is_hidden ? "var(--color-danger)" : "var(--color-success)",
                          background: review.is_hidden
                            ? "rgba(248,113,113,0.12)"
                            : "rgba(103,232,180,0.12)",
                        }}
                      >
                        {review.is_hidden ? "Đã ẩn" : "Hiển thị"}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => requestToggleReview(review)}
                        disabled={togglingReviewId === review.id}
                        style={{
                          background: review.is_hidden
                            ? "rgba(103,232,180,0.12)"
                            : "rgba(248,113,113,0.12)",
                          color: review.is_hidden ? "var(--color-success)" : "var(--color-danger)",
                          border: `1px solid ${review.is_hidden ? "rgba(103,232,180,0.3)" : "rgba(248,113,113,0.3)"}`,
                          borderRadius: 8,
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: togglingReviewId === review.id ? "not-allowed" : "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {togglingReviewId === review.id ? "..." : review.is_hidden ? "Hiện lại" : "Ẩn"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!reviewsLoading && reviewsTotalPages > 1 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 16,
              padding: "18px 22px",
              borderTop: "1px solid var(--color-border-soft)",
            }}
          >
            <button
              onClick={() => setReviewsPage(reviewsPage - 1)}
              disabled={reviewsPage <= 1}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid var(--color-border-soft)",
                background: "transparent",
                color: reviewsPage <= 1 ? "var(--color-text-muted)" : "var(--color-text-primary)",
                cursor: reviewsPage <= 1 ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              ← Trước
            </button>
            <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
              Trang {reviewsPage} / {reviewsTotalPages}
            </span>
            <button
              onClick={() => setReviewsPage(reviewsPage + 1)}
              disabled={reviewsPage >= reviewsTotalPages}
              style={{
                padding: "8px 16px",
                borderRadius: 6,
                border: "1px solid var(--color-border-soft)",
                background: "transparent",
                color:
                  reviewsPage >= reviewsTotalPages
                    ? "var(--color-text-muted)"
                    : "var(--color-text-primary)",
                cursor: reviewsPage >= reviewsTotalPages ? "not-allowed" : "pointer",
                fontSize: 13,
              }}
            >
              Sau →
            </button>
          </div>
        )}
      </div>

      {walkInOpen && (
        <WalkInBookingModal onClose={() => setWalkInOpen(false)} onCreated={handleWalkInCreated} />
      )}

      <ConfirmModal
        open={bookingToDelete != null}
        title="Xóa đơn đặt phòng"
        message={`Bạn có chắc muốn xóa đơn #BK-${String(bookingToDelete).padStart(4, "0")}? Hành động này không thể hoàn tác.`}
        confirmLabel="Xóa đơn"
        tone="danger"
        loading={deletingId === bookingToDelete}
        onConfirm={confirmDelete}
        onCancel={() => setBookingToDelete(null)}
      />

      <ConfirmModal
        open={paymentAction != null}
        title={paymentAction?.type === "refund" ? "Xác nhận hoàn tiền" : "Ghi nhận đã thu tiền"}
        message={
          paymentAction?.type === "refund"
            ? `Xác nhận bạn ĐÃ chuyển tiền hoàn lại cho khách của đơn #BK-${String(paymentAction?.id).padStart(4, "0")}? Ứng dụng không tự chuyển tiền.`
            : `Xác nhận đã thu đủ tiền (tiền mặt/chuyển khoản) cho đơn #BK-${String(paymentAction?.id).padStart(4, "0")}? Đơn đang chờ sẽ được xác nhận.`
        }
        confirmLabel={paymentAction?.type === "refund" ? "Đã hoàn tiền" : "Đã thu tiền"}
        loading={paymentBusyId != null}
        onConfirm={confirmPaymentAction}
        onCancel={() => setPaymentAction(null)}
      />

      <ConfirmModal
        open={reviewToToggle != null}
        title={reviewToToggle?.nextHidden ? "Ẩn đánh giá" : "Hiện lại đánh giá"}
        message={
          reviewToToggle?.nextHidden
            ? "Bạn có chắc muốn ẩn đánh giá này? Đánh giá sẽ không hiển thị công khai cho đến khi được hiện lại."
            : "Bạn có chắc muốn hiện lại đánh giá này cho khách xem công khai?"
        }
        confirmLabel={reviewToToggle?.nextHidden ? "Ẩn đánh giá" : "Hiện lại"}
        tone={reviewToToggle?.nextHidden ? "danger" : "default"}
        loading={togglingReviewId === reviewToToggle?.id}
        onConfirm={confirmToggleReview}
        onCancel={() => setReviewToToggle(null)}
      />
    </div>
  );
}

const filterSelectStyle = {
  background: "var(--color-navy-950)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
};

const primaryActionStyle = {
  background: "linear-gradient(135deg, var(--color-gold-400), var(--color-gold-500))",
  color: "var(--color-navy-950)",
  border: "none",
  borderRadius: 8,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const pdfButtonStyle = {
  background: "transparent",
  color: "var(--color-gold-400)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const pagerButtonStyle = {
  padding: "8px 16px",
  borderRadius: 6,
  border: "1px solid var(--color-border-soft)",
  background: "transparent",
  color: "var(--color-text-primary)",
  cursor: "pointer",
  fontSize: 13,
};

const tdStyle = {
  padding: "16px 18px",
  borderBottom: "1px solid var(--color-border-soft)",
  color: "var(--color-text-primary)",
  fontSize: 14,
};

export default Orders;
