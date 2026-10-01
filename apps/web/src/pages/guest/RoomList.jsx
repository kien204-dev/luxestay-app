import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SearchBar from "../../components/guest/SearchBar";
import RoomCard from "../../components/guest/RoomCard";
import Pagination from "../../components/guest/Pagination";
import { getRooms } from "../../services/roomService";
import { useAsyncData } from "../../utils/useAsyncData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";
import { formatDate, isDateString } from "../../utils/format";
import { searchToQuery } from "../../utils/stayQuery";

const PAGE_SIZE = 12;

const SORTS = {
  newest: { sortBy: "created_at", sortOrder: "desc" },
  priceAsc: { sortBy: "price", sortOrder: "asc" },
  priceDesc: { sortBy: "price", sortOrder: "desc" },
};

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
    sort: SORTS[sort] ? sort : "newest",
    page: Math.max(1, Number.parseInt(searchParams.get("page"), 10) || 1),
  };
}

export default function RoomList() {
  const { t, i18n } = useTranslation("site");
  const [searchParams, setSearchParams] = useSearchParams();
  const search = readSearch(searchParams);
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
    })
  );

  const rooms = data?.data || [];
  const total = data?.pagination?.total ?? 0;
  const totalPages = data?.pagination?.totalPages ?? 1;
  const hasFilters = Boolean(search.location || search.checkIn || search.guests);

  const update = (changes) => {
    const next = { ...search, ...changes };
    const params = new URLSearchParams(searchToQuery(next));
    if (next.sort !== "newest") params.set("sort", next.sort);
    if (next.page > 1) params.set("page", next.page);
    setSearchParams(params);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="guest-container" style={{ paddingTop: 32, paddingBottom: 72 }}>
      <h1 style={{ fontSize: 32, marginBottom: 20 }}>{t("list.title")}</h1>

      <SearchBar
        // Remount when the URL's search changes so the form shows it.
        key={searchToQuery(search)}
        flat
        initial={search}
        onSearch={(values) => update({ ...values, page: 1 })}
      />

      <div className="list-toolbar">
        <div className="guest-muted" aria-live="polite" data-testid="result-count">
          {!data && loading
            ? t("list.loading")
            : search.checkIn
              ? t("list.countForDates", {
                  count: total,
                  checkIn: formatDate(search.checkIn, i18n.language),
                  checkOut: formatDate(search.checkOut, i18n.language),
                })
              : t("list.count", { count: total })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {hasFilters && (
            <button
              type="button"
              className="g-btn g-btn--outline g-btn--small"
              onClick={() => update({ location: "", checkIn: "", checkOut: "", guests: "", page: 1 })}
            >
              {t("list.clearFilters")}
            </button>
          )}
          <label className="guest-muted" htmlFor="room-sort" style={{ fontSize: 13 }}>
            {t("list.sort")}
          </label>
          <select
            id="room-sort"
            className="g-input"
            value={search.sort}
            onChange={(e) => update({ sort: e.target.value, page: 1 })}
          >
            <option value="newest">{t("list.sortNewest")}</option>
            <option value="priceAsc">{t("list.sortPriceAsc")}</option>
            <option value="priceDesc">{t("list.sortPriceDesc")}</option>
          </select>
        </div>
      </div>

      {!data && loading ? (
        <div className="room-grid" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="luxe-skeleton-light skeleton-card" />
          ))}
        </div>
      ) : error ? (
        <div className="guest-state">
          <p>{t("list.loadFailed")}</p>
          <button type="button" className="g-btn g-btn--outline" onClick={reload}>
            {t("list.retry")}
          </button>
        </div>
      ) : rooms.length === 0 ? (
        <div className="guest-state">
          <p>{hasFilters ? t("list.noMatches") : t("list.noRoomsYet")}</p>
        </div>
      ) : (
        <>
          <div className="room-grid" style={{ opacity: loading ? 0.6 : 1 }}>
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} stay={search} />
            ))}
          </div>
          <Pagination page={search.page} totalPages={totalPages} onChange={(page) => update({ page })} />
        </>
      )}
    </div>
  );
}
