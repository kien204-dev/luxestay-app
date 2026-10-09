import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import RoomCard from "../../../components/guest/RoomCard";
import StateMessage from "../../../components/guest/StateMessage";
import GuestIcon from "../../../components/guest/icons";
import { useProperty } from "../../../context/PropertyContext";
import { getRooms } from "../../../services/roomService";
import { useAsyncData } from "../../../utils/useAsyncData";

// The newest bookable rooms: one large card and two beside it.
const FEATURED_COUNT = 3;

// Blocks in the shape of the cards, so the page does not jump when they load.
function Loading() {
  const { t } = useTranslation("site");

  return (
    <div className="home-rooms" aria-busy="true">
      <span className="sr-only" role="status">{t("home.rooms.loading")}</span>
      <div className="home-rooms-lead">
        <span className="luxe-skeleton-light" style={{ aspectRatio: "5 / 4" }} />
        <span className="luxe-skeleton-light home-skeleton-line" style={{ width: "50%" }} />
        <span className="luxe-skeleton-light" style={{ height: 40, width: "70%" }} />
        <span className="luxe-skeleton-light home-skeleton-line" style={{ width: "90%" }} />
        <span className="luxe-skeleton-light" style={{ height: 34, width: "40%" }} />
      </div>
      <div className="home-rooms-stack">
        {[0, 1].map((i) => (
          <div key={i} className="home-skeleton">
            <span className="luxe-skeleton-light" style={{ aspectRatio: "16 / 10" }} />
            <span className="luxe-skeleton-light home-skeleton-line" style={{ width: "55%" }} />
            <span className="luxe-skeleton-light home-skeleton-title" style={{ width: "75%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FeaturedRooms() {
  const { t } = useTranslation("site");
  const property = useProperty();
  const { data, loading, error, reload } = useAsyncData("featured-rooms", () =>
    getRooms({ bookable: true, limit: FEATURED_COUNT, sortBy: "created_at", sortOrder: "desc" })
  );
  const [lead, ...others] = data?.data || [];
  const state = loading && !data ? "loading" : error ? "error" : lead ? "ready" : "empty";

  // Offered beside "try again" only when the property has published a number.
  const call = property.phone && (
    <a className="g-btn g-btn--link" href={`tel:${property.phone.replace(/[^\d+]/g, "")}`}>
      {t("home.rooms.call", { phone: property.phone })}
    </a>
  );

  return (
    <section className="guest-section" data-testid="featured-rooms" data-state={state}>
      <div className="guest-container">
        <div className="home-sechead">
          <div>
            <p className="guest-eyebrow">{t("home.roomsEyebrow")}</p>
            <h2 className="guest-section-title">{t("home.roomsTitle")}</h2>
          </div>
          {state === "ready" && (
            <Link to="/rooms" className="guest-textlink">
              <span>{t("home.viewAllRooms")}</span>
              <GuestIcon.Arrow small />
            </Link>
          )}
        </div>

        {state === "loading" && <Loading />}
        {state === "error" && (
          <StateMessage error title={t("home.rooms.errorTitle")} text={t("home.rooms.errorText")}>
            <button type="button" className="g-btn g-btn--primary" onClick={reload}>
              <GuestIcon.Retry />
              {t("list.retry")}
            </button>
            {call}
          </StateMessage>
        )}
        {state === "empty" && (
          <StateMessage title={t("home.rooms.emptyTitle")} text={t("home.rooms.emptyText")}>
            {call}
          </StateMessage>
        )}
        {state === "ready" && (
          <div className="home-rooms">
            <RoomCard room={lead} lead />
            {others.length > 0 && (
              <div className="home-rooms-stack">
                {others.map((room) => (
                  <RoomCard key={room.id} room={room} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
