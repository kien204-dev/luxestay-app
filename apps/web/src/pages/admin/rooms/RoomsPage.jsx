import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AxIcon from "../../../components/admin/AxIcon";
import { Crumbs, EmptyState, Pager, Skel } from "../../../components/admin/ax";
import ConfirmModal from "../../../components/ConfirmModal";
import { useToast } from "../../../context/ToastContext";
import { deleteRoom, getRoomStatusCounts, getRoomTypes, getRooms } from "../../../services/roomService";
import { apiErrorText } from "../../../utils/apiError";
import { formatMoney } from "../../../utils/format";
import { normalizeImageUrl, placeholderFor, showFallback } from "../../../utils/imageUrl";
import { useAsyncData } from "../../../utils/useAsyncData";
import { useDocumentTitle } from "../../../utils/useDocumentTitle";
import { PHONE_QUERY, useMedia } from "../../../utils/useMedia";
import { ROOM_STATUSES, STATUS_TONE } from "./roomStatus";

const PAGE_SIZE = 10;

export function RoomThumb({ room, large = false }) {
  const fallback = placeholderFor(room.room_name || room.id);
  if (!room.image) {
    return (
      <span className={`ax-thumb ax-thumb--empty${large ? " ax-thumb--lg" : ""}`} aria-hidden="true">
        <AxIcon name="file" />
      </span>
    );
  }
  return <img className={`ax-thumb${large ? " ax-thumb--lg" : ""}`} src={normalizeImageUrl(room.image, fallback)} alt="" loading="lazy" onError={(e) => showFallback(e, fallback)} />;
}

function photosText(t, room) {
  const count = (room.image ? 1 : 0) + (room.image_count || 0);
  return count ? t("list.photos", { count }) : t("list.noPhotos");
}

// Admin: every room, a page at a time from the server, searched by name or
// type and filtered by status and type; a room opens in its own page to
// edit. Deleting asks for the room's code (and the API refuses a room that
// has bookings).
export default function RoomsPage() {
  const { t, i18n } = useTranslation("rooms");
  const lang = i18n.language;
  const toast = useToast();
  const navigate = useNavigate();
  const phone = useMedia(PHONE_QUERY);
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "";
  const status = ROOM_STATUSES.includes(params.get("status")) ? params.get("status") : "";
  const type = params.get("type") || "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [text, setText] = useState(q);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [version, setVersion] = useState(0);
  useDocumentTitle(t("title"));

  const update = (changes) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, String(value)) : next.delete(key)));
      if (!("page" in changes)) next.delete("page");
      return next;
    }, { replace: true });

  // The search waits for a pause in typing.
  useEffect(() => {
    if (text.trim() === q) return undefined;
    const timer = setTimeout(() => update({ q: text.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const query = { page, limit: PAGE_SIZE, sortBy: "name", sortOrder: "asc", ...(q && { q }), ...(status && { status }), ...(type && { roomType: type }) };
  const list = useAsyncData(`rooms:${JSON.stringify(query)}:${version}`, () => getRooms(query));
  const counts = useAsyncData(`room-counts:${version}`, getRoomStatusCounts);
  const types = useAsyncData(`room-types:${version}`, getRoomTypes);
  const rooms = list.data?.data || [];
  const pagination = list.data?.pagination;
  const filtered = Boolean(q || status || type);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteRoom(toDelete.id);
      toast.success(t("toast.deleted", { name: toDelete.room_name }));
      setVersion((v) => v + 1);
      setToDelete(null);
    } catch (err) {
      toast.error(apiErrorText(err, "rooms:deleteFailed"));
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const statusBadge = (room) => (
    <span className={`ax-badge ax-badge--${STATUS_TONE[room.status] || "neutral"}`}>{t(`status.${room.status}`, { defaultValue: room.status })}</span>
  );
  const actions = (room) => (
    <span className="ax-rowactions">
      <Link className="g-btn g-btn--small ax-btn-sm ax-btn-ghost" to={`/admin/rooms/${room.id}`}>{t("admin:edit")}</Link>
      <button type="button" className="ax-iconbtn ax-iconbtn--sm is-danger" aria-label={t("list.delete", { name: room.room_name })} title={t("admin:delete")} onClick={() => setToDelete(room)}>
        <AxIcon name="trash" small />
      </button>
    </span>
  );

  let content;
  if (list.error && !list.data) {
    content = (
      <EmptyState error icon="alert" title={t("states.errorTitle")} actions={<button type="button" className="g-btn g-btn--primary" onClick={list.reload}>{t("admin:retry")}</button>} testId="rooms-error">
        {apiErrorText(list.error, "admin:loadFailed")}
      </EmptyState>
    );
  } else if (!list.data) {
    content = (
      <div className="ax-skelrows" aria-busy="true" data-testid="rooms-loading">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="ax-skelrow">
            <Skel width={64} height={48} />
            <Skel variant="text" width={220} />
            <Skel variant="text" width={90} />
            <Skel variant="text" width={60} />
            <Skel variant="text" width={110} style={{ marginLeft: "auto" }} />
            <Skel width={86} height={24} />
          </div>
        ))}
      </div>
    );
  } else if (rooms.length === 0) {
    content = (
      <EmptyState
        icon={filtered ? "search" : "rooms"}
        title={q ? t("states.noMatch", { term: q }) : filtered ? t("states.noneHere") : t("states.none")}
        actions={
          <>
            {filtered && (
              <button type="button" className="g-btn g-btn--outline" onClick={() => { setText(""); update({ q: "", status: "", type: "" }); }}>
                {t("states.clear")}
              </button>
            )}
            <Link className="g-btn g-btn--primary" to="/admin/rooms/new">{t("add")}</Link>
          </>
        }
        testId="rooms-empty"
      >
        {filtered ? t("states.noMatchHelp") : t("states.noneHelp")}
      </EmptyState>
    );
  } else if (phone) {
    content = (
      <div className="ax-ocards" data-testid="rooms-cards">
        {rooms.map((room) => (
          <div key={room.id} className="ax-ocard ax-rcard">
            <button type="button" className="ax-rcard__main" onClick={() => navigate(`/admin/rooms/${room.id}`)}>
              <RoomThumb room={room} />
              <span>
                <span className="ax-ocard__name">{room.room_name}</span>
                <span className="ax-ocard__meta">{room.room_type} · {t("list.guests", { count: room.capacity })}</span>
                <span className="ax-ocard__meta">{formatMoney(room.price, lang)}</span>
              </span>
            </button>
            <span className="ax-ocard__r3">
              {statusBadge(room)}
              {actions(room)}
            </span>
          </div>
        ))}
      </div>
    );
  } else {
    content = (
      <table className="ax-table" data-testid="rooms-table">
        <thead>
          <tr>
            <th scope="col">{t("list.room")}</th>
            <th scope="col">{t("list.type")}</th>
            <th scope="col" className="is-num">{t("list.capacity")}</th>
            <th scope="col" className="is-num">{t("list.price")}</th>
            <th scope="col">{t("list.status")}</th>
            <th scope="col"><span className="sr-only">{t("list.actions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <tr key={room.id} data-testid="room-row">
              <td>
                <div className="ax-person">
                  <RoomThumb room={room} />
                  <div className="ax-cellmain">
                    <Link className="ax-rowlink" to={`/admin/rooms/${room.id}`}><b>{room.room_name}</b></Link>
                    <div className="ax-sub">{[room.location, photosText(t, room)].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
              </td>
              <td>{room.room_type}</td>
              <td className="is-num">{room.capacity}</td>
              <td className="is-num">{formatMoney(room.price, lang)}</td>
              <td>{statusBadge(room)}</td>
              <td className="is-right">{actions(room)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const c = counts.data;
  const chips = [
    { key: "", label: t("filter.all"), count: c?.all },
    { key: "available", label: t("status.available"), count: c?.available },
    { key: "booked", label: t("status.booked"), count: c?.booked },
    { key: "maintenance", label: t("status.maintenance"), count: c?.maintenance },
  ];

  return (
    <div className="ax-screen" data-testid="rooms-page">
      <div className="ax-head">
        <div>
          <Crumbs current={t("title")} />
          <h1>{t("title")}</h1>
          <p>
            {c
              ? [t("head.rooms", { count: c.all }), types.data ? t("head.types", { count: types.data.length }) : null, c.maintenance ? t("head.maintenance", { count: c.maintenance }) : null].filter(Boolean).join(" · ")
              : t("head.loading")}
          </p>
        </div>
        <div className="ax-actions">
          <Link className="g-btn g-btn--primary" to="/admin/rooms/new" data-testid="room-add">
            <AxIcon name="plus" small />
            {t("add")}
          </Link>
        </div>
      </div>

      <section className="ax-tablewrap" aria-label={t("list.label")} aria-busy={list.loading}>
        <div className="ax-tablebar">
          <div className="fx-control ax-tsearch">
            <AxIcon name="search" />
            <input type="search" aria-label={t("filter.search")} placeholder={t("filter.searchPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="ax-chipset" role="group" aria-label={t("filter.status")}>
            {chips.map((chip) => (
              <button key={chip.key || "all"} type="button" className="ax-chip" aria-pressed={status === chip.key} onClick={() => update({ status: chip.key })} data-testid={`room-filter-${chip.key || "all"}`}>
                {chip.label}
                {chip.count !== undefined && ` · ${chip.count}`}
              </button>
            ))}
          </div>
          <label className="ax-chip" data-active={Boolean(type) || undefined}>
            <span className="sr-only">{t("filter.type")}</span>
            <select value={type} onChange={(e) => update({ type: e.target.value })}>
              <option value="">{t("filter.anyType")}</option>
              {(types.data || []).map((item) => (
                <option key={item.type} value={item.type}>{item.type}</option>
              ))}
            </select>
          </label>
        </div>
        <div className={phone ? "ax-tablebody ax-tablebody--cards" : "ax-tablebody"}>{content}</div>
        {pagination && rooms.length > 0 && (
          <Pager
            page={Number(pagination.page)}
            totalPages={Number(pagination.totalPages)}
            total={Number(pagination.total)}
            limit={Number(pagination.limit)}
            onPage={(next) => update({ page: next })}
            ofText={t("list.of", { count: pagination.total })}
            testId="rooms-pagination"
          />
        )}
      </section>

      <ConfirmModal
        open={Boolean(toDelete)}
        title={t("confirm.deleteTitle")}
        message={t("confirm.deleteMessage", { name: toDelete?.room_name })}
        confirmLabel={t("admin:delete")}
        tone="danger"
        // Gone for good, photos included: typed to confirm.
        confirmCode={toDelete ? `ROOM-${toDelete.id}` : undefined}
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
