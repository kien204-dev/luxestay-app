import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AxIcon from "../../components/admin/AxIcon";
import BookingBadge from "../../components/admin/BookingBadge";
import { getBookings } from "../../services/bookingService";
import { bookingCode } from "../../utils/bookingCode";
import { formatDate, formatMoney } from "../../utils/format";
import { localDateString } from "../../utils/date";
import { useDismiss } from "./useDismiss";

const LIMIT = 6;
const WAIT_MS = 250;

// A booking code ("#BK-0012", "bk12", "12") is worth searching from one
// character; a name or an email from two.
function searchable(term) {
  return term.length >= 2 || /\d/.test(term);
}

// The search box of the top bar: bookings by code, or by the guest's name,
// email or phone (GET /bookings?q=, the same search as the orders list).
// The first results show under the box; Enter on one opens that booking,
// otherwise the orders list filtered by the text.
export default function AdminSearch({ autoFocus = false, onDone }) {
  const { t, i18n } = useTranslation("admin");
  const navigate = useNavigate();
  const id = useId();
  const box = useRef(null);
  const input = useRef(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [result, setResult] = useState({ term: null, items: [], total: 0, error: null });

  const term = text.trim();
  const enabled = searchable(term);
  const loading = enabled && result.term !== term;

  useEffect(() => {
    if (!searchable(term)) return undefined;
    const timer = setTimeout(() => {
      getBookings({ q: term, page: 1, limit: LIMIT }).then(
        (res) => setResult({ term, items: res.data.data || [], total: res.data.total || 0, error: null }),
        (error) => setResult({ term, items: [], total: 0, error })
      );
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  useDismiss(box, open, () => setOpen(false));

  const items = loading ? [] : result.items;
  const today = localDateString();

  const finish = (to) => {
    setOpen(false);
    setText("");
    setActive(-1);
    navigate(to);
    onDone?.();
  };
  const openBooking = (booking) => finish(`/admin/orders?booking=${booking.id}`);
  const seeAll = () => finish(`/admin/orders?q=${encodeURIComponent(term)}`);

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" && items.length) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % items.length);
    } else if (event.key === "ArrowUp" && items.length) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? items.length - 1 : index - 1));
    } else if (event.key === "Enter" && enabled) {
      event.preventDefault();
      if (active >= 0 && items[active]) openBooking(items[active]);
      else seeAll();
    } else if (event.key === "Escape" && open) {
      setOpen(false);
    }
  };

  const showList = open && enabled;
  const listId = `${id}-list`;

  return (
    <div className="ax-search" ref={box} role="search">
      <div className="fx-control">
        <AxIcon name="search" />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label={t("search.label")}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${id}-${active}` : undefined}
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          data-testid="admin-search"
        />
        {/* Drawn rather than a placeholder attribute: the pages below have
            their own search boxes, found by their placeholder. */}
        {!text && <span className="ax-search__ph" aria-hidden="true">{t("search.placeholder")}</span>}
      </div>

      {showList && (
        <div className="ax-dd ax-dd--search" data-testid="admin-search-results">
          {loading && <p className="ax-dd__empty" role="status">{t("search.loading")}</p>}
          {!loading && result.error && <p className="ax-dd__empty" role="alert">{t("search.failed")}</p>}
          {!loading && !result.error && items.length === 0 && (
            <p className="ax-dd__empty" role="status">{t("search.none", { term })}</p>
          )}
          <ul id={listId} role="listbox" aria-label={t("search.results")} className="ax-sresults">
            {items.map((booking, index) => (
              <li
                key={booking.id}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === active}
                className={`ax-option ax-sresult${index === active ? " is-active" : ""}`}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => openBooking(booking)}
              >
                <span className="ax-sresult__main">
                  <b>{booking.guest_name || booking.user_name}</b>
                  <span>
                    <span className="ax-code">{bookingCode(booking.id)}</span> · {booking.room_name} · {formatDate(booking.check_in, i18n.language)}
                  </span>
                </span>
                <span className="ax-sresult__side">
                  <BookingBadge booking={booking} today={today} />
                  <small>{formatMoney(booking.total_price, i18n.language)}</small>
                </span>
              </li>
            ))}
          </ul>
          {!loading && result.total > 0 && (
            <button type="button" className="ax-option ax-sresult__all" onPointerDown={(event) => event.preventDefault()} onClick={seeAll}>
              {t("search.seeAll", { count: result.total })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
