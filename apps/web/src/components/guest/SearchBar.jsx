import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { getRoomLocations } from "../../services/roomService";
import { useAsyncData } from "../../utils/useAsyncData";
import { localDateString } from "../../utils/date";
import GuestIcon from "./icons";

const MAX_GUESTS = 10;

// One row of the guest counter.
function Stepper({ label, value, min, canAdd, onChange, fewerLabel, moreLabel }) {
  return (
    <div className="search-guest-row">
      <span>{label}</span>
      <div className="search-stepper">
        <button type="button" aria-label={fewerLabel} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <GuestIcon.Minus small />
        </button>
        <output aria-live="polite">{value}</output>
        <button type="button" aria-label={moreLabel} disabled={!canAdd} onClick={() => onChange(value + 1)}>
          <GuestIcon.Plus small />
        </button>
      </div>
    </div>
  );
}

// Search form used on the landing page and above the room list. It owns its
// draft values and reports a validated search through onSearch. Rooms are
// matched on the number of people, so adults and children are reported as
// one `guests` total ("" = any).
export default function SearchBar({ initial = {}, onSearch, flat = false }) {
  const { t } = useTranslation("site");
  const popoverId = useId();
  const [location, setLocation] = useState(initial.location || "");
  const [checkIn, setCheckIn] = useState(initial.checkIn || "");
  const [checkOut, setCheckOut] = useState(initial.checkOut || "");
  const [adults, setAdults] = useState(Math.min(Number(initial.guests) || 0, MAX_GUESTS));
  const [children, setChildren] = useState(0);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [error, setError] = useState("");

  const { data: locations } = useAsyncData("room-locations", getRoomLocations);
  const today = localDateString();
  const guests = adults + children;
  const canAdd = guests < MAX_GUESTS;

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
    setGuestsOpen(false);
    onSearch({ location: location.trim(), checkIn, checkOut, guests: guests || "" });
  };

  const guestsLabel =
    guests === 0
      ? t("search.anyGuests")
      : [t("search.adults", { count: adults }), children > 0 && t("search.children", { count: children })]
          .filter(Boolean)
          .join(", ");

  return (
    <form
      className={`search-bar ${flat ? "search-bar--flat" : ""}`}
      role="search"
      aria-label={t("search.label")}
      onSubmit={handleSubmit}
      noValidate
    >
      <label className="search-seg search-seg--wide">
        <span className="search-seg-key">{t("search.location")}</span>
        <input
          id="search-location"
          className="search-seg-value"
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
      </label>

      <label className="search-seg">
        <span className="search-seg-key">{t("search.checkIn")}</span>
        <input
          id="search-check-in"
          className="search-seg-value"
          type="date"
          min={today}
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
        />
      </label>

      <label className="search-seg">
        <span className="search-seg-key">{t("search.checkOut")}</span>
        <input
          id="search-check-out"
          className="search-seg-value"
          type="date"
          min={checkIn || today}
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
        />
      </label>

      {/* Closes when focus leaves it (a click elsewhere, Tab past it) or on Escape. */}
      <div
        className="search-seg search-seg--guests"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setGuestsOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setGuestsOpen(false);
        }}
      >
        <button
          type="button"
          id="search-guests"
          aria-haspopup="dialog"
          aria-expanded={guestsOpen}
          aria-controls={guestsOpen ? popoverId : undefined}
          onClick={() => setGuestsOpen((open) => !open)}
        >
          <span className="search-seg-key">{t("search.guests")}</span>
          <span className={`search-seg-value${guests === 0 ? " is-placeholder" : ""}`}>{guestsLabel}</span>
        </button>

        {guestsOpen && (
          <div id={popoverId} className="search-popover" role="dialog" aria-label={t("search.guests")}>
            <Stepper
              label={t("search.adultsTitle")}
              value={adults}
              // Children do not travel alone: the last adult stays while there are any.
              min={children > 0 ? 1 : 0}
              canAdd={canAdd}
              onChange={setAdults}
              fewerLabel={t("search.fewerAdults")}
              moreLabel={t("search.moreAdults")}
            />
            <Stepper
              label={t("search.childrenTitle")}
              value={children}
              min={0}
              canAdd={canAdd && adults > 0}
              onChange={setChildren}
              fewerLabel={t("search.fewerChildren")}
              moreLabel={t("search.moreChildren")}
            />
            <div className="search-popover-foot">
              <button type="button" className="g-btn g-btn--primary g-btn--small" onClick={() => setGuestsOpen(false)}>
                {t("search.done")}
              </button>
            </div>
          </div>
        )}
      </div>

      <button type="submit" className="g-btn g-btn--primary search-go">
        <GuestIcon.Search />
        {t("search.submit")}
      </button>

      {error && <p className="g-error search-bar-error" role="alert">{error}</p>}
    </form>
  );
}
