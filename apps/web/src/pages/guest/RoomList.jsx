import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Dialog, { CloseIcon } from "../../components/Dialog";
import SearchBar from "../../components/guest/SearchBar";
import RoomCard from "../../components/guest/RoomCard";
import Pagination from "../../components/guest/Pagination";
import StateMessage from "../../components/guest/StateMessage";
import GuestIcon from "../../components/guest/icons";
import { useProperty } from "../../context/PropertyContext";
import { getRoomFilters, getRooms } from "../../services/roomService";
import { useAsyncData } from "../../utils/useAsyncData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";
import useIsMobile from "../../utils/useIsMobile";
import { formatDate, formatMoney, isDateString } from "../../utils/format";
import { searchToQuery } from "../../utils/stayQuery";
import "../../styles/rooms.css";

const PAGE_SIZE = 12;

const SORTS = {
  newest: { sortBy: "created_at", sortOrder: "desc" },
  priceAsc: { sortBy: "price", sortOrder: "asc" },
  priceDesc: { sortBy: "price", sortOrder: "desc" },
};

const NO_FILTERS = { location: "", checkIn: "", checkOut: "", guests: "", minPrice: "", maxPrice: "", type: "" };

// A whole, positive amount from the URL or an input, or "".
function readAmount(value) {
  const amount = Number(value);
  return value !== null && value !== "" && Number.isFinite(amount) && amount >= 0 ? String(Math.round(amount)) : "";
}

// Everything the list shows is described by the URL, so a search can be
// bookmarked, shared, and survives the back button.
function readSearch(searchParams) {
  const checkIn = searchParams.get("checkIn") || "";
  const checkOut = searchParams.get("checkOut") || "";
  const hasDates = isDateString(checkIn) && isDateString(checkOut) && checkOut > checkIn;
  const guests = Number(searchParams.get("guests"));
  const sort = searchParams.get("sort");

  return {
    location: (searchParams.get("location") || "").trim(),
    checkIn: hasDates ? checkIn : "",
    checkOut: hasDates ? checkOut : "",
    guests: Number.isInteger(guests) && guests > 0 ? String(guests) : "",
    minPrice: readAmount(searchParams.get("minPrice")),
    maxPrice: readAmount(searchParams.get("maxPrice")),
    type: (searchParams.get("type") || "").trim(),
    sort: SORTS[sort] ? sort : "newest",
    page: Math.max(1, Number.parseInt(searchParams.get("page"), 10) || 1),
  };
}

// Nightly price from/to. `bounds` (the cheapest and dearest room on offer)
// are shown as the hint of what "any" means.
function PriceFilter({ search, bounds, onApply, idPrefix }) {
  const { t, i18n } = useTranslation("site");
  const [min, setMin] = useState(search.minPrice);
  const [max, setMax] = useState(search.maxPrice);
  const hint = (amount) => (amount === null || amount === undefined ? "" : formatMoney(amount, i18n.language));

  return (
    <form
      className="price-filter"
      // The step is for the arrow keys; any amount may be typed.
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        // Typed the wrong way round: read them as a range all the same.
        const [low, high] = min && max && Number(min) > Number(max) ? [max, min] : [min, max];
        onApply({ minPrice: readAmount(low), maxPrice: readAmount(high) });
      }}
    >
      <div className="g-field">
        <label className="g-label" htmlFor={`${idPrefix}-min`}>{t("list.priceFrom")}</label>
        <input id={`${idPrefix}-min`} className="g-input" type="number" inputMode="numeric" min="0" step="50000" placeholder={hint(bounds?.minPrice)} value={min} onChange={(e) => setMin(e.target.value)} />
      </div>
      <div className="g-field">
        <label className="g-label" htmlFor={`${idPrefix}-max`}>{t("list.priceTo")}</label>
        <input id={`${idPrefix}-max`} className="g-input" type="number" inputMode="numeric" min="0" step="50000" placeholder={hint(bounds?.maxPrice)} value={max} onChange={(e) => setMax(e.target.value)} />
      </div>
      <button type="submit" className="g-btn g-btn--outline">{t("list.apply")}</button>
    </form>
  );
}

// One chip per room type on offer; pressing the active one clears it.
function TypeChips({ types, active, onChange }) {
  return types.map(({ type, count }) => (
    <button key={type} type="button" className="chip" aria-pressed={active.toLowerCase() === type.toLowerCase()} onClick={() => onChange(active.toLowerCase() === type.toLowerCase() ? "" : type)}>
      {type} <small>{count}</small>
    </button>
  ));
}

// The "Price" chip with its from/to form in a popover (closes when focus
// leaves it or on Escape, like the guest counter of the search bar).
function PriceChip({ search, bounds, onApply }) {
  const { t, i18n } = useTranslation("site");
  const [open, setOpen] = useState(false);
  const money = (amount) => formatMoney(amount, i18n.language);
  const label =
    search.minPrice && search.maxPrice
      ? t("list.priceBetween", { from: money(search.minPrice), to: money(search.maxPrice) })
      : search.minPrice
        ? t("list.priceAbove", { from: money(search.minPrice) })
        : search.maxPrice
          ? t("list.priceBelow", { to: money(search.maxPrice) })
          : t("list.price");

  return (
    <div
      className="chip-popover"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <button type="button" className="chip" aria-pressed={Boolean(search.minPrice || search.maxPrice)} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)} data-testid="price-chip">
        {label}
        <GuestIcon.Down small />
      </button>
      {open && (
        <div className="search-popover" role="dialog" aria-label={t("list.price")}>
          <PriceFilter
            idPrefix="price"
            search={search}
            bounds={bounds}
            onApply={(values) => {
              setOpen(false);
              onApply(values);
            }}
          />
        </div>
      )}
    </div>
  );
}

// Blocks in the shape of the cards while the list loads.
function LoadingGrid() {
  const { t } = useTranslation("site");
  return (
    <div className="room-grid" aria-busy="true" data-testid="rooms-loading">
      <span className="sr-only" role="status">{t("list.loading")}</span>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="room-skeleton">
          <span className="luxe-skeleton-light" style={{ aspectRatio: "4 / 3" }} />
          <span className="luxe-skeleton-light" style={{ height: 12, width: "35%" }} />
          <span className="luxe-skeleton-light" style={{ height: 26, width: "80%" }} />
          <span className="luxe-skeleton-light" style={{ height: 12, width: "65%" }} />
          <span className="luxe-skeleton-light" style={{ height: 26, width: "45%", marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}

export default function RoomList() {
  const { t, i18n } = useTranslation("site");
  const property = useProperty();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Phones fold the search form and the filters into one sheet.
  const isMobile = useIsMobile();
  const search = readSearch(searchParams);
  const lang = i18n.language;
  useDocumentTitle(t("list.documentTitle"));

  const { data, loading, error, reload } = useAsyncData(`rooms:${JSON.stringify(search)}`, () =>
    getRooms({
      bookable: true,
      page: search.page,
      limit: PAGE_SIZE,
      ...SORTS[search.sort],
      ...(search.location ? { location: search.location } : {}),
      ...(search.checkIn ? { checkIn: search.checkIn, checkOut: search.checkOut } : {}),
      ...(search.guests ? { minCapacity: search.guests } : {}),
      ...(search.minPrice ? { minPrice: search.minPrice } : {}),
      ...(search.maxPrice ? { maxPrice: search.maxPrice } : {}),
      ...(search.type ? { roomType: search.type } : {}),
    })
  );
  // What can be filtered on: the types and price range that really exist.
  const { data: facets } = useAsyncData("room-filters", getRoomFilters);
  const types = facets?.types || [];

  const rooms = data?.data || [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = data?.pagination?.totalPages ?? 1;
  const state = !data && loading ? "loading" : error ? "error" : rooms.length === 0 ? "empty" : "ready";

  const update = (changes) => {
    const next = { ...search, ...changes };
    const params = new URLSearchParams(searchToQuery(next));
    if (next.minPrice) params.set("minPrice", next.minPrice);
    if (next.maxPrice) params.set("maxPrice", next.maxPrice);
    if (next.type) params.set("type", next.type);
    if (next.sort !== "newest") params.set("sort", next.sort);
    if (next.page > 1) params.set("page", next.page);
    setSearchParams(params);
    window.scrollTo({ top: 0 });
  };
  const filter = (changes) => update({ ...changes, page: 1 });

  // Each condition in force, with what removing it means: shown as chips to
  // take off one at a time when nothing matches.
  const dates = search.checkIn ? `${formatDate(search.checkIn, lang)} – ${formatDate(search.checkOut, lang)}` : "";
  const money = (amount) => formatMoney(amount, lang);
  const active = [
    search.location && { key: "location", label: search.location, clear: { location: "" } },
    dates && { key: "dates", label: dates, clear: { checkIn: "", checkOut: "" } },
    search.guests && { key: "guests", label: t("search.guestsOption", { count: Number(search.guests) }), clear: { guests: "" } },
    (search.minPrice || search.maxPrice) && {
      key: "price",
      label: search.minPrice && search.maxPrice
        ? t("list.priceBetween", { from: money(search.minPrice), to: money(search.maxPrice) })
        : search.minPrice
          ? t("list.priceAbove", { from: money(search.minPrice) })
          : t("list.priceBelow", { to: money(search.maxPrice) }),
      clear: { minPrice: "", maxPrice: "" },
    },
    search.type && { key: "type", label: search.type, clear: { type: "" } },
  ].filter(Boolean);
  const hasFilters = active.length > 0;

  const summary =
    state === "loading"
      ? t("list.loading")
      : search.checkIn
        ? t("list.countForDates", { count: total, checkIn: formatDate(search.checkIn, lang), checkOut: formatDate(search.checkOut, lang) })
        : t("list.count", { count: total });

  const searchBar = (onDone) => (
    <SearchBar
      // Remount when the URL's search changes so the form shows it.
      key={searchToQuery(search)}
      flat
      initial={search}
      onSearch={(values) => {
        filter(values);
        onDone?.();
      }}
    />
  );

  return (
    <div className="guest-container rooms-page" data-testid="rooms-page" data-state={state}>
      <div className="page-head">
        <ol className="crumbs">
          <li><Link to="/">{t("list.home")}</Link></li>
          <li aria-current="page">{t("nav.rooms")}</li>
        </ol>
        <h1>{t("list.title")}</h1>
        <p aria-live="polite" data-testid="result-count">{summary}</p>
      </div>

      {!isMobile && searchBar()}

      {isMobile && (
      <div className="rooms-search-mobile">
        <button type="button" className="rooms-search-summary" onClick={() => setSheetOpen(true)}>
          <GuestIcon.Search />
          <span>
            <b>{search.location || t("list.anywhere")}</b>
            <span>{[dates || t("list.anyDates"), search.guests ? t("search.guestsOption", { count: Number(search.guests) }) : t("search.anyGuests")].join(" · ")}</span>
          </span>
        </button>
        <button type="button" className="rooms-filter-button" aria-label={t("list.filtersActive", { count: active.length })} onClick={() => setSheetOpen(true)} data-testid="open-filters">
          <GuestIcon.Filter />
          {hasFilters && <span>{active.length}</span>}
        </button>
      </div>
      )}

      <div className="rooms-tools">
        <div className="rooms-chips" role="group" aria-label={t("list.filters")}>
          <PriceChip key={`${search.minPrice}-${search.maxPrice}`} search={search} bounds={facets} onApply={filter} />
          <TypeChips types={types} active={search.type} onChange={(type) => filter({ type })} />
          {hasFilters && (
            <button type="button" className="g-btn g-btn--link" onClick={() => filter(NO_FILTERS)}>
              {t("list.clearFilters")}
            </button>
          )}
        </div>
        <div className="rooms-sort">
          <label className="sr-only" htmlFor="room-sort">{t("list.sort")}</label>
          <select id="room-sort" className="g-input" value={search.sort} onChange={(e) => filter({ sort: e.target.value })}>
            <option value="newest">{t("list.sortLabel", { sort: t("list.sortNewest") })}</option>
            <option value="priceAsc">{t("list.sortLabel", { sort: t("list.sortPriceAsc") })}</option>
            <option value="priceDesc">{t("list.sortLabel", { sort: t("list.sortPriceDesc") })}</option>
          </select>
        </div>
      </div>

      {state === "loading" && <LoadingGrid />}

      {state === "error" && (
        <StateMessage error heading="h2" title={t("list.errorTitle")} text={t("list.errorText")} testId="rooms-error">
          <button type="button" className="g-btn g-btn--primary" onClick={reload}>
            <GuestIcon.Retry />
            {t("list.retry")}
          </button>
          {property.phone && (
            <a className="g-btn g-btn--link" href={`tel:${property.phone.replace(/[^\d+]/g, "")}`}>
              {t("home.rooms.call", { phone: property.phone })}
            </a>
          )}
        </StateMessage>
      )}

      {state === "empty" && (
        <StateMessage
          heading="h2"
          title={hasFilters ? t("list.emptyTitle") : t("home.rooms.emptyTitle")}
          text={hasFilters ? t("list.emptyText") : t("home.rooms.emptyText")}
          testId="rooms-empty"
        >
          {/* Take the conditions off one at a time, or all at once. */}
          {active.map((item) => (
            <button key={item.key} type="button" className="chip" aria-label={t("list.removeFilter", { filter: item.label })} onClick={() => filter(item.clear)}>
              {item.label}
              <GuestIcon.Close small />
            </button>
          ))}
          {hasFilters && (
            <button type="button" className="g-btn g-btn--primary" onClick={() => filter(NO_FILTERS)}>
              {t("list.clearFilters")}
            </button>
          )}
        </StateMessage>
      )}

      {state === "ready" && (
        <>
          <div className="room-grid" style={{ opacity: loading ? 0.6 : 1 }}>
            {rooms.map((room, index) => (
              <RoomCard key={room.id} room={room} stay={search} heading="h2" eager={index < 3} />
            ))}
          </div>
          <Pagination page={search.page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onChange={(page) => update({ page })} />
        </>
      )}

      {sheetOpen && isMobile && (
        <Dialog className="ui-dialog filter-sheet" onClose={() => setSheetOpen(false)} aria-labelledby="filter-sheet-title">
          <div className="ui-dialog-head">
            <h2 id="filter-sheet-title">{t("list.filters")}</h2>
            <button type="button" className="ui-button ui-button--icon" aria-label={t("list.closeFilters")} onClick={() => setSheetOpen(false)}>
              <CloseIcon />
            </button>
          </div>
          <div className="ui-dialog-body">
            <section>
              <h3>{t("list.searchGroup")}</h3>
              {searchBar()}
            </section>
            <section>
              <h3>{t("list.priceGroup")}</h3>
              <PriceFilter key={`${search.minPrice}-${search.maxPrice}`} idPrefix="sheet-price" search={search} bounds={facets} onApply={filter} />
            </section>
            {types.length > 0 && (
              <section>
                <h3>{t("list.typeGroup")}</h3>
                <div className="rooms-chips">
                  <TypeChips types={types} active={search.type} onChange={(type) => filter({ type })} />
                </div>
              </section>
            )}
          </div>
          <div className="ui-dialog-foot">
            <button type="button" className="ui-button ui-button--secondary" onClick={() => filter(NO_FILTERS)} disabled={!hasFilters}>
              {t("list.clearFilters")}
            </button>
            <button type="button" className="ui-button ui-button--primary" style={{ flex: 1 }} onClick={() => setSheetOpen(false)} data-testid="apply-filters">
              {state === "loading" ? t("list.loading") : t("list.showRooms", { count: total })}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
