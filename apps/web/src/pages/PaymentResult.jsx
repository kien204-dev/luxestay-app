import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getPaymentByTransactionRef } from "../services/paymentService";
import { useProperty } from "../context/PropertyContext";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15;

// VNPay uses vnp_TxnRef, MoMo uses orderId — both are our own transaction_ref.
function extractTransactionRef(searchParams) {
  return searchParams.get("vnp_TxnRef") || searchParams.get("orderId") || "";
}

export default function PaymentResult() {
  const navigate = useNavigate();
  const { name: APP_NAME } = useProperty();
  const [searchParams] = useSearchParams();
  const transactionRef = extractTransactionRef(searchParams);

  const [payment, setPayment] = useState(null);
  const [bookingPaymentStatus, setBookingPaymentStatus] = useState(null);
  const [error, setError] = useState("");
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (!transactionRef) {
      return undefined;
    }

    let cancelled = false;
    let timeoutId;
    let attempts = 0;

    const poll = async () => {
      try {
        const res = await getPaymentByTransactionRef(transactionRef);
        if (cancelled) return;

        setPayment(res.data.payment);
        setBookingPaymentStatus(res.data.bookingPaymentStatus || null);

        if (res.data.payment.status === "pending" && attempts < MAX_POLLS) {
          attempts += 1;
          setPollCount(attempts);
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err.response?.data?.message || "Không thể tải thông tin giao dịch"
        );
      }
    };

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [transactionRef]);

  const missingRef = !transactionRef;
  const displayError = missingRef ? "Không tìm thấy thông tin giao dịch." : error;
  const stillPolling = payment?.status === "pending" && pollCount < MAX_POLLS;
  const timedOut = payment?.status === "pending" && pollCount >= MAX_POLLS;

  return (
    <div
      className="font-body"
      style={{
        minHeight: "100vh",
        background: "#fafafa",
        color: "#1A1C1E",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 24px 80px rgba(15,23,42,0.12)",
          padding: 40,
          textAlign: "center",
        }}
      >
        {displayError ? (
          <>
            <StatusIcon variant="error" />
            <h1 className="font-headline" style={{ color: "#002366", fontSize: 24, margin: "18px 0 8px" }}>
              Không thể xác nhận giao dịch
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              {displayError}
            </p>
          </>
        ) : !payment || stillPolling ? (
          <>
            <StatusIcon variant="pending" />
            <h1 className="font-headline" style={{ color: "#002366", fontSize: 24, margin: "18px 0 8px" }}>
              Đang xác nhận thanh toán...
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              Vui lòng đợi trong giây lát, chúng tôi đang xác thực giao dịch với ngân hàng/cổng thanh toán.
            </p>
          </>
        ) : payment.status === "success" && bookingPaymentStatus === "refund_pending" ? (
          // The money arrived after the booking had lapsed and the room had
          // gone to someone else: do not tell the guest they have a room.
          <>
            <StatusIcon variant="pending" />
            <h1 className="font-headline" style={{ color: "#002366", fontSize: 24, margin: "18px 0 8px" }}>
              Đã nhận thanh toán, nhưng phòng không còn trống
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              Đặt phòng #{payment.booking_id} đã hết thời gian giữ chỗ trước khi thanh toán hoàn tất và phòng đã
              được đặt bởi khách khác. Khoản thanh toán của bạn sẽ được hoàn lại; {APP_NAME} sẽ liên hệ với bạn.
            </p>
          </>
        ) : payment.status === "success" ? (
          <>
            <StatusIcon variant="success" />
            <h1 className="font-headline" style={{ color: "#002366", fontSize: 24, margin: "18px 0 8px" }}>
              Thanh toán thành công
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              Đặt phòng #{payment.booking_id} đã được xác nhận. Cảm ơn bạn đã đặt phòng tại {APP_NAME}.
            </p>
          </>
        ) : timedOut ? (
          <>
            <StatusIcon variant="pending" />
            <h1 className="font-headline" style={{ color: "#002366", fontSize: 24, margin: "18px 0 8px" }}>
              Vẫn đang chờ xác nhận
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              Giao dịch có thể mất thêm chút thời gian để xác nhận. Bạn có thể kiểm tra lại trạng thái trong "Đặt phòng của tôi".
            </p>
          </>
        ) : (
          <>
            <StatusIcon variant="error" />
            <h1 className="font-headline" style={{ color: "#002366", fontSize: 24, margin: "18px 0 8px" }}>
              Thanh toán không thành công
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
              Giao dịch đã bị hủy hoặc không thành công. Bạn có thể thử thanh toán lại từ trang "Đặt phòng của tôi".
            </p>
          </>
        )}

        <button
          type="button"
          onClick={() => navigate("/my-bookings")}
          style={{
            width: "100%",
            padding: "14px",
            border: "none",
            background: "#002366",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            borderRadius: 6,
          }}
        >
          Xem đặt phòng của tôi
        </button>
      </div>
    </div>
  );
}

function StatusIcon({ variant }) {
  const config = {
    success: { bg: "rgba(103,232,180,0.15)", color: "#059669", symbol: "✓" },
    error: { bg: "rgba(248,113,113,0.15)", color: "#dc2626", symbol: "×" },
    pending: { bg: "rgba(197,160,89,0.15)", color: "#C5A059", symbol: "…" },
  }[variant];

  return (
    <span
      style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: config.bg,
        color: config.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 30,
        fontWeight: 700,
        margin: "0 auto",
      }}
    >
      {config.symbol}
    </span>
  );
}
