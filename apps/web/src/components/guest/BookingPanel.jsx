import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../context/AuthContext";
import { getRoomAvailability } from "../../services/roomService";
import { useAsyncData } from "../../utils/useAsyncData";
import { loginPathFor } from "../../utils/authRedirect";
import { localDateString } from "../../utils/date";
import { addDays, formatDate, formatMoney, nightsBetween } from "../../utils/format";
import { stayQuery } from "../../utils/stayQuery";
import GuestIcon from "./icons";

// The "reserve" column of a room page: dates, guests and what the stay
// costs, then on to the checkout (/rooms/:id/book), where the coupon, the
// cancellation policy and the payment are.
//
// The stay itself (checkIn/checkOut/guests) lives in the page URL, so it
// survives a detour through the login page; this component only edits it
// through onStayChange. Nothing is reserved here: the booking is created at
// the end of the checkout.
export default function BookingPanel({ room, stay, onStayChange, policy }) {
  const { t, i18n } = useTranslation("site");
  const { user } = useAuth();
  const navigate = useNavigate();
  const lang = i18n.language;
  const [error, setError] = useState("");

  const { checkIn, checkOut } = stay;
  const capacity = Number(room.capacity) || 1;
  const guests = Math.min(Math.max(Number(stay.guests) || 1, 1), capacity);
  const today = policy?.today || localDateString();
  const nights = nightsBetween(checkIn, checkOut);
  const subtotal = nights * Number(room.price);

  // Are any of the chosen nights already taken? The server decides for real
  // when the booking is created; this just warns before the guest goes on.
  const rangeKey = nights > 0 && checkIn >= today ? `range:${room.id}:${checkIn}:${checkOut}` : null;
  const { data: range } = useAsyncData(rangeKey, () =>
    getRoomAvailability(room.id, { from: checkIn, to: checkOut })
  );
  const rangeTaken =
    rangeKey && range && range.from === checkIn && range.to === checkOut && range.unavailable.length > 0;

  const freeDays = Number(policy?.freeCancellationDays) || 0;
  const deadline = policy && nights > 0 ? addDays(checkIn, -freeDays) : null;

  const updateStay = (changes) => {
    setError("");
    onStayChange({ ...stay, guests, ...changes });
  };

  const validate = () => {
    if (!checkIn || !checkOut) return t("booking.errors.bothDates");
    if (checkIn < today) return t("booking.errors.checkInPast");
    if (nights <= 0) return t("booking.errors.checkOutAfterCheckIn");
    if (rangeTaken) return t("booking.errors.datesTaken");
    return "";
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    const problem = validate();
    if (problem) return setError(problem);

    // Not signed in: sign in first, then land in the checkout with the same
    // dates (they are in its address).
    const checkout = { pathname: `/rooms/${room.id}/book`, search: stayQuery({ checkIn, checkOut, guests }) };
    navigate(user ? `${checkout.pathname}${checkout.search}` : loginPathFor(checkout));
    return undefined;
  };

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
        <span className="room-price">
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

        {(error || rangeTaken) && (
          <div className="g-alert" role="alert">{error || t("booking.errors.datesTaken")}</div>
        )}

        <button type="submit" className="g-btn g-btn--primary g-btn--block booking-go" disabled={rangeTaken} data-testid="book-room">
          {user ? t("booking.title") : t("booking.loginToBook")}
        </button>
        <p className="booking-note">{user ? t("booking.notChargedYet") : t("booking.loginHint")}</p>

        {nights > 0 && (
          <div className="booking-summary" data-testid="booking-summary">
            <div>
              <span>{t("booking.nightsLine", { count: nights, price: formatMoney(room.price, lang) })}</span>
              <span>{formatMoney(subtotal, lang)}</span>
            </div>
            <div className="booking-total">
              <span>{t("booking.total")}</span>
              <span>{formatMoney(subtotal, lang)}</span>
            </div>
          </div>
        )}

        {/* Only while the free-cancellation window is still open for these dates. */}
        {deadline && deadline >= today && (
          <p className="booking-free">
            <GuestIcon.Check small />
            <span>{t("booking.freeUntil", { date: formatDate(deadline, lang) })}</span>
          </p>
        )}
      </form>
    </aside>
  );
}
