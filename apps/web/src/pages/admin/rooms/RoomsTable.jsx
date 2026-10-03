import { useTranslation } from "react-i18next";
import { Badge, SkeletonRows } from "../../../components/admin/ui";
import { formatMoney } from "../../../utils/format";
import { normalizeImageUrl, placeholderFor, showFallback } from "../../../utils/imageUrl";
import useIsMobile from "../../../utils/useIsMobile";
import { STATUS_TONE } from "./roomStatus";

function Thumb({ room }) {
  const fallback = placeholderFor(room.room_name || room.id);
  return <img className="adm-thumb" src={normalizeImageUrl(room.image, fallback)} alt="" onError={(e) => showFallback(e, fallback)} />;
}

// One page of rooms: a table on wide screens, cards on phones.
export default function RoomsTable({ rooms, loading, deletingId, onEdit, onDelete }) {
  const { t, i18n } = useTranslation("rooms");
  const isMobile = useIsMobile();
  const status = (room) => (
    <Badge tone={STATUS_TONE[room.status] || "neutral"}>{t(`status.${room.status}`, { defaultValue: room.status })}</Badge>
  );
  const actions = (room, small) => (
    <>
      <button type="button" className={`adm-btn adm-btn--ghost ${small ? "adm-btn--small" : "adm-btn--small"}`} onClick={() => onEdit(room)}>
        {t("admin:edit")}
      </button>
      <button type="button" className="adm-btn adm-btn--muted adm-btn--small" onClick={() => onDelete(room)} disabled={deletingId === room.id} style={{ color: "var(--color-danger)" }}>
        {t("admin:delete")}
      </button>
    </>
  );

  if (isMobile) {
    if (loading) return <div className="adm-cards"><div className="luxe-skeleton" style={{ height: 120 }} /></div>;
    return (
      <div className="adm-cards">
        {rooms.map((room) => (
          <div key={room.id} className="adm-card">
            <div className="adm-person">
              <Thumb room={room} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{room.room_name}</div>
                <div className="adm-cell-sub">#{room.id} · {room.room_type}</div>
              </div>
              {status(room)}
            </div>
            <div className="adm-card-row">
              <span>{t("perNight", { price: formatMoney(room.price, i18n.language) })}</span>
              <span>{t("guests", { count: Number(room.capacity) || 0 })}</span>
            </div>
            <div className="adm-card-actions">{actions(room, true)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="adm-table-wrap">
      <table className="adm-table" style={{ minWidth: 860 }} data-testid="rooms-table">
        <thead>
          <tr>
            <th>{t("columns.room")}</th>
            <th>{t("columns.type")}</th>
            <th>{t("columns.location")}</th>
            <th>{t("columns.price")}</th>
            <th>{t("columns.capacity")}</th>
            <th>{t("columns.status")}</th>
            <th className="is-right">{t("columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows rows={5} columns={7} />
          ) : (
            rooms.map((room) => (
              <tr key={room.id}>
                <td>
                  <div className="adm-person">
                    <Thumb room={room} />
                    <div>
                      <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{room.room_name}</div>
                      <div className="adm-cell-sub">#{room.id}</div>
                    </div>
                  </div>
                </td>
                <td>{room.room_type}</td>
                <td>{room.location || "—"}</td>
                <td>{formatMoney(room.price, i18n.language)}</td>
                <td>{t("guests", { count: Number(room.capacity) || 0 })}</td>
                <td>{status(room)}</td>
                <td className="is-right">
                  <div className="adm-row-actions">{actions(room)}</div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
