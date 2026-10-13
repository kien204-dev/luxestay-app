import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AxIcon from "../../../components/admin/AxIcon";
import BookingBadge, { bookingState } from "../../../components/admin/BookingBadge";
import { Crumbs, EmptyState, Skel } from "../../../components/admin/ax";
import { useDismiss } from "../../../layout/admin/useDismiss";
import { getBookingTimeline } from "../../../services/bookingService";
import { apiErrorText } from "../../../utils/apiError";
import { bookingCode } from "../../../utils/bookingCode";
import { localDateString } from "../../../utils/date";
import { addDays, formatMoney, isDateString, nightsBetween } from "../../../utils/format";
import { percent, rangeText, shortWeekday, stayText } from "../../../utils/adminFormat";
import { useAsyncData } from "../../../utils/useAsyncData";
import { useDocumentTitle } from "../../../utils/useDocumentTitle";

// Block colour per state, as in the legend.
const TONE = { pending: "warning", confirmed: "success", inHouse: "info", completed: "neutral" };
const LEGEND = ["confirmed", "inHouse", "pending", "completed"];

function windowFor(view, anchor) {
  if (view === "week") {
    const weekday = (new Date(`${anchor}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
    const from = addDays(anchor, -weekday);
    return { from, to: addDays(from, 6) };
  }
  const from = `${anchor.slice(0, 7)}-01`;
  const next = addDays(from, 32);
  return { from, to: addDays(`${next.slice(0, 7)}-01`, -1) };
}

function monthTitle(date, lang) {
  const text = new Date(`${date}T00:00:00Z`).toLocaleDateString(lang === "en" ? "en-US" : "vi-VN", { timeZone: "UTC", month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Under the block, inside the calendar's frame.
function placeUnder(block, frame) {
  const a = block.getBoundingClientRect();
  const w = frame.getBoundingClientRect();
  const width = Math.min(320, w.width - 16);
  return { left: Math.max(8, Math.min(a.left - w.left, w.width - width - 8)), top: a.bottom - w.top + 8, width };
}

// `anchor` is a ref to the block that opened it (focus goes back there).
function Popover({ entry, place, anchor, onClose }) {
  const { t, i18n } = useTranslation("calendar");
  const lang = i18n.language;
  const box = useRef(null);
  useDismiss(box, true, onClose, anchor);

  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);

  const { booking, room, today } = entry;
  const nights = nightsBetween(booking.check_in, booking.check_out);
  return (
    <div ref={box} className="ax-pop" role="dialog" aria-label={t("pop.label", { code: bookingCode(booking.id) })} tabIndex={-1} style={place} data-testid="calendar-popover">
      <div className="ax-pop__r1">
        <BookingBadge booking={booking} today={today} />
        <span className="ax-code">{bookingCode(booking.id)}</span>
      </div>
      <h3>{booking.guest_name}</h3>
      <dl className="ax-dl">
        <dt>{t("pop.room")}</dt>
        <dd>{room.room_name} · {room.room_type}</dd>
        <dt>{t("pop.stay")}</dt>
        <dd>{stayText(booking.check_in, booking.check_out, lang)} · {t("nights", { count: nights })}</dd>
        <dt>{t("pop.guests")}</dt>
        <dd>{t("pop.guestCount", { count: booking.guests || 1 })}</dd>
        <dt>{t("pop.payment")}</dt>
        <dd>{formatMoney(booking.total_price, lang)} · {t(`payment.${booking.payment_status || "unpaid"}`)}</dd>
        <dt>{t("pop.channel")}</dt>
        <dd>{booking.at_desk ? t("pop.desk") : t("pop.online")}</dd>
      </dl>
      <Link className="g-btn g-btn--primary g-btn--small" to={`/admin/orders?booking=${booking.id}`}>
        {t("pop.open")}
      </Link>
    </div>
  );
}

// Admin: every room on one screen, a week or a month at a time: a row per
// room, grouped by room type, with each stay drawn across its nights.
// Rooms under maintenance are hatched for the whole period (the app keeps no
// dates for maintenance). Data: GET /bookings/timeline.
export default function CalendarPage() {
  const { t, i18n } = useTranslation("calendar");
  const lang = i18n.language;
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "week" ? "week" : "month";
  const anchor = isDateString(params.get("date")) ? params.get("date") : localDateString();
  const type = params.get("type") || "";
  const { from, to } = windowFor(view, anchor);
  const [open, setOpen] = useState(null); // { key, entry }
  const openedFrom = useRef(null);
  const wrap = useRef(null);
  useDocumentTitle(t("title"));

  const { data, loading, error, reload } = useAsyncData(`timeline:${from}:${to}`, () => getBookingTimeline({ from, to }).then((res) => res.data));
  const today = data?.today || localDateString();

  const set = (changes) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
      return next;
    }, { replace: true });
  const step = (direction) => {
    setOpen(null);
    if (view === "week") set({ date: addDays(from, 7 * direction) });
    else set({ date: direction > 0 ? addDays(to, 1) : `${addDays(from, -1).slice(0, 7)}-01` });
  };

  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  const allRooms = data?.rooms || [];
  const types = [...new Set(allRooms.map((room) => room.room_type))];
  const rooms = type ? allRooms.filter((room) => room.room_type === type) : allRooms;
  const groups = [];
  rooms.forEach((room) => {
    if (groups.at(-1)?.type !== room.room_type) groups.push({ type: room.room_type, rooms: [] });
    groups.at(-1).rooms.push(room);
  });
  const byRoom = new Map();
  (data?.bookings || []).forEach((booking) => {
    if (!byRoom.has(booking.room_id)) byRoom.set(booking.room_id, []);
    byRoom.get(booking.room_id).push(booking);
  });

  // Occupancy of the period for the rooms shown: nights of confirmed or
  // finished stays over the nights of rooms on sale.
  const sellable = rooms.filter((room) => room.status !== "maintenance");
  const sellableIds = new Set(sellable.map((room) => room.id));
  let sold = 0;
  (data?.bookings || []).forEach((booking) => {
    if (!sellableIds.has(booking.room_id) || !["confirmed", "completed"].includes(booking.status)) return;
    const start = booking.check_in > from ? booking.check_in : from;
    const end = booking.check_out <= to ? booking.check_out : addDays(to, 1);
    sold += Math.max(0, nightsBetween(start, end));
  });
  const occupancy = sellable.length ? sold / (sellable.length * days.length) : null;

  const columns = `var(--tl-room) repeat(${days.length}, var(--tl-day))`;
  let row = 2;
  const cells = [];
  groups.forEach((group) => {
    cells.push(
      <div key={`g-${group.type}`} className="ax-tl__grp" style={{ gridRow: row, gridColumn: "1 / -1" }} role="presentation">
        {t("group", { type: group.type, count: group.rooms.length })}
      </div>
    );
    row += 1;
    group.rooms.forEach((room) => {
      const r = row;
      cells.push(
        <div key={`r-${room.id}`} className="ax-tl__room" style={{ gridRow: r, gridColumn: 1 }}>
          <b title={room.room_name}>{room.room_name}</b>
          <span>{room.location || room.room_type}</span>
        </div>
      );
      days.forEach((day, i) => {
        const weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
        cells.push(<div key={`c-${room.id}-${day}`} className={`ax-tl__cell${weekend ? " is-we" : ""}${day === today ? " is-today" : ""}`} style={{ gridRow: r, gridColumn: i + 2 }} />);
      });
      if (room.status === "maintenance") {
        cells.push(
          <div key={`m-${room.id}`} className="ax-blk is-block" style={{ gridRow: r, gridColumn: `2 / span ${days.length}` }} role="note">
            <span>{t("maintenance")}</span>
          </div>
        );
      }
      (byRoom.get(room.id) || []).forEach((booking) => {
        const first = booking.check_in > from ? booking.check_in : from;
        const last = addDays(booking.check_out, -1) < to ? addDays(booking.check_out, -1) : to;
        const start = nightsBetween(from, first) + 2;
        const span = nightsBetween(first, last) + 1;
        const state = bookingState(booking, today);
        const nights = nightsBetween(booking.check_in, booking.check_out);
        const key = `b-${booking.id}`;
        const detail = state === "pending" ? t("block.pending") : t("nights", { count: nights });
        cells.push(
          <button
            key={key}
            type="button"
            className={`ax-blk is-${TONE[state] || "neutral"}${booking.check_in < from ? " is-cut-start" : ""}${open?.key === key ? " is-sel" : ""}`}
            style={{ gridRow: r, gridColumn: `${start} / span ${span}` }}
            aria-label={t("block.label", { room: room.room_name, guest: booking.guest_name, stay: stayText(booking.check_in, booking.check_out, lang), state: t(`admin:state.${state}`) })}
            aria-expanded={open?.key === key}
            aria-haspopup="dialog"
            onClick={(event) => {
              openedFrom.current = event.currentTarget;
              setOpen(open?.key === key ? null : { key, entry: { booking, room, today }, place: placeUnder(event.currentTarget, wrap.current) });
            }}
            data-testid="calendar-block"
          >
            <span>{booking.guest_name}</span>
            {span > 1 && <small>{detail}</small>}
          </button>
        );
      });
      row += 1;
    });
  });

  const title = view === "week" ? rangeText(from, to, lang) : monthTitle(from, lang);
  const subtitle = data
    ? [title, occupancy === null ? null : t("occupancy", { value: percent(occupancy, lang, 0) }), t("roomsShown", { count: rooms.length })].filter(Boolean).join(" · ")
    : title;

  let body;
  if (error && !data) {
    body = (
      <div className="ax-state">
        <EmptyState error icon="calendar" title={t("errorTitle", { period: title })} actions={<button type="button" className="g-btn g-btn--primary" onClick={reload}>{t("reload")}</button>} testId="calendar-error">
          {apiErrorText(error, "admin:loadFailed")}
        </EmptyState>
      </div>
    );
  } else if (!data) {
    body = (
      <div className="ax-tl ax-tl--loading" aria-busy="true" data-testid="calendar-loading">
        <Skel height={40} />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="ax-tl__skelrow">
            <Skel width={160} height={40} />
            <Skel height={40} style={{ flex: 1, opacity: 0.6 }} />
          </div>
        ))}
      </div>
    );
  } else if (allRooms.length === 0) {
    body = (
      <div className="ax-state">
        <EmptyState icon="rooms" title={t("emptyTitle")} actions={<Link className="g-btn g-btn--primary" to="/admin/rooms">{t("emptyAction")}</Link>} testId="calendar-empty">
          {t("emptyText")}
        </EmptyState>
      </div>
    );
  } else {
    body = (
      <div className="ax-tl-wrap" ref={wrap}>
        <div className={`ax-tl ax-tl--${view}`} aria-busy={loading}>
          <div className="ax-tl__grid" style={{ gridTemplateColumns: columns }} role="group" aria-label={t("gridLabel", { period: title })} data-testid="calendar-grid">
            <div className="ax-tl__corner" style={{ gridRow: 1, gridColumn: 1 }}>{t("room")}</div>
            {days.map((day, i) => {
              const weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
              return (
                <div key={day} className={`ax-tl__day${weekend ? " is-we" : ""}${day === today ? " is-today" : ""}`} style={{ gridRow: 1, gridColumn: i + 2 }} aria-current={day === today ? "date" : undefined}>
                  {Number(day.slice(8, 10))}
                  <small>{shortWeekday(day)}</small>
                </div>
              );
            })}
            {cells}
          </div>
        </div>
        {open && <Popover key={open.key} entry={open.entry} place={open.place} anchor={openedFrom} onClose={() => setOpen(null)} />}
      </div>
    );
  }

  return (
    <div className="ax-screen ax-screen--tight" data-testid="calendar-page">
      <div className="ax-head">
        <div>
          <Crumbs current={t("title")} />
          <h1>{t("title")}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="ax-actions">
          <div className="ax-stepper">
            <button type="button" className="g-btn g-btn--outline g-btn--small ax-btn-icon" aria-label={view === "week" ? t("prevWeek") : t("prevMonth")} onClick={() => step(-1)}>
              <AxIcon name="chevronLeft" small />
            </button>
            <button type="button" className="g-btn g-btn--outline g-btn--small" onClick={() => { setOpen(null); set({ date: "" }); }}>
              {t("today")}
            </button>
            <button type="button" className="g-btn g-btn--outline g-btn--small ax-btn-icon" aria-label={view === "week" ? t("nextWeek") : t("nextMonth")} onClick={() => step(1)}>
              <AxIcon name="chevronRight" small />
            </button>
          </div>
          <div className="ax-seg" role="group" aria-label={t("viewLabel")}>
            <button type="button" aria-pressed={view === "week"} onClick={() => { setOpen(null); set({ view: "week" }); }}>{t("week")}</button>
            <button type="button" aria-pressed={view === "month"} onClick={() => { setOpen(null); set({ view: "" }); }}>{t("month")}</button>
          </div>
        </div>
      </div>

      <div className="ax-toolbar">
        <div className="ax-chipset" role="group" aria-label={t("typesLabel")}>
          <button type="button" className="ax-chip" aria-pressed={!type} onClick={() => set({ type: "" })}>{t("allTypes")}</button>
          {types.map((name) => (
            <button key={name} type="button" className="ax-chip" aria-pressed={type === name} onClick={() => set({ type: name })}>{name}</button>
          ))}
        </div>
        <div className="ax-tl-legend" aria-label={t("legendLabel")}>
          {LEGEND.map((state) => (
            <span key={state}><i className={`is-${TONE[state]}`} />{t(`legend.${state}`)}</span>
          ))}
          <span><i className="is-block" />{t("legend.maintenance")}</span>
        </div>
      </div>

      {body}
    </div>
  );
}
