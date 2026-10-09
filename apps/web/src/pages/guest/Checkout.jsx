import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Dialog, { CloseIcon } from "../../components/Dialog";
import { DemoPaymentNote } from "../../components/DemoBanner";
import AvailabilityCalendar from "../../components/guest/AvailabilityCalendar";
import { RoomImage } from "../../components/guest/RoomCard";
import StateMessage from "../../components/guest/StateMessage";
import GuestIcon from "../../components/guest/icons";
import { useAuth } from "../../context/AuthContext";
import { createBooking, getBooking } from "../../services/bookingService";
import { validateCoupon } from "../../services/couponService";
import { createPayment } from "../../services/paymentService";
import { getRoomAvailability, getRoomById } from "../../services/roomService";
import { apiErrorText } from "../../utils/apiError";
import { localDateString } from "../../utils/date";
import { addDays, formatDate, formatMoney, nightsBetween } from "../../utils/format";
import { placeholderFor } from "../../utils/imageUrl";
import { readStay, stayQuery, writeStay } from "../../utils/stayQuery";
import { useAsyncData } from "../../utils/useAsyncData";
import { useBookingPolicy } from "../../utils/useBookingPolicy";
import { useDocumentTitle } from "../../utils/useDocumentTitle";
import useIsMobile from "../../utils/useIsMobile";
import { usePaymentProviders } from "../../utils/usePaymentProviders";
import "../../styles/rooms.css";
import "../../styles/booking.css";

// The checkout: five steps from the dates to the payment. Nothing is
// reserved while the guest goes through them; the booking is created (and
// the room held, see PENDING_BOOKING_TTL_MINUTES) by the last button, which
// then hands over to the payment gateway. All the rules are the API's:
// price, coupon, availability and the hold are decided there, this page only
// shows them.
//
// Where things are kept, so that going back or reloading loses nothing:
//   - the stay (dates, guests) and the current step: in the address;
//   - the coupon code, the agreement, the payment method and, once it
//     exists, the booking's id: in sessionStorage, per room.
const STEPS = ["dates", "coupon", "policy", "payment", "confirm"];
const PROVIDER_NAME = { vnpay: "VNPay", momo: "MoMo" };

const draftKey = (roomId) => `luxestay_checkout_${roomId}`;

function loadDraft(roomId) {
  try {
    return JSON.parse(window.sessionStorage.getItem(draftKey(roomId))) || {};
  } catch {
    return {};
  }
}

function saveDraft(roomId, draft) {
  try {
    if (draft) window.sessionStorage.setItem(draftKey(roomId), JSON.stringify(draft));
    else window.sessionStorage.removeItem(draftKey(roomId));
  } catch {
    // Storage unavailable: the draft lasts until the page is reloaded.
  }
}

// A booking the guest can still pay for here.
const isPayable = (booking) =>
  booking.status === "pending" && ["unpaid", "pending", "failed"].includes(booking.payment_status);

const dateOf = (value) => String(value).slice(0, 10);

function longDate(dateStr, lang) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-US" : "vi-VN", {
    timeZone: "UTC",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function clockTime(value, lang) {
  return new Date(value).toLocaleTimeString(lang === "en" ? "en-US" : "vi-VN", { hour: "2-digit", minute: "2-digit" });
}

// One step's frame: title, "step n of 5", content, and the buttons under it.
function Step({ index, title, note, children, footer }) {
  const { t } = useTranslation("checkout");
  return (
    <section className="checkout-step" aria-labelledby={`checkout-step-${index}`} data-testid={`checkout-step-${STEPS[index]}`}>
      <div className="checkout-step-head">
        <h2 id={`checkout-step-${index}`}>{title}</h2>
        <span>{[t("stepOf", { step: index + 1, total: STEPS.length }), note].filter(Boolean).join(" · ")}</span>
      </div>
      <div className="checkout-step-body">{children}</div>
      <div className="checkout-step-foot">{footer}</div>
    </section>
  );
}

export default function Checkout() {
  const { id } = useParams();
  const { t, i18n } = useTranslation("checkout");
  const lang = i18n.language;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const policy = useBookingPolicy();
  const providers = usePaymentProviders();
  const isMobile = useIsMobile();
  useDocumentTitle(t("documentTitle"));

  const [draft, setDraftState] = useState(() => loadDraft(id));
  const [couponInput, setCouponInput] = useState(draft.couponCode || "");
  const [created, setCreated] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [couponRefused, setCouponRefused] = useState("");
  const [soldOut, setSoldOut] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const patchDraft = (changes) => {
    const next = { ...draft, ...changes };
    setDraftState(next);
    saveDraft(id, next);
  };

  const roomQuery = useAsyncData(`room:${id}`, () => getRoomById(id));
  const room = roomQuery.data && String(roomQuery.data.id) === String(id) ? roomQuery.data : null;

  // A booking made in an earlier visit to this page (the guest came back
  // from the gateway, or reloaded): picked up again if it can still be paid.
  const heldQuery = useAsyncData(draft.bookingId && !created ? `held:${draft.bookingId}` : null, () =>
    getBooking(draft.bookingId).then((res) => res.data)
  );
  const restored = heldQuery.data && String(heldQuery.data.id) === String(draft.bookingId) ? heldQuery.data : null;
  const booking = created || (restored && isPayable(restored) ? restored : null);
  // It was there, but is settled, cancelled or has run out since.
  const staleBooking = !created && draft.bookingId && (heldQuery.error || (restored && !isPayable(restored))) ? restored || {} : null;

  const urlStay = readStay(searchParams);
  const stay = booking
    ? { checkIn: dateOf(booking.check_in), checkOut: dateOf(booking.check_out), guests: booking.guests }
    : urlStay;
  const { checkIn, checkOut } = stay;
  const capacity = Number(room?.capacity) || 1;
  const guests = Math.min(Math.max(Number(stay.guests) || 1, 1), capacity);
  const today = policy?.today || localDateString();
  const nights = nightsBetween(checkIn, checkOut);
  const subtotal = booking
    ? Number(booking.total_price) + Number(booking.discount_amount || 0)
    : nights * Number(room?.price || 0);

  // Any of the chosen nights already taken? The server decides for real when
  // the booking is created; this stops the guest before the last step.
  const rangeKey = !booking && room && nights > 0 && checkIn >= today ? `range:${room.id}:${checkIn}:${checkOut}` : null;
  const rangeQuery = useAsyncData(rangeKey, () => getRoomAvailability(room.id, { from: checkIn, to: checkOut }));
  const range = rangeQuery.data && rangeQuery.data.from === checkIn && rangeQuery.data.to === checkOut ? rangeQuery.data : null;
  const rangeTaken = Boolean(rangeKey && range && range.unavailable.length > 0);

  // The coupon is checked by the API for this exact amount, and again
  // whenever the amount changes; the booking itself re-checks it and takes
  // the usage slot.
  const couponCode = booking ? booking.coupon_code || (Number(booking.discount_amount) > 0 ? draft.couponCode : "") : draft.couponCode || "";
  const couponKey = !booking && couponCode && subtotal > 0 ? `coupon:${couponCode}:${subtotal}` : null;
  const couponQuery = useAsyncData(couponKey, () => validateCoupon(couponCode, subtotal));
  const couponChecking = Boolean(couponKey) && couponQuery.loading;
  const coupon = couponKey && !couponQuery.loading && couponQuery.data ? couponQuery.data : null;
  const couponError = couponRefused || (couponKey && couponQuery.error ? apiErrorText(couponQuery.error, "checkout:coupon.invalid") : "");

  const discount = booking ? Number(booking.discount_amount || 0) : coupon ? coupon.discountAmount : 0;
  const total = booking ? Number(booking.total_price) : coupon ? coupon.finalAmount : subtotal;
  const updatingPrice = couponChecking || Boolean(rangeKey && rangeQuery.loading);
  const free = subtotal > 0 && total === 0;

  const method = providers.includes(draft.method) ? draft.method : providers.length === 1 ? providers[0] : "";
  const freeDays = Number(policy?.freeCancellationDays) || 0;
  const deadline = nights > 0 ? addDays(checkIn, -freeDays) : null;
  const windowOpen = Boolean(deadline && deadline >= today);

  // How far the guest may go: each step needs the ones before it.
  const datesOk = nights > 0 && (booking || (checkIn >= today && !rangeTaken));
  const reachable = !datesOk ? 0 : !draft.agreed && !booking ? 2 : !free && !method ? 3 : 4;
  const requested = Math.max(0, STEPS.indexOf(searchParams.get("step")));
  // With the booking made, only the payment is left to change.
  const stepIndex = booking ? Math.max(3, Math.min(requested, 4)) : Math.min(requested, reachable);

  const goTo = (step, stayChanges) => {
    const params = writeStay(stayChanges ? { ...urlStay, ...stayChanges } : urlStay);
    if (step !== STEPS[0]) params.set("step", step);
    setSearchParams(params);
    setError("");
    window.scrollTo({ top: 0 });
  };
  const next = () => goTo(STEPS[stepIndex + 1]);
  const back = () => goTo(STEPS[stepIndex - 1]);
  const setStay = (changes) => {
    setSoldOut(false);
    setSearchParams(writeStay({ ...urlStay, guests, ...changes }), { replace: true });
  };

  const applyCoupon = (event) => {
    event.preventDefault();
    setCouponRefused("");
    patchDraft({ couponCode: couponInput.trim().toUpperCase() });
  };
  const removeCoupon = () => {
    setCouponInput("");
    setCouponRefused("");
    patchDraft({ couponCode: "" });
  };

  // The last button. Creates the booking once (a second press, after a
  // payment that could not be started, reuses it), then starts the payment.
  const submit = async () => {
    setSubmitting(true);
    setError("");
    let current = booking;
    try {
      if (!current) {
        const res = await createBooking({
          room_id: room.id,
          check_in: checkIn,
          check_out: checkOut,
          guests,
          ...(coupon ? { coupon_code: couponCode } : {}),
        });
        current = res.data.booking;

        // Nothing left to pay (fully discounted): already confirmed.
        if (current.status === "confirmed") {
          saveDraft(id, null);
          navigate(`/payment/result?booking=${current.id}`);
          return;
        }
        setCreated(current);
        patchDraft({ bookingId: current.id });
      }

      const res = await createPayment(current.id, method);
      window.location.assign(res.data.payUrl);
    } catch (err) {
      const code = err.response?.data?.code || "";
      if (!current && code === "ROOM_NOT_AVAILABLE") {
        setSoldOut(true);
        // What this page knew about these nights is out of date.
        rangeQuery.reload();
      } else if (!current && code.startsWith("COUPON_")) {
        setCouponRefused(apiErrorText(err, "checkout:coupon.invalid"));
        goTo("coupon");
      } else {
        setError(apiErrorText(err, current ? "checkout:errors.paymentFailed" : "checkout:errors.bookingFailed"));
      }
      setSubmitting(false);
    }
  };

  // ------------------------------------------------------------ page states
  if (!room) {
    const notFound = [400, 404].includes(roomQuery.error?.response?.status);
    if (roomQuery.loading) {
      return (
        <div className="guest-container checkout-page" aria-busy="true" data-testid="checkout-loading">
          <span className="sr-only" role="status">{t("loading")}</span>
          <span className="luxe-skeleton-light" style={{ height: 52, width: 360, maxWidth: "80%", margin: "48px 0 24px" }} />
          <div className="checkout-grid">
            <span className="luxe-skeleton-light" style={{ height: 420 }} />
            <span className="luxe-skeleton-light" style={{ height: 360 }} />
          </div>
        </div>
      );
    }
    return (
      <div className="guest-container checkout-page room-page--message">
        <StateMessage error={!notFound} heading="h1" title={notFound ? t("site:detail.notFound") : t("site:detail.errorTitle")} text={notFound ? t("site:detail.notFoundText") : t("site:detail.errorText")}>
          {!notFound && (
            <button type="button" className="g-btn g-btn--primary" onClick={roomQuery.reload}>
              <GuestIcon.Retry />
              {t("site:list.retry")}
            </button>
          )}
          <Link to="/rooms" className="g-btn g-btn--outline">{t("site:detail.backToRooms")}</Link>
        </StateMessage>
      </div>
    );
  }

  const roomPath = `/rooms/${room.id}${stayQuery({ checkIn, checkOut, guests })}`;
  const money = (amount) => formatMoney(amount, lang);
  const datesText = nights > 0 ? `${formatDate(checkIn, lang)} → ${formatDate(checkOut, lang)}` : t("dates.notChosen");
  const guestsText = t("site:search.guestsOption", { count: guests });
  const methodName = PROVIDER_NAME[method] || "";

  // What each finished step settled, for the lines above the current step.
  const done = [
    [datesText, t("nights", { count: nights }), guestsText].join(" · "),
    couponCode && (coupon || booking) ? `${couponCode} · −${money(discount)}` : t("coupon.none"),
    windowOpen ? t("policy.doneFree", { date: formatDate(deadline, lang) }) : t("policy.doneAgreed"),
    free ? t("payment.nothingToPay") : methodName,
  ];
  const titles = STEPS.map((step) => t(`steps.${step}`));

  const summaryRows = (
    <>
      <div className="summary-rows">
        <div><span>{t("summary.dates")}</span><b>{datesText}</b></div>
        <div><span>{t("summary.nights")}</span><b>{nights > 0 ? t("nights", { count: nights }) : "—"}</b></div>
        <div><span>{t("summary.guests")}</span><b>{guestsText}</b></div>
      </div>
      {updatingPrice ? (
        <div className="summary-rows" data-testid="summary-updating">
          <span className="luxe-skeleton-light" style={{ height: 12 }} />
          <span className="luxe-skeleton-light" style={{ height: 12, width: "70%" }} />
          <p className="summary-updating" role="status">{t("summary.updating")}</p>
        </div>
      ) : (
        nights > 0 && (
          <>
            <div className="summary-rows">
              <div><span>{t("site:booking.nightsLine", { count: nights, price: money(subtotal / nights) })}</span><b>{money(subtotal)}</b></div>
              {discount > 0 && (
                <div className="is-discount"><span>{t("site:booking.discount", { code: couponCode })}</span><b>−{money(discount)}</b></div>
              )}
            </div>
            <div className="summary-total">
              <span>{t("site:booking.total")}</span>
              <b data-testid="checkout-total">{money(total)}</b>
            </div>
            {windowOpen && (
              <p className="booking-free summary-free">
                <GuestIcon.Check small />
                <span>{t("site:booking.freeUntil", { date: formatDate(deadline, lang) })}</span>
              </p>
            )}
          </>
        )
      )}
    </>
  );

  const calendar = (
    <AvailabilityCalendar key={room.id} roomId={room.id} checkIn={checkIn} checkOut={checkOut} onSelect={(dates) => setStay(dates)} />
  );

  return (
    <div className="guest-container checkout-page" data-testid="checkout-page" data-step={STEPS[stepIndex]}>
      <div className="checkout-top">
        <div className="page-head page-head--tight">
          <ol className="crumbs">
            <li><Link to="/rooms">{t("site:nav.rooms")}</Link></li>
            <li><Link to={roomPath}>{room.room_name}</Link></li>
            <li aria-current="page">{t("crumb")}</li>
          </ol>
          <h1>{t("title")}</h1>
        </div>
        {booking?.expires_at && (
          <p className="checkout-hold" data-testid="checkout-hold">
            <GuestIcon.Clock small />
            {t("heldUntil", { time: clockTime(booking.expires_at, lang) })}
          </p>
        )}
      </div>

      <ol className="checkout-stepper" aria-label={t("stepsLabel")}>
        {titles.map((title, index) => (
          <li key={STEPS[index]} className={index < stepIndex ? "is-done" : index === stepIndex ? "is-current" : ""} aria-current={index === stepIndex ? "step" : undefined}>
            <span>{t("stepNumber", { step: index + 1 })}</span>
            <b>{title}</b>
          </li>
        ))}
      </ol>

      {/* Phones: the summary folds into one line that opens. */}
      <details className="checkout-summary-mobile">
        <summary>
          <span><b>{room.room_name}</b>{nights > 0 ? ` · ${t("nights", { count: nights })}` : ""}</span>
          <span>{nights > 0 && !updatingPrice ? money(total) : "…"}</span>
        </summary>
        {summaryRows}
      </details>

      {soldOut && (
        <div className="checkout-alert" role="alert" data-testid="checkout-sold-out">
          <GuestIcon.Alert />
          <div>
            <p><b>{t("soldOut.title", { room: room.room_name, dates: datesText })}</b> {t("soldOut.text")}</p>
            <div className="checkout-alert-actions">
              <button type="button" className="g-btn g-btn--primary" onClick={() => { setSoldOut(false); goTo("dates"); }}>
                {t("soldOut.otherDates")}
              </button>
              <Link className="g-btn g-btn--outline" to={`/rooms${stayQuery({ checkIn, checkOut, guests })}`}>{t("soldOut.otherRooms")}</Link>
            </div>
          </div>
        </div>
      )}

      {staleBooking && (
        <div className="checkout-alert checkout-alert--info" role="status" data-testid="checkout-stale">
          <GuestIcon.Alert />
          <div>
            <p>{staleBooking.payment_status === "paid" ? t("stale.paid") : t("stale.gone")}</p>
            <div className="checkout-alert-actions">
              <Link className="g-btn g-btn--primary" to="/my-bookings">{t("stale.toMyBookings")}</Link>
              <button type="button" className="g-btn g-btn--outline" onClick={() => patchDraft({ bookingId: null })}>{t("stale.startOver")}</button>
            </div>
          </div>
        </div>
      )}

      <div className="checkout-grid">
        <div>
          {done.slice(0, stepIndex).map((value, index) => (
            <div key={STEPS[index]} className="checkout-done">
              <GuestIcon.Check />
              <div><b>{titles[index]}</b><span>{value}</span></div>
              {/* Once the booking exists its dates, coupon and terms are fixed. */}
              {!(booking && index < 3) && (
                <button type="button" className="g-btn g-btn--link" onClick={() => goTo(STEPS[index])} aria-label={t("editStep", { step: titles[index] })}>
                  {t("edit")}
                </button>
              )}
            </div>
          ))}

          {stepIndex === 0 && (
            <Step
              index={0}
              title={t("dates.title")}
              footer={
                <>
                  <Link className="g-btn g-btn--ghost" to={roomPath}>{t("dates.backToRoom")}</Link>
                  <button type="button" className="g-btn g-btn--primary" onClick={next} disabled={!datesOk || updatingPrice}>{t("continue")}</button>
                </>
              }
            >
              {isMobile ? (
                <button type="button" className="checkout-dates-button" onClick={() => setCalendarOpen(true)} data-testid="open-calendar">
                  <span><small>{t("site:search.checkIn")}</small><b>{checkIn ? longDate(checkIn, lang) : t("dates.choose")}</b></span>
                  <span><small>{t("site:search.checkOut")}</small><b>{checkOut ? longDate(checkOut, lang) : t("dates.choose")}</b></span>
                </button>
              ) : (
                <>
                  <div className="checkout-fields">
                    <div className="g-field">
                      <label className="g-label" htmlFor="checkout-check-in">{t("site:search.checkIn")}</label>
                      <input id="checkout-check-in" className="g-input" type="date" min={today} value={checkIn} onChange={(e) => setStay({ checkIn: e.target.value })} />
                    </div>
                    <div className="g-field">
                      <label className="g-label" htmlFor="checkout-check-out">{t("site:search.checkOut")}</label>
                      <input id="checkout-check-out" className="g-input" type="date" min={checkIn || today} value={checkOut} onChange={(e) => setStay({ checkOut: e.target.value })} />
                    </div>
                  </div>
                  {calendar}
                </>
              )}
              <div className="checkout-fields">
                <div className="g-field">
                  <label className="g-label" htmlFor="checkout-guests">{t("site:booking.guests", { count: capacity })}</label>
                  <select id="checkout-guests" className="g-input" value={guests} onChange={(e) => setStay({ guests: Number(e.target.value) })}>
                    {Array.from({ length: capacity }, (_, i) => i + 1).map((count) => (
                      <option key={count} value={count}>{t("site:search.guestsOption", { count })}</option>
                    ))}
                  </select>
                </div>
              </div>
              {nights > 0 && checkIn < today && <p className="g-alert" role="alert">{t("site:booking.errors.checkInPast")}</p>}
              {checkIn && checkOut && nights <= 0 && <p className="g-alert" role="alert">{t("site:booking.errors.checkOutAfterCheckIn")}</p>}
              {rangeTaken && <p className="g-alert" role="alert">{t("site:booking.errors.datesTaken")}</p>}
            </Step>
          )}

          {stepIndex === 1 && (
            <Step
              index={1}
              title={t("coupon.title")}
              note={t("optional")}
              footer={
                <>
                  <button type="button" className="g-btn g-btn--ghost" onClick={back}>{t("back")}</button>
                  <button type="button" className="g-btn g-btn--primary" onClick={next} disabled={couponChecking}>
                    {coupon ? t("continue") : t("coupon.skip")}
                  </button>
                </>
              }
            >
              {coupon ? (
                <div className="coupon-applied" data-testid="coupon-applied">
                  <div>
                    <b>{coupon.coupon.code}</b>
                    <span>{t("coupon.applied", { amount: money(coupon.discountAmount) })}</span>
                  </div>
                  <button type="button" className="g-btn g-btn--outline" onClick={removeCoupon}>{t("coupon.remove")}</button>
                </div>
              ) : (
                <form className="coupon-form" onSubmit={applyCoupon} noValidate>
                  <div className="g-field">
                    <label className="g-label" htmlFor="checkout-coupon">{t("coupon.label")}</label>
                    <input
                      id="checkout-coupon"
                      className="g-input"
                      value={couponInput}
                      autoComplete="off"
                      aria-invalid={couponError ? "true" : undefined}
                      aria-describedby="checkout-coupon-message"
                      onChange={(e) => {
                        setCouponInput(e.target.value.toUpperCase());
                        setCouponRefused("");
                      }}
                    />
                    <p id="checkout-coupon-message" className={couponError && !couponChecking ? "g-error" : "checkout-help"} role={couponError && !couponChecking ? "alert" : undefined} data-testid="coupon-message">
                      {couponChecking ? t("coupon.checking") : couponError || t("coupon.hint")}
                    </p>
                  </div>
                  <button type="submit" className="g-btn g-btn--primary" disabled={!couponInput.trim() || couponChecking}>{t("coupon.apply")}</button>
                </form>
              )}
            </Step>
          )}

          {stepIndex === 2 && (
            <Step
              index={2}
              title={t("policy.title")}
              footer={
                <>
                  <button type="button" className="g-btn g-btn--ghost" onClick={back}>{t("back")}</button>
                  <button type="button" className="g-btn g-btn--primary" onClick={next} disabled={!draft.agreed}>{t("policy.continue")}</button>
                </>
              }
            >
              {policy ? (
                <>
                  <div className={`policy-deadline${windowOpen ? "" : " is-closed"}`} data-testid="policy-deadline">
                    <div aria-hidden="true">
                      <b>{deadline.slice(8)}</b>
                      <span>{deadline.slice(5, 7)}/{deadline.slice(0, 4)}</span>
                    </div>
                    <p>
                      <b>{windowOpen ? t("policy.freeUntil", { date: longDate(deadline, lang) }) : t("policy.closedTitle")}</b>
                      <br />
                      {windowOpen ? t("policy.freeText", { amount: money(total) }) : t("site:policy.paidClosed", { count: freeDays })}
                    </p>
                  </div>
                  {windowOpen && (
                    <div className="policy-timeline">
                      <div className="is-free"><i>{t("policy.until", { date: formatDate(deadline, lang) })}</i><b>{t("policy.fullRefund")}</b><span>{money(total)}</span></div>
                      <div><i>{t("policy.from", { date: formatDate(addDays(deadline, 1), lang) })}</i><b>{t("policy.noSelfCancel")}</b><span>{t("policy.contactProperty")}</span></div>
                    </div>
                  )}
                  <ul className="checkout-help policy-rules">
                    <li>{t("site:policy.hold", { count: policy.pendingBookingTtlMinutes })}</li>
                    <li>{t("site:policy.unpaid")}</li>
                  </ul>
                </>
              ) : (
                <p className="checkout-help">{t("site:home.why.cancelTextGeneric")}</p>
              )}
              <label className="policy-agree">
                <input type="checkbox" checked={Boolean(draft.agreed)} onChange={(e) => patchDraft({ agreed: e.target.checked })} data-testid="policy-agree" />
                <span>{t("policy.agree")}</span>
              </label>
            </Step>
          )}

          {stepIndex === 3 && (
            <Step
              index={3}
              title={t("payment.title")}
              footer={
                <>
                  {booking ? <Link className="g-btn g-btn--ghost" to="/my-bookings">{t("payment.later")}</Link> : <button type="button" className="g-btn g-btn--ghost" onClick={back}>{t("back")}</button>}
                  <button type="button" className="g-btn g-btn--primary" onClick={next} disabled={!free && !method}>{t("continue")}</button>
                </>
              }
            >
              {free ? (
                <p className="g-note" data-testid="nothing-to-pay">{t("payment.freeText")}</p>
              ) : (
                <>
                  {/* Only the gateways the API has switched on. */}
                  <div className="pay-methods" role="radiogroup" aria-label={t("payment.title")}>
                    {providers.map((provider) => (
                      <label key={provider} className="pay-method">
                        <input type="radio" name="payment-method" value={provider} checked={method === provider} onChange={() => patchDraft({ method: provider })} />
                        <span className="pay-method-logo" aria-hidden="true">{PROVIDER_NAME[provider] || provider}</span>
                        <span><b>{PROVIDER_NAME[provider] || provider}</b><small>{t(`payment.about.${provider}`, { defaultValue: "" })}</small></span>
                      </label>
                    ))}
                  </div>
                  {method && <p className="checkout-info"><GuestIcon.Alert small />{t("payment.redirect", { method: methodName })}</p>}
                  <DemoPaymentNote />
                </>
              )}
            </Step>
          )}

          {stepIndex === 4 && (
            <Step
              index={4}
              title={free ? t("confirm.titleFree") : t("confirm.title")}
              footer={
                <>
                  <button type="button" className="g-btn g-btn--ghost" onClick={back} disabled={submitting}>{t("back")}</button>
                  <button type="button" className="g-btn g-btn--primary checkout-pay" onClick={submit} disabled={submitting || updatingPrice || soldOut} data-testid="checkout-submit">
                    {submitting ? t("confirm.working") : free ? t("confirm.confirmFree") : t("confirm.pay", { amount: money(total), method: methodName })}
                  </button>
                </>
              }
            >
              <dl className="confirm-list">
                <dt>{t("confirm.guest")}</dt><dd>{[user?.name, user?.email].filter(Boolean).join(" · ")}</dd>
                <dt>{t("confirm.room")}</dt><dd>{[room.room_name, room.location].filter(Boolean).join(" · ")}</dd>
                <dt>{t("confirm.stay")}</dt>
                <dd>
                  {policy
                    ? t("confirm.stayTimes", { checkIn: longDate(checkIn, lang), checkInTime: policy.checkInTime, checkOut: longDate(checkOut, lang), checkOutTime: policy.checkOutTime })
                    : datesText}
                  {" · "}{t("nights", { count: nights })}
                </dd>
                <dt>{t("summary.guests")}</dt><dd>{guestsText}</dd>
                <dt>{t("coupon.title")}</dt><dd>{done[1]}</dd>
                {windowOpen && (<><dt>{t("confirm.freeCancel")}</dt><dd className="is-good">{t("policy.until", { date: formatDate(deadline, lang) })}</dd></>)}
                <dt>{t("payment.short")}</dt><dd>{done[3]}</dd>
              </dl>
              {!free && <DemoPaymentNote />}
              {error && <p className="g-alert" role="alert" data-testid="checkout-error">{error}</p>}
            </Step>
          )}

          <ol className="checkout-upcoming" aria-hidden="true">
            {titles.slice(stepIndex + 1).map((title, index) => (
              <li key={title}>{t("stepNumber", { step: stepIndex + index + 2 })} · {title}</li>
            ))}
          </ol>
        </div>

        <aside className="checkout-summary" aria-label={t("summary.label")} aria-busy={updatingPrice}>
          <div className="summary-room">
            <div className="guest-photo">
              <RoomImage src={room.image} alt="" fallback={placeholderFor(room.room_name || room.id)} loading="eager" width={176} height={132} />
            </div>
            <div>
              {room.location && <span className="room-location">{room.location}</span>}
              <h2>{room.room_name}</h2>
              <p>{[room.room_type, t("site:room.maxGuests", { count: capacity })].join(" · ")}</p>
            </div>
          </div>
          {summaryRows}
        </aside>
      </div>

      {calendarOpen && (
        <Dialog className="ui-dialog mobile-calendar" onClose={() => setCalendarOpen(false)} aria-labelledby="mobile-calendar-title" data-testid="mobile-calendar">
          <div className="ui-dialog-head">
            <button type="button" className="ui-button ui-button--icon" aria-label={t("dates.closeCalendar")} onClick={() => setCalendarOpen(false)}>
              <CloseIcon />
            </button>
            <h2 id="mobile-calendar-title">{t("dates.title")}</h2>
            <button type="button" className="g-btn g-btn--link" onClick={() => setStay({ checkIn: "", checkOut: "" })}>{t("dates.clear")}</button>
          </div>
          <div className="mobile-calendar-chosen">
            <div className={!checkIn || checkOut ? "" : "is-next"}><span>{t("site:search.checkIn")}</span><b>{checkIn ? formatDate(checkIn, lang) : "—"}</b></div>
            <div className={checkIn && !checkOut ? "is-active" : ""}><span>{t("site:search.checkOut")}</span><b>{checkOut ? formatDate(checkOut, lang) : "—"}</b></div>
          </div>
          <div className="ui-dialog-body">{calendar}</div>
          <div className="ui-dialog-foot">
            <div>
              <b>{nights > 0 ? `${t("nights", { count: nights })} · ${money(subtotal)}` : t("dates.notChosen")}</b>
              <span>{guestsText}</span>
            </div>
            <button type="button" className="ui-button ui-button--primary" onClick={() => setCalendarOpen(false)} disabled={nights <= 0} data-testid="apply-dates">
              {t("site:list.apply")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
