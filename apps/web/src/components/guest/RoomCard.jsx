import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RoomRatingSummary } from "../RoomReviews";
import { normalizeImageUrl, placeholderFor, roomPlaceholder, showFallback } from "../../utils/imageUrl";
import { formatMoney } from "../../utils/format";
import { stayQuery } from "../../utils/stayQuery";
import GuestIcon from "./icons";

// `fallback` is what to draw when there is no photo (or it fails to load).
// Photos are cropped to their frame by CSS; width/height give the browser a
// 4:3 box to reserve before the file arrives. Pass loading="eager" for a
// photo that is on screen when the page opens.
export function RoomImage({ src, alt, fallback = roomPlaceholder(), ...rest }) {
  return (
    <img
      src={normalizeImageUrl(src, fallback)}
      alt={alt}
      width={800}
      height={600}
      loading="lazy"
      decoding="async"
      onError={(event) => showFallback(event, fallback)}
      {...rest}
    />
  );
}

// One room in a grid. `stay` (dates/guests already chosen) travels along in
// the link so the room page opens with them filled in. `lead` is the large
// card of the home page: a taller photo and the room's description.
export default function RoomCard({ room, stay, lead = false }) {
  const { t, i18n } = useTranslation("site");

  return (
    <article className={`room-card${lead ? " room-card--lead" : ""}`}>
      <div className="room-card-media guest-photo">
        <span className="room-card-badge">{room.room_type}</span>
        <RoomImage src={room.image} alt="" fallback={placeholderFor(room.room_name || room.id)} />
      </div>

      <div className="room-card-body">
        <div className="room-card-meta">
          <span>
            <GuestIcon.Guests small />
            {t("room.maxGuests", { count: Number(room.capacity) || 1 })}
          </span>
          {room.location && (
            <span>
              <GuestIcon.Pin small />
              {room.location}
            </span>
          )}
        </div>
        <h3>
          <Link to={`/rooms/${room.id}${stayQuery(stay)}`}>{room.room_name}</Link>
        </h3>
        {lead && room.description && <p className="room-card-desc">{room.description}</p>}

        <div className="room-card-footer">
          <span className="room-price">
            {formatMoney(room.price, i18n.language)} <small>{t("room.perNight")}</small>
          </span>
          <RoomRatingSummary roomId={room.id} />
        </div>
      </div>
    </article>
  );
}
