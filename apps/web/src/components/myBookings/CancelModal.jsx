import { useTranslation } from "react-i18next";
import Dialog, { CloseIcon } from "../Dialog";
import { addDays, formatDate, formatMoney } from "../../utils/format";
import { bookingCode } from "../../pages/admin/orders/orderLabels";

const dateOf = (value) => String(value).slice(0, 10);

// "Cancel this booking?", with what comes back. The amounts follow the
// rules the API applies when it cancels: a paid booking inside the
// free-cancellation window is refunded in full (the property sends the money
// back and marks it refunded); a booking that was not paid has nothing to
// refund. Outside the window the card does not offer cancelling at all.
export default function CancelModal({ booking, policy, cancelling, onConfirm, onClose }) {
  const { t, i18n } = useTranslation("myBookings");
  const lang = i18n.language;
  const paid = booking.payment_status === "paid";
  const refund = paid ? Number(booking.total_price) : 0;
  const money = (amount) => formatMoney(amount, lang);
  const deadline = policy ? addDays(dateOf(booking.check_in), -(Number(policy.freeCancellationDays) || 0)) : null;
  const close = () => !cancelling && onClose();

  return (
    <Dialog onClose={close} aria-labelledby="cancel-title" data-testid="cancel-dialog">
      <div className="ui-dialog-head">
        <h2 id="cancel-title">{t("cancelModal.titleFor", { code: bookingCode(booking.id) })}</h2>
        <button type="button" className="ui-button ui-button--icon" aria-label={t("common:dialog.close")} onClick={close} disabled={cancelling}>
          <CloseIcon />
        </button>
      </div>

      <div className="ui-dialog-body">
        <p>
          {booking.room_name} · {formatDate(dateOf(booking.check_in), lang)} → {formatDate(dateOf(booking.check_out), lang)} · {t("detailModal.guestsValue", { count: booking.guests })}.{" "}
          {paid && deadline ? t("cancelModal.insideWindow", { date: formatDate(deadline, lang) }) : !paid ? t("cancelModal.notPaid") : ""}
        </p>

        <div className="refund-amount" data-testid="refund-amount">
          <span>{t("cancelModal.refundLabel")}</span>
          <b>{money(refund)}</b>
        </div>
        <dl className="refund-lines">
          <div><dt>{t("cancelModal.paidSoFar")}</dt><dd>{money(paid ? booking.total_price : 0)}</dd></div>
          <div><dt>{t("cancelModal.fee")}</dt><dd>{money(0)}</dd></div>
        </dl>
        <p className="checkout-help">{paid ? t("cancelModal.refundHow") : t("cancelModal.noRefundNeeded")} {t("cancelModal.irreversible")}</p>
      </div>

      <div className="ui-dialog-foot">
        <button type="button" className="ui-button ui-button--secondary" onClick={onClose} disabled={cancelling} data-autofocus>
          {t("cancelModal.keep")}
        </button>
        <button type="button" className="ui-button ui-button--danger" onClick={onConfirm} disabled={cancelling} data-testid="confirm-cancel">
          {cancelling ? t("card.cancelling") : refund > 0 ? t("cancelModal.confirmRefund", { amount: money(refund) }) : t("cancelModal.confirmLabel")}
        </button>
      </div>
    </Dialog>
  );
}
