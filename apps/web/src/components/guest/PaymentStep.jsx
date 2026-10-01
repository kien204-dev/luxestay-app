import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createPayment } from "../../services/paymentService";
import { usePaymentProviders } from "../../utils/usePaymentProviders";
import { formatDate, formatMoney } from "../../utils/format";
import CancellationPolicy from "./CancellationPolicy";

const PROVIDER_LABEL_KEY = { vnpay: "payment.payVnpay", momo: "payment.payMomo" };

// Shown right after a booking is created: what was reserved, the rules, and
// the ways to pay now (or later from "My bookings").
export default function PaymentStep({ booking, policy }) {
  const { t, i18n } = useTranslation("site");
  const navigate = useNavigate();
  const providers = usePaymentProviders();
  const [paying, setPaying] = useState(null);
  const [error, setError] = useState("");
  const lang = i18n.language;
  const checkIn = String(booking.check_in).slice(0, 10);
  const checkOut = String(booking.check_out).slice(0, 10);

  const handlePay = async (provider) => {
    setError("");
    setPaying(provider);
    try {
      const res = await createPayment(booking.id, provider);
      window.location.assign(res.data.payUrl);
    } catch (err) {
      setError(err.response?.data?.message || t("payment.initFailed"));
      setPaying(null);
    }
  };

  return (
    <>
      <div>
        <span className="guest-eyebrow">{t("payment.created")}</span>
        <h2 style={{ fontSize: 24, marginTop: 6 }}>{t("payment.title")}</h2>
      </div>

      <p className="guest-muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
        {t("payment.notice", { id: booking.id })}
      </p>

      <div className="booking-summary">
        <div>
          <span>{t("payment.stay")}</span>
          <span>{formatDate(checkIn, lang)} → {formatDate(checkOut, lang)}</span>
        </div>
        <div className="booking-total">
          <span>{t("payment.total")}</span>
          <span>{formatMoney(booking.total_price, lang)}</span>
        </div>
      </div>

      <CancellationPolicy policy={policy} checkIn={checkIn} />

      {error && <div className="g-alert" role="alert">{error}</div>}

      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          className={`g-btn g-btn--block ${provider === "vnpay" ? "g-btn--primary" : "g-btn--outline"}`}
          disabled={paying !== null}
          onClick={() => handlePay(provider)}
        >
          {paying === provider ? t("payment.redirecting") : t(PROVIDER_LABEL_KEY[provider] || "payment.pay")}
        </button>
      ))}

      <button
        type="button"
        className="g-btn g-btn--block"
        style={{ background: "transparent", color: "var(--g-muted)" }}
        disabled={paying !== null}
        onClick={() => navigate("/my-bookings")}
      >
        {t("payment.payLater")}
      </button>
    </>
  );
}
