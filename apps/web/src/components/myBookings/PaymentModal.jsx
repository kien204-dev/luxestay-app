import { useTranslation } from "react-i18next";
import { formatMoney } from "./helpers";

// Choose a gateway for a booking that still has to be paid.
export default function PaymentModal({ booking, providers, payingProvider, error, onPay, onClose }) {
  const { t, i18n } = useTranslation("myBookings");
  const lang = i18n.language;

  return (
    <div
      onClick={() => !payingProvider && onClose()}
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
            id: String(booking.id).padStart(4, "0"),
            amount: formatMoney(booking.total_price, lang),
          })}
        </p>

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

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => onPay("vnpay")}
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

          {providers.includes("momo") && (
            <button
              type="button"
              onClick={() => onPay("momo")}
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
          onClick={() => onClose()}
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
  );
}
