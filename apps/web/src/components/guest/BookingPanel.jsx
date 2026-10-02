import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { createBooking } from "../../services/bookingService";
import { validateCoupon } from "../../services/couponService";
import { getRoomAvailability } from "../../services/roomService";
import { useAsyncData } from "../../utils/useAsyncData";
import { loginPathFor } from "../../utils/authRedirect";
import { localDateString } from "../../utils/date";
import { formatMoney, nightsBetween } from "../../utils/format";
import CancellationPolicy from "./CancellationPolicy";
import PaymentStep from "./PaymentStep";

// The "reserve" column of a room page: dates, guests, price, the
// cancellation policy, then (once the booking exists) the payment step.
//
// The stay itself (checkIn/checkOut/guests) lives in the page URL, so it
// survives a detour through the login page; this component only edits it
// through onStayChange.
export default function BookingPanel({ room, stay, onStayChange, policy }) {
  const { t, i18n } = useTranslation("site");
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const lang = i18n.language;

  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [couponChecking, setCouponChecking] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [createdBooking, setCreatedBooking] = useState(null);

  const { checkIn, checkOut } = stay;
  const capacity = Number(room.capacity) || 1;
  const guests = Math.min(Math.max(Number(stay.guests) || 1, 1), capacity);
  const today = policy?.today || localDateString();
  const nights = nightsBetween(checkIn, checkOut);
  const subtotal = nights * Number(room.price);
  // A coupon was validated for one specific amount; any other stay voids it.
  const appliedCoupon = coupon && coupon.forAmount === subtotal ? coupon : null;
  const total = appliedCoupon ? appliedCoupon.finalAmount : subtotal;

  // Are any of the chosen nights already taken? The server decides for real
  // when the booking is created; this just warns before the guest commits.
  const rangeKey = nights > 0 && checkIn >= today ? `range:${room.id}:${checkIn}:${checkOut}` : null;
  const { data: range } = useAsyncData(rangeKey, () =>
    getRoomAvailability(room.id, { from: checkIn, to: checkOut })
  );
  const rangeTaken =
    rangeKey && range && range.from === checkIn && range.to === checkOut && range.unavailable.length > 0;

  const updateStay = (changes) => {
    setError("");
    onStayChange({ ...stay, guests, ...changes });
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return setCouponError(t("booking.errors.couponEmpty"));
    if (subtotal <= 0) return setCouponError(t("booking.errors.couponNeedsDates"));

    setCouponChecking(true);
    setCouponError("");
    try {
      const result = await validateCoupon(couponCode.trim(), subtotal);
      setCoupon({ ...result, forAmount: subtotal });
    } catch (err) {
      setCoupon(null);
      setCouponError(err.response?.data?.message || t("booking.errors.couponInvalid"));
    } finally {
      setCouponChecking(false);
    }
    return undefined;
  };

  const validate = () => {
    if (!checkIn || !checkOut) return t("booking.errors.bothDates");
    if (checkIn < today) return t("booking.errors.checkInPast");
    if (nights <= 0) return t("booking.errors.checkOutAfterCheckIn");
    if (rangeTaken) return t("booking.errors.datesTaken");
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const problem = validate();
    if (problem) return setError(problem);

    // Not signed in: sign in first, then come straight back to this room
    // with the same dates (they are in the URL).
    if (!user) {
      navigate(loginPathFor(location));
      return undefined;
    }

    setSubmitting(true);
    setError("");
    try {
      const res = await createBooking({
        room_id: room.id,
        check_in: checkIn,
        check_out: checkOut,
        guests,
        ...(appliedCoupon ? { coupon_code: couponCode.trim() } : {}),
      });

      // Nothing left to pay (fully discounted): already confirmed.
      if (res.data.booking.status === "confirmed") {
        toast.success(t("booking.confirmedToast"));
        navigate("/my-bookings");
        return undefined;
      }
      setCreatedBooking(res.data.booking);
    } catch (err) {
      setError(err.response?.data?.message || t("booking.errors.failed"));
    } finally {
      setSubmitting(false);
    }
    return undefined;
  };

  if (createdBooking) {
    return (
      <aside id="booking-panel" className="booking-panel" aria-label={t("booking.paymentTitle")}>
        <PaymentStep booking={createdBooking} policy={policy} />
      </aside>
    );
  }

  if (room.status === "maintenance") {
    return (
      <aside id="booking-panel" className="booking-panel">
        <p className="g-note" style={{ margin: 0 }}>{t("booking.notBookable")}</p>
      </aside>
    );
  }

  return (
    <aside id="booking-panel" className="booking-panel" aria-label={t("booking.title")}>
      <div>
        <span className="room-price" style={{ fontSize: 26 }}>
          {formatMoney(room.price, lang)} <small>{t("room.perNight")}</small>
        </span>
      </div>

      <form onSubmit={handleSubmit} noValidate style={{ display: "contents" }}>
        <div className="booking-panel-row">
          <div className="g-field">
            <label className="g-label" htmlFor="booking-check-in">{t("search.checkIn")}</label>
            <input
              id="booking-check-in"
              className="g-input"
              type="date"
              min={today}
              value={checkIn}
              onChange={(e) => updateStay({ checkIn: e.target.value })}
            />
          </div>
          <div className="g-field">
            <label className="g-label" htmlFor="booking-check-out">{t("search.checkOut")}</label>
            <input
              id="booking-check-out"
              className="g-input"
              type="date"
              min={checkIn || today}
              value={checkOut}
              onChange={(e) => updateStay({ checkOut: e.target.value })}
            />
          </div>
        </div>

        <div className="g-field">
          <label className="g-label" htmlFor="booking-guests">
            {t("booking.guests", { count: capacity })}
          </label>
          <select
            id="booking-guests"
            className="g-input"
            value={guests}
            onChange={(e) => updateStay({ guests: Number(e.target.value) })}
          >
            {Array.from({ length: capacity }, (_, i) => i + 1).map((count) => (
              <option key={count} value={count}>{t("search.guestsOption", { count })}</option>
            ))}
          </select>
        </div>

        {user && (
          <div className="g-field">
            <label className="g-label" htmlFor="booking-coupon">{t("booking.coupon")}</label>
            <div className="coupon-row">
              <input
                id="booking-coupon"
                className="g-input"
                type="text"
                value={couponCode}
                placeholder={t("booking.couponPlaceholder")}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase());
                  setCoupon(null);
                  setCouponError("");
                }}
              />
              <button
                type="button"
                className="g-btn g-btn--outline g-btn--small"
                disabled={couponChecking || !couponCode.trim()}
                onClick={handleApplyCoupon}
              >
                {couponChecking ? "…" : appliedCoupon ? t("booking.couponApplied") : t("booking.couponApply")}
              </button>
            </div>
            {couponError && <p className="g-error">{couponError}</p>}
          </div>
        )}

        {nights > 0 && (
          <div className="booking-summary" data-testid="booking-summary">
            <div>
              <span>{t("booking.nightsLine", { count: nights, price: formatMoney(room.price, lang) })}</span>
              <span>{formatMoney(subtotal, lang)}</span>
            </div>
            {appliedCoupon && (
              <div>
                <span>{t("booking.discount", { code: appliedCoupon.coupon.code })}</span>
                <span>−{formatMoney(appliedCoupon.discountAmount, lang)}</span>
              </div>
            )}
            <div className="booking-total">
              <span>{t("booking.total")}</span>
              <span>{formatMoney(total, lang)}</span>
            </div>
          </div>
        )}

        <CancellationPolicy policy={policy} checkIn={checkIn} />

        {(error || rangeTaken) && (
          <div className="g-alert" role="alert">{error || t("booking.errors.datesTaken")}</div>
        )}

        <button type="submit" className="g-btn g-btn--gold g-btn--block" disabled={submitting || rangeTaken}>
          {submitting ? t("booking.submitting") : user ? t("booking.submit") : t("booking.loginToBook")}
        </button>
        {!user && <p className="guest-muted" style={{ fontSize: 12, margin: 0 }}>{t("booking.loginHint")}</p>}
      </form>
    </aside>
  );
}
