import { useTranslation } from "react-i18next";
import Dialog, { CloseIcon } from "../../../components/Dialog";
import AxIcon from "../../../components/admin/AxIcon";
import BookingBadge from "../../../components/admin/BookingBadge";
import { EmptyState, Skel } from "../../../components/admin/ax";
import { initials } from "../../../layout/admin/AccountMenu";
import { useProperty } from "../../../context/PropertyContext";
import { getBooking } from "../../../services/bookingService";
import { apiErrorText } from "../../../utils/apiError";
import { bookingCode } from "../../../utils/bookingCode";
import { formatMoney, nightsBetween } from "../../../utils/format";
import { dayMonth, momentText, shortWeekday } from "../../../utils/adminFormat";
import { useAsyncData } from "../../../utils/useAsyncData";
import { STATUS_TRANSITIONS, canDelete, paymentActionFor } from "./orderLabels";

const time = (moment) => (moment ? new Date(moment).getTime() : 0);

// What happened to the booking, newest first, from what the database keeps:
// when it was made, every payment attempt, when it was cancelled and when
// the refund was confirmed. A payment taken at the desk has no time of its
// own.
function history(booking, t, lang) {
  const items = [];
  const atDesk = Boolean(booking.guest_name);
  items.push({
    key: "created",
    tone: booking.status === "pending" ? "warn" : "",
    at: booking.created_at,
    text: (
      <>
        <b>{t("history.created")}</b> {atDesk ? t("history.atDesk") : t("history.online")}
        {booking.status === "pending" && booking.expires_at && ` · ${t("history.heldUntil", { time: momentText(booking.expires_at, lang, false) })}`}
      </>
    ),
  });
  for (const payment of booking.payments || []) {
    const provider = t(`provider.${payment.provider}`, { defaultValue: payment.provider });
    items.push({
      key: `p${payment.transaction_ref}`,
      tone: payment.status === "success" ? "ok" : payment.status === "failed" ? "bad" : "",
      at: payment.status === "pending" ? payment.created_at : payment.updated_at,
      text: (
        <>
          <b>{t(`history.payment.${payment.status}`, { provider })}</b> · {formatMoney(payment.amount, lang)} · <span className="ax-code">{payment.transaction_ref}</span>
        </>
      ),
    });
  }
  const paidOnline = (booking.payments || []).some((payment) => payment.status === "success");
  if (!paidOnline && ["paid", "refund_pending", "refunded"].includes(booking.payment_status)) {
    items.push({ key: "desk", tone: "ok", at: null, text: <b>{t("history.paidDesk")}</b> });
  }
  if (booking.cancelled_at) {
    items.push({
      key: "cancelled",
      tone: "bad",
      at: booking.cancelled_at,
      text: (
        <>
          <b>{t("history.cancelled")}</b>
          {booking.refund_reason && ` · ${t(`refundReason.${booking.refund_reason}`)}`}
        </>
      ),
    });
  }
  if (booking.refunded_at) items.push({ key: "refunded", tone: "ok", at: booking.refunded_at, text: <b>{t("history.refunded")}</b> });
  // Newest first; the desk payment (no time) right after the booking was made.
  return items.sort((a, b) => (time(b.at) || time(booking.created_at) + 1) - (time(a.at) || time(booking.created_at) + 1));
}

function Body({ booking, today }) {
  const { t, i18n } = useTranslation("orders");
  const lang = i18n.language;
  const property = useProperty();
  const nights = nightsBetween(booking.check_in, booking.check_out);
  const total = Number(booking.total_price) || 0;
  const discount = Number(booking.discount_amount) || 0;
  const subtotal = total + discount;
  const perNight = nights ? subtotal / nights : subtotal;
  const email = booking.guest_email || (booking.guest_name ? "" : booking.user_email);
  const phone = booking.guest_phone || (booking.guest_name ? "" : booking.user_phone);
  const payment = booking.payment_status || "unpaid";
  const settledLabel = { paid: "pay.paid", refund_pending: "pay.owed", refunded: "pay.refunded" }[payment] || "pay.due";
  const via = booking.paid_via ? t(`provider.${booking.paid_via}`, { defaultValue: booking.paid_via }) : t("pay.desk");

  return (
    <>
      <div className="ax-chipset">
        <BookingBadge booking={booking} today={today} large />
        <span className={`ax-badge ax-badge--lg ax-badge--plain ${payment === "paid" ? "ax-badge--accent" : ""}`}>
          {payment === "paid" ? t("pay.paidVia", { via }) : t(`payment.${payment}`)}
        </span>
      </div>

      <section className="ax-dsec">
        <h3>{t("drawer.stay")}</h3>
        <dl className="ax-dl">
          <dt>{t("drawer.room")}</dt>
          <dd>{booking.room_name} · {booking.room_type}</dd>
          <dt>{t("drawer.checkIn")}</dt>
          <dd>{shortWeekday(booking.check_in)}, {dayMonth(booking.check_in, lang, true)} · {t("drawer.from", { time: property.checkInTime })}</dd>
          <dt>{t("drawer.checkOut")}</dt>
          <dd>{shortWeekday(booking.check_out)}, {dayMonth(booking.check_out, lang, true)} · {t("drawer.before", { time: property.checkOutTime })}</dd>
          <dt>{t("drawer.guests")}</dt>
          <dd>{t("drawer.guestCount", { count: booking.guests || 1 })} · {t("admin:card.nights", { count: nights })}</dd>
          <dt>{t("drawer.made")}</dt>
          <dd>{booking.created_at ? momentText(booking.created_at, lang) : "—"}</dd>
        </dl>
      </section>

      <section className="ax-dsec">
        <h3>{t("drawer.contact")}</h3>
        <dl className="ax-dl">
          <dt>{t("drawer.email")}</dt>
          <dd>{email ? <a href={`mailto:${email}`}>{email}</a> : "—"}</dd>
          <dt>{t("drawer.phone")}</dt>
          <dd>{phone ? <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>{phone}</a> : "—"}</dd>
          {booking.guest_name && (
            <>
              <dt>{t("drawer.channel")}</dt>
              <dd>{t("drawer.enteredBy", { name: booking.user_name })}</dd>
            </>
          )}
        </dl>
      </section>

      <section className="ax-dsec">
        <h3>{t("drawer.payment")}</h3>
        <div className="ax-lines">
          <div>
            <span>{t("pay.perNight", { price: formatMoney(perNight, lang), count: nights })}</span>
            <b>{formatMoney(subtotal, lang)}</b>
          </div>
          <div className={discount ? "is-disc" : ""}>
            <span>{booking.coupon_code ? t("pay.coupon", { code: booking.coupon_code }) : t("pay.discount")}</span>
            <b>{discount ? `−${formatMoney(discount, lang)}` : formatMoney(0, lang)}</b>
          </div>
        </div>
        <div className="ax-pay">
          <span>{t(settledLabel)}</span>
          <b data-testid="drawer-total">{formatMoney(total, lang)}</b>
        </div>
        {booking.paid_via && (
          <p className="ax-note">
            {t("pay.receipt", { via, ref: booking.paid_ref, time: booking.paid_at ? momentText(booking.paid_at, lang) : "" })}
          </p>
        )}
      </section>

      <section className="ax-dsec">
        <h3>{t("drawer.history")}</h3>
        <ul className="ax-history">
          {history(booking, t, lang).map((item) => (
            <li key={item.key} className={item.tone ? `is-${item.tone}` : ""}>
              <i aria-hidden="true" />
              <span>{item.text}</span>
              <time dateTime={item.at || undefined}>{item.at ? momentText(item.at, lang, false) : ""}</time>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// One booking, in a panel from the right (the whole screen on a phone):
// the stay, the guest's contact, the money and what happened, with the
// actions that apply to it. ‹ › step through the bookings of the list page.
export default function BookingDrawer({ id, version, today, siblings, onStep, onClose, onAction, busy }) {
  const { t } = useTranslation("orders");
  const { data: booking, loading, error, reload } = useAsyncData(`booking:${id}:${version}`, () => getBooking(id).then((res) => res.data));
  const shown = booking && booking.id === id ? booking : null;
  const index = siblings.indexOf(id);
  const action = shown ? paymentActionFor(shown) : null;
  const next = shown ? STATUS_TRANSITIONS[shown.status] || [] : [];

  return (
    <Dialog className="ax-drawer" onClose={() => !busy && onClose()} aria-labelledby="drawer-title" data-testid="booking-drawer">
      <div className="ax-drawer__head">
        <div className="ax-drawer__who">
          <span className="ax-avatar ax-avatar--lg" aria-hidden="true">{shown ? initials(shown.guest_name || shown.user_name) : ""}</span>
          <div>
            <div className="ax-eyebrow">
              {bookingCode(id)}
              {shown && ` · ${shown.guest_name ? t("channel.desk") : t("channel.online")}`}
            </div>
            <h2 id="drawer-title" tabIndex={-1} data-autofocus>{shown ? shown.guest_name || shown.user_name : t("drawer.loading")}</h2>
          </div>
        </div>
        <div className="ax-drawer__nav">
          <button type="button" className="ax-iconbtn" aria-label={t("drawer.previous")} disabled={index <= 0} onClick={() => onStep(siblings[index - 1])}>
            <AxIcon name="chevronLeft" />
          </button>
          <button type="button" className="ax-iconbtn" aria-label={t("drawer.next")} disabled={index < 0 || index >= siblings.length - 1} onClick={() => onStep(siblings[index + 1])}>
            <AxIcon name="chevronRight" />
          </button>
          <button type="button" className="ax-iconbtn" aria-label={t("common:dialog.close")} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="ax-drawer__body" aria-busy={loading}>
        {shown ? (
          <>
            <Body booking={shown} today={today} />
            <section className="ax-dsec ax-dsec--quiet">
              {canDelete(shown) ? (
                <button type="button" className="g-btn g-btn--link ax-danger-link" onClick={() => onAction("delete", shown)} disabled={busy}>
                  <AxIcon name="trash" small />
                  {t("drawer.delete")}
                </button>
              ) : (
                <p className="ax-note">{t("drawer.cannotDelete")}</p>
              )}
            </section>
          </>
        ) : error ? (
          <EmptyState error compact icon="alert" title={t("drawer.failed")} actions={<button type="button" className="g-btn g-btn--primary" onClick={reload}>{t("admin:retry")}</button>}>
            {apiErrorText(error, "admin:loadFailed")}
          </EmptyState>
        ) : (
          <div aria-hidden="true" className="ax-drawer__skel">
            <Skel height={28} width="60%" />
            <Skel height={180} />
            <Skel height={120} />
            <Skel height={160} />
          </div>
        )}
      </div>

      {shown && (
        <div className="ax-drawer__foot">
          {next.includes("cancelled") && (
            <button type="button" className="g-btn ax-btn-ghost-danger" onClick={() => onAction("cancel", shown)} disabled={busy}>
              {t("drawer.cancel")}
            </button>
          )}
          <span className="is-grow" />
          <button type="button" className="g-btn g-btn--outline" onClick={() => onAction("receipt", shown)} disabled={busy} data-testid="drawer-receipt">
            <AxIcon name="download" small />
            {t("drawer.receipt")}
          </button>
          {next.includes("confirmed") && (
            <button type="button" className="g-btn g-btn--outline" onClick={() => onAction("confirm", shown)} disabled={busy}>
              {t("drawer.confirm")}
            </button>
          )}
          {next.includes("completed") && (
            <button type="button" className={`g-btn ${action ? "g-btn--outline" : "g-btn--primary"}`} onClick={() => onAction("complete", shown)} disabled={busy}>
              {t("drawer.complete")}
            </button>
          )}
          {action && (
            <button type="button" className="g-btn g-btn--primary" onClick={() => onAction(action === "refund" ? "refund" : "collect", shown)} disabled={busy} data-testid="drawer-money">
              {t(`paymentAction.${action}`)}
            </button>
          )}
        </div>
      )}
    </Dialog>
  );
}
