import { useTranslation } from "react-i18next";
import Dialog, { CloseIcon } from "../Dialog";
import { DemoPaymentNote } from "../DemoBanner";
import { formatMoney } from "../../utils/format";
import { bookingCode } from "../../utils/bookingCode";

const LABEL_KEY = { vnpay: "paymentModal.payVnpay", momo: "paymentModal.payMomo" };

// Choose a gateway for a booking that still has to be paid. Only the
// gateways the API has switched on are offered.
export default function PaymentModal({ booking, providers, payingProvider, error, onPay, onClose }) {
  const { t, i18n } = useTranslation("myBookings");
  const close = () => !payingProvider && onClose();

  return (
    <Dialog onClose={close} aria-labelledby="payment-title" data-testid="payment-dialog">
      <div className="ui-dialog-head">
        <h2 id="payment-title">{t("paymentModal.title")}</h2>
        <button type="button" className="ui-button ui-button--icon" aria-label={t("common:dialog.close")} onClick={close} disabled={Boolean(payingProvider)}>
          <CloseIcon />
        </button>
      </div>

      <div className="ui-dialog-body payment-choice">
        <p>{t("paymentModal.summaryCode", { code: bookingCode(booking.id), amount: formatMoney(booking.total_price, i18n.language) })}</p>
        <DemoPaymentNote />
        {error && <p className="g-alert" role="alert">{error}</p>}
        {providers.map((provider, index) => (
          <button
            key={provider}
            type="button"
            className={`ui-button ${index === 0 ? "ui-button--primary" : "ui-button--secondary"}`}
            disabled={Boolean(payingProvider)}
            onClick={() => onPay(provider)}
          >
            {payingProvider === provider ? t("paymentModal.redirecting") : t(LABEL_KEY[provider] || "card.pay")}
          </button>
        ))}
      </div>

      <div className="ui-dialog-foot">
        <button type="button" className="ui-button ui-button--secondary" onClick={onClose} disabled={Boolean(payingProvider)} data-autofocus>
          {t("paymentModal.cancel")}
        </button>
      </div>
    </Dialog>
  );
}
