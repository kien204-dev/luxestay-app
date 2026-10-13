import { useTranslation } from "react-i18next";
import Dialog, { CloseIcon } from "../../../components/Dialog";
import AxIcon from "../../../components/admin/AxIcon";
import { Skel } from "../../../components/admin/ax";
import { getBooking } from "../../../services/bookingService";
import { bookingCode } from "../../../utils/bookingCode";
import { formatMoney } from "../../../utils/format";
import { momentText, stayText } from "../../../utils/adminFormat";
import { useAsyncData } from "../../../utils/useAsyncData";

const guestName = (booking) => booking.guest_name || booking.user_name || "";

function DialogHead({ id, title, onClose, busy }) {
  const { t } = useTranslation("common");
  return (
    <div className="ui-dialog-head">
      <h2 id={id}>{title}</h2>
      <button type="button" className="ui-button ui-button--icon" aria-label={t("dialog.close")} onClick={onClose} disabled={busy}>
        <CloseIcon />
      </button>
    </div>
  );
}

// "Money taken at the desk": the booking's total is recorded as paid (and a
// booking still waiting for payment is confirmed). How it was paid is not
// recorded by the app.
export function CollectDialog({ booking, busy, onConfirm, onClose }) {
  const { t, i18n } = useTranslation("orders");
  const lang = i18n.language;
  const amount = formatMoney(booking.total_price, lang);
  const close = () => !busy && onClose();

  return (
    <Dialog className="ui-dialog ax-modal" onClose={close} aria-labelledby="collect-title" data-testid="collect-dialog">
      <DialogHead id="collect-title" title={t("collect.title")} onClose={close} busy={busy} />
      <div className="ui-dialog-body ax-modal__body">
        <p>
          {t("collect.booking")} <b className="ax-ink">{bookingCode(booking.id)}</b> · {guestName(booking)} · {booking.room_name} · {stayText(booking.check_in, booking.check_out, lang)}.{" "}
          {booking.status === "pending" ? (
            <>
              {t("collect.willConfirm")} <b className="ax-ok">{t("admin:state.confirmed")}</b>{t("collect.willConfirmEnd")}
            </>
          ) : (
            t("collect.stays")
          )}
        </p>
        <div className="ax-amount ax-amount--ink">
          <span>{t("collect.amount")}</span>
          <b data-testid="collect-amount">{amount}</b>
        </div>
        <p className="ax-note">{t("collect.howNote")}</p>
      </div>
      <div className="ui-dialog-foot">
        <button type="button" className="ui-button ui-button--secondary" onClick={close} disabled={busy} data-autofocus>
          {t("collect.cancel")}
        </button>
        <button type="button" className="ui-button ui-button--primary" onClick={onConfirm} disabled={busy} data-testid="collect-confirm">
          {busy ? t("common:dialog.working") : t("collect.confirm", { amount })}
        </button>
      </div>
    </Dialog>
  );
}

// "The refund has been sent": refunds are made by hand, outside the app, so
// this only records it. The amount owed back is what was actually received:
// the successful payments, or the booking's total when it was paid at the
// desk.
export function RefundDialog({ booking, busy, onConfirm, onClose }) {
  const { t, i18n } = useTranslation("orders");
  const lang = i18n.language;
  const close = () => !busy && onClose();
  const { data: full, error } = useAsyncData(`refund:${booking.id}`, () => getBooking(booking.id).then((res) => res.data));
  const received = (full?.payments || []).filter((payment) => payment.status === "success");
  const owed = received.length ? received.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) : Number(booking.total_price) || 0;
  const amount = formatMoney(owed, lang);
  const ready = Boolean(full) || Boolean(error);
  const cancelledAt = full?.cancelled_at;

  return (
    <Dialog className="ui-dialog ax-modal" onClose={close} aria-labelledby="refund-title" data-testid="refund-dialog">
      <DialogHead id="refund-title" title={t("refund.title", { code: bookingCode(booking.id) })} onClose={close} busy={busy} />
      <div className="ui-dialog-body ax-modal__body">
        <p>
          {guestName(booking)}
          {cancelledAt && ` · ${t("refund.cancelledAt", { time: momentText(cancelledAt, lang) })}`}
          {booking.refund_reason && ` — ${t(`refundReason.${booking.refund_reason}`)}`}
        </p>
        {!ready ? (
          <Skel height={72} />
        ) : (
          <>
            <div className="ax-amount">
              <span>{t("refund.owed")}</span>
              <b data-testid="refund-amount">{amount}</b>
            </div>
            <div className="ax-lines">
              {received.length ? (
                received.map((payment) => (
                  <div key={payment.transaction_ref}>
                    <span>{t("refund.paidVia", { provider: t(`provider.${payment.provider}`, { defaultValue: payment.provider }), ref: payment.transaction_ref })}</span>
                    <b>{formatMoney(payment.amount, lang)}</b>
                  </div>
                ))
              ) : (
                <div>
                  <span>{t("refund.paidDesk")}</span>
                  <b>{formatMoney(booking.total_price, lang)}</b>
                </div>
              )}
            </div>
          </>
        )}
        <div className="ax-alert ax-alert--warning">
          <AxIcon name="alert" />
          <p>{t("refund.manual", { amount })}</p>
        </div>
      </div>
      <div className="ui-dialog-foot">
        <button type="button" className="ui-button ui-button--secondary" onClick={close} disabled={busy} data-autofocus>
          {t("refund.later")}
        </button>
        <button type="button" className="ui-button ui-button--primary" onClick={onConfirm} disabled={busy || !ready} data-testid="refund-confirm">
          {busy ? t("common:dialog.working") : t("refund.confirm", { amount })}
        </button>
      </div>
    </Dialog>
  );
}
