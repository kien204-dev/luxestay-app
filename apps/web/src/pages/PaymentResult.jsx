import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DemoPaymentNote } from "../components/DemoBanner";
import { RoomImage } from "../components/guest/RoomCard";
import GuestIcon from "../components/guest/icons";
import { useToast } from "../context/ToastContext";
import { downloadBookingReceipt, getBooking } from "../services/bookingService";
import { createPayment, getPaymentByTransactionRef } from "../services/paymentService";
import { apiErrorText } from "../utils/apiError";
import { addDays, formatDate, formatMoney, nightsBetween } from "../utils/format";
import { placeholderFor } from "../utils/imageUrl";
import { useAsyncData } from "../utils/useAsyncData";
import { useBookingPolicy } from "../utils/useBookingPolicy";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { usePaymentProviders } from "../utils/usePaymentProviders";
import { bookingCode } from "../utils/bookingCode";
import "../styles/rooms.css";
import "../styles/booking.css";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15;
const PROVIDER_NAME = { vnpay: "VNPay", momo: "MoMo" };
// VNPay's result codes that have a plain reason (checkout:result.reasons).
const VNPAY_REASONS = new Set(["09", "10", "11", "12", "13", "24", "51", "65", "75", "79"]);

// VNPay uses vnp_TxnRef, MoMo uses orderId — both are our own transaction_ref.
function transactionRefOf(searchParams) {
  return searchParams.get("vnp_TxnRef") || searchParams.get("orderId") || "";
}

const dateOf = (value) => String(value).slice(0, 10);
const clockTime = (value, lang) =>
  new Date(value).toLocaleTimeString(lang === "en" ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit" });

// The booking in a card: photo, room, dates, and (when `lines`) the price.
function BookingSummary({ booking, lines = false, paidWith }) {
  const { t, i18n } = useTranslation("checkout");
  const policy = useBookingPolicy();
  const lang = i18n.language;
  const checkIn = dateOf(booking.check_in);
  const checkOut = dateOf(booking.check_out);
  const nights = nightsBetween(checkIn, checkOut);
  const discount = Number(booking.discount_amount || 0);
  const subtotal = Number(booking.total_price) + discount;
  const money = (amount) => formatMoney(amount, lang);
  const deadline = policy ? addDays(checkIn, -(Number(policy.freeCancellationDays) || 0)) : null;

  return (
    <div className="result-card" data-testid="result-booking">
      <div className="summary-room">
        <div className="guest-photo">
          <RoomImage src={booking.room_image} alt="" fallback={placeholderFor(booking.room_name || booking.room_id)} loading="eager" width={176} height={132} />
        </div>
        <div>
          <span className="room-location">{t("result.bookingCode", { code: bookingCode(booking.id) })}</span>
          <h2>{booking.room_name}</h2>
          <p>
            {formatDate(checkIn, lang)} → {formatDate(checkOut, lang)} · {t("nights", { count: nights })} · {t("site:search.guestsOption", { count: booking.guests })}
          </p>
        </div>
      </div>
      {lines && (
        <>
          <div className="summary-rows">
            <div><span>{t("site:booking.nightsLine", { count: nights, price: money(subtotal / Math.max(nights, 1)) })}</span><b>{money(subtotal)}</b></div>
            {discount > 0 && (
              <div className="is-discount"><span>{booking.coupon_code ? t("site:booking.discount", { code: booking.coupon_code }) : t("result.discount")}</span><b>−{money(discount)}</b></div>
            )}
            {paidWith && <div><span>{t("result.paidWith")}</span><b>{paidWith}</b></div>}
          </div>
          <div className="summary-total">
            <span>{Number(booking.total_price) > 0 ? t("result.paid") : t("site:booking.total")}</span>
            <b>{money(booking.total_price)}</b>
          </div>
          {deadline && policy && deadline >= policy.today && (
            <p className="booking-free summary-free">
              <GuestIcon.Check small />
              <span>{t("result.freeCancel", { date: formatDate(deadline, lang) })}</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Where the payment gateway sends the guest back (?vnp_TxnRef= / ?orderId=),
// and where a booking that needed no payment lands (?booking=). The
// gateway's own redirect is not trusted: the page asks the API (which only
// believes the gateway's signed server-to-server notice) until the payment
// is settled.
export default function PaymentResult() {
  const { t, i18n } = useTranslation("checkout");
  const lang = i18n.language;
  useDocumentTitle(t("site:payment.result.documentTitle"));
  const toast = useToast();
  const providers = usePaymentProviders();
  const [searchParams] = useSearchParams();
  const transactionRef = transactionRefOf(searchParams);
  const freeBookingId = transactionRef ? "" : searchParams.get("booking") || "";
  const [state, setState] = useState({ payment: null, bookingPaymentStatus: null, error: "", polls: 0 });
  const [paying, setPaying] = useState(null);
  const [payError, setPayError] = useState("");
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!transactionRef) return undefined;
    let cancelled = false;
    let timer;
    let attempts = 0;

    const poll = async () => {
      try {
        const res = await getPaymentByTransactionRef(transactionRef);
        if (cancelled) return;
        const { payment, bookingPaymentStatus } = res.data;
        const again = payment.status === "pending" && attempts < MAX_POLLS;
        if (again) attempts += 1;
        setState({ payment, bookingPaymentStatus: bookingPaymentStatus || null, error: "", polls: attempts });
        if (again) timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (!cancelled) setState((current) => ({ ...current, error: apiErrorText(err, "site:payment.result.loadFailed") }));
      }
    };
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [transactionRef]);

  const { payment, bookingPaymentStatus, error, polls } = state;
  const bookingId = payment?.booking_id || freeBookingId;
  // Read again once the payment settles, so the card shows the final state.
  const bookingQuery = useAsyncData(bookingId ? `result-booking:${bookingId}:${payment?.status || ""}` : null, () =>
    getBooking(bookingId).then((res) => res.data)
  );
  const booking = bookingQuery.data && String(bookingQuery.data.id) === String(bookingId) ? bookingQuery.data : null;
  const code = bookingId ? bookingCode(bookingId) : "";

  let view;
  if (freeBookingId) {
    if (bookingQuery.error) view = "unknown";
    else if (!booking) view = "checking";
    else view = booking.status === "confirmed" || booking.status === "completed" ? "success" : "unknown";
  } else if (!transactionRef || error) view = "unknown";
  else if (!payment || (payment.status === "pending" && polls < MAX_POLLS)) view = "checking";
  // The money came after the hold ran out and the room went to someone
  // else: do not tell the guest they have a room.
  else if (payment.status === "success" && bookingPaymentStatus === "refund_pending") view = "refund";
  else if (payment.status === "success") view = "success";
  else if (payment.status === "pending") view = "slow";
  else view = "failed";

  const holdUntil = booking?.status === "pending" && booking.expires_at ? clockTime(booking.expires_at, lang) : "";
  const canRetry = booking?.status === "pending" && ["unpaid", "pending", "failed"].includes(booking.payment_status);
  const providerName = PROVIDER_NAME[payment?.provider] || "";

  const pay = async (provider) => {
    setPayError("");
    setPaying(provider);
    try {
      const res = await createPayment(bookingId, provider);
      window.location.assign(res.data.payUrl);
    } catch (err) {
      setPayError(apiErrorText(err, "checkout:errors.paymentFailed"));
      setPaying(null);
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      await downloadBookingReceipt(bookingId, lang);
    } catch {
      toast.error(t("myBookings:card.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  const toMyBookings = (
    <Link to="/my-bookings" className="g-btn g-btn--primary result-main-action">{t("site:payment.result.toMyBookings")}</Link>
  );

  return (
    <div className="guest-container result-page">
      {(view === "checking" || view === "slow") && (
        <section className="result" role="status" aria-live="polite" data-testid={`payment-result-${view}`}>
          <div className="result-mark is-waiting"><span className="result-spinner" aria-hidden="true" /></div>
          <p className="guest-eyebrow">{t("result.checking.eyebrow")}</p>
          <h1>{view === "slow" ? t("site:payment.result.slow.title") : providerName ? t("result.checking.titleWith", { method: providerName }) : t("site:payment.result.checking.title")}</h1>
          <p className="result-lead">{view === "slow" ? t("site:payment.result.slow.text") : t("result.checking.text")}</p>
          {view === "checking" && transactionRef && (
            <>
              <p className="result-warning"><GuestIcon.Alert small />{t("result.checking.stay")}</p>
              {/* What has really happened so far, and what is still to come. */}
              <ol className="result-steps">
                <li className="is-done">{t("result.checking.created", { code })}</li>
                <li className="is-done">{t("result.checking.returned")}</li>
                <li className="is-now">{t("result.checking.waiting")}</li>
                <li>{t("result.checking.confirm")}</li>
              </ol>
            </>
          )}
          {booking && (
            <p className="checkout-help">
              {t("result.amount", { amount: formatMoney(payment?.amount ?? booking.total_price, lang) })}
              {holdUntil && ` · ${t("result.heldUntil", { time: holdUntil })}`}
            </p>
          )}
          {view === "slow" && <div className="result-actions">{toMyBookings}</div>}
        </section>
      )}

      {view === "success" && (
        <section className="result" data-testid="payment-result-success">
          <div className="result-mark is-good"><GuestIcon.Check /></div>
          <p className="guest-eyebrow">{freeBookingId ? t("result.success.eyebrowFree") : t("result.success.eyebrow")}</p>
          <h1>{t("result.success.title")}</h1>
          <p className="result-lead">{t("site:payment.result.success.text", { code })}</p>
          <div className="result-code"><span>{t("result.codeLabel")}</span><b data-testid="result-code">{code}</b></div>
          {booking && (
            <BookingSummary
              booking={booking}
              lines
              paidWith={payment ? `${providerName} · ${new Date(payment.updated_at).toLocaleString(lang === "en" ? "en-US" : "vi-VN", { dateStyle: "short", timeStyle: "short" })}` : ""}
            />
          )}
          <div className="result-actions">
            {toMyBookings}
            <button type="button" className="g-btn g-btn--outline result-main-action" onClick={download} disabled={downloading}>
              <GuestIcon.Download />
              {t("myBookings:card.downloadReceipt")}
            </button>
          </div>
        </section>
      )}

      {view === "failed" && (
        <section className="result" role="alert" data-testid="payment-result-failed">
          <div className="result-mark is-bad"><GuestIcon.Close /></div>
          <p className="guest-eyebrow is-bad">{t("site:payment.result.failed.title")}</p>
          <h1>{t("result.failed.title")}</h1>
          <p className="result-lead">
            {canRetry && holdUntil ? t("result.failed.textHeld", { time: holdUntil }) : canRetry ? t("result.failed.textRetry") : t("result.failed.textGone")}
          </p>
          {payment.gatewayCode && (
            <p className="checkout-alert result-reason" data-testid="result-reason">
              <GuestIcon.Alert />
              <span>
                {payment.provider === "vnpay" && VNPAY_REASONS.has(payment.gatewayCode)
                  ? t(`result.reasons.vnpay.${payment.gatewayCode}`)
                  : t("result.reasons.other")}{" "}
                {t("result.reasonCode", { method: providerName, code: payment.gatewayCode })}
              </span>
            </p>
          )}
          {booking && <BookingSummary booking={booking} />}
          <DemoPaymentNote />
          {payError && <p className="g-alert" role="alert">{payError}</p>}
          <div className="result-actions">
            {canRetry &&
              // The same method first, then any other one that is switched on.
              [payment.provider, ...providers.filter((provider) => provider !== payment.provider)]
                .filter((provider) => providers.includes(provider))
                .map((provider, index) => (
                  <button
                    key={provider}
                    type="button"
                    className={`g-btn ${index === 0 ? "g-btn--primary" : "g-btn--outline"} result-main-action`}
                    onClick={() => pay(provider)}
                    disabled={paying !== null}
                    data-testid={`retry-${provider}`}
                  >
                    {index === 0 && <GuestIcon.Retry />}
                    {paying === provider
                      ? t("site:payment.redirecting")
                      : index === 0
                        ? t("result.failed.retry", { method: PROVIDER_NAME[provider] || provider })
                        : t("result.failed.other", { method: PROVIDER_NAME[provider] || provider })}
                  </button>
                ))}
            <Link to="/my-bookings" className={`g-btn ${canRetry ? "g-btn--link" : "g-btn--primary result-main-action"}`}>{t("site:payment.result.toMyBookings")}</Link>
          </div>
        </section>
      )}

      {view === "refund" && (
        <section className="result" data-testid="payment-result-refund">
          <div className="result-mark is-waiting"><GuestIcon.Alert /></div>
          <h1>{t("site:payment.result.refund.title")}</h1>
          <p className="result-lead">{t("site:payment.result.refund.text", { code })}</p>
          <div className="result-actions">{toMyBookings}</div>
        </section>
      )}

      {view === "unknown" && (
        <section className="result" role="alert" data-testid="payment-result-unknown">
          <div className="result-mark is-bad"><GuestIcon.Alert /></div>
          <h1>{t("site:payment.result.unknown.title")}</h1>
          <p className="result-lead">{error || (transactionRef || freeBookingId ? t("site:payment.result.unknown.text") : t("site:payment.result.missingRef"))}</p>
          <div className="result-actions">{toMyBookings}</div>
        </section>
      )}
    </div>
  );
}
