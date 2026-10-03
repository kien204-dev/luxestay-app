import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RoomRatingSummary } from "../RoomReviews";
import { normalizeImageUrl, placeholderFor, roomPlaceholder, showFallback } from "../../utils/imageUrl";
import { formatMoney } from "../../utils/format";
import { stayQuery } from "../../utils/stayQuery";

// `fallback` is what to draw when there is no photo (or it fails to load).
export function RoomImage({ src, alt, fallback = roomPlaceholder(), ...rest }) {
  return (
    <img
      src={normalizeImageUrl(src, fallback)}
      alt={alt}
      loading="lazy"
      onError={(event) => showFallback(event, fallback)}
      {...rest}
    />
  );
}

// One room in a grid. `stay` (dates/guests already chosen) travels along in
// the link so the room page opens with them filled in.
export default function RoomCard({ room, stay }) {
  const { t, i18n } = useTranslation("site");

  return (
    <Link to={`/rooms/${room.id}${stayQuery(stay)}`} className="room-card">
      <div className="room-card-media">
        <RoomImage src={room.image} alt={room.room_name} fallback={placeholderFor(room.room_name || room.id)} />
        <span className="room-card-badge">{room.room_type}</span>
      </div>

      <div className="room-card-body">
        <h3>{room.room_name}</h3>
        <div className="room-card-meta">
          {[room.location, t("room.maxGuests", { count: Number(room.capacity) || 1 })]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <RoomRatingSummary roomId={room.id} />

        <div className="room-card-footer">
          <span className="room-price">
            {formatMoney(room.price, i18n.language)} <small>{t("room.perNight")}</small>
          </span>
          <span className="g-btn g-btn--outline g-btn--small">{t("room.view")}</span>
        </div>
      </div>
    </Link>
  );
}
