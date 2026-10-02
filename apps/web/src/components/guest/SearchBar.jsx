import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getRoomLocations } from "../../services/roomService";
import { useAsyncData } from "../../utils/useAsyncData";
import { localDateString } from "../../utils/date";

const GUEST_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10];

// Search form used on the landing page and above the room list. It owns its
// draft values and reports a validated search through onSearch.
export default function SearchBar({ initial = {}, onSearch, flat = false }) {
  const { t } = useTranslation("site");
  const [location, setLocation] = useState(initial.location || "");
  const [checkIn, setCheckIn] = useState(initial.checkIn || "");
  const [checkOut, setCheckOut] = useState(initial.checkOut || "");
  const [guests, setGuests] = useState(initial.guests || "");
  const [error, setError] = useState("");

  const { data: locations } = useAsyncData("room-locations", getRoomLocations);
  const today = localDateString();

  const handleSubmit = (event) => {
    event.preventDefault();

    if (Boolean(checkIn) !== Boolean(checkOut)) {
      setError(t("search.errors.bothDates"));
      return;
    }
    if (checkIn && checkOut <= checkIn) {
      setError(t("search.errors.checkOutAfterCheckIn"));
      return;
    }

    setError("");
    onSearch({ location: location.trim(), checkIn, checkOut, guests });
  };

  return (
    <form className={`search-bar ${flat ? "search-bar--flat" : ""}`} onSubmit={handleSubmit} noValidate>
      <div className="g-field">
        <label className="g-label" htmlFor="search-location">{t("search.location")}</label>
        <input
          id="search-location"
          className="g-input"
          type="text"
          list="search-location-options"
          autoComplete="off"
          placeholder={t("search.locationPlaceholder")}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <datalist id="search-location-options">
          {(Array.isArray(locations) ? locations : []).map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      <div className="g-field">
        <label className="g-label" htmlFor="search-check-in">{t("search.checkIn")}</label>
        <input
          id="search-check-in"
          className="g-input"
          type="date"
          min={today}
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
        />
      </div>

      <div className="g-field">
        <label className="g-label" htmlFor="search-check-out">{t("search.checkOut")}</label>
        <input
          id="search-check-out"
          className="g-input"
          type="date"
          min={checkIn || today}
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
        />
      </div>

      <div className="g-field">
        <label className="g-label" htmlFor="search-guests">{t("search.guests")}</label>
        <select
          id="search-guests"
          className="g-input"
          value={guests}
          onChange={(e) => setGuests(e.target.value)}
        >
          <option value="">{t("search.anyGuests")}</option>
          {GUEST_OPTIONS.map((count) => (
            <option key={count} value={count}>{t("search.guestsOption", { count })}</option>
          ))}
        </select>
      </div>

      <button type="submit" className="g-btn g-btn--gold">{t("search.submit")}</button>

      {error && <p className="g-error search-bar-error" role="alert">{error}</p>}
    </form>
  );
}
