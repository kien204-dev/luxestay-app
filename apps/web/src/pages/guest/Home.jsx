import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SearchBar from "../../components/guest/SearchBar";
import RoomCard, { RoomImage } from "../../components/guest/RoomCard";
import { getRoomDestinations, getRooms } from "../../services/roomService";
import { useAsyncData } from "../../utils/useAsyncData";
import { useBookingPolicy } from "../../utils/useBookingPolicy";
import { useDocumentTitle } from "../../utils/useDocumentTitle";
import { formatMoney } from "../../utils/format";
import { placeholderFor } from "../../utils/imageUrl";
import { searchToQuery } from "../../utils/stayQuery";
import { useProperty } from "../../context/PropertyContext";

const FEATURED_COUNT = 6;
const DESTINATION_COUNT = 8;

// CC BY and CC BY-SA photos must name their author and licence where they
// are shown. The full credit, with links, is on the /credits page.
function PhotoCredit({ credit }) {
  const { t } = useTranslation("site");
  if (!credit) return null;

  const full = [credit.title, credit.author, credit.license].filter(Boolean).join(" · ");
  if (!/^CC BY/i.test(credit.license || "")) return <span className="sr-only">{full}</span>;

  return (
    <span className="dest-card-credit" title={full}>
      {t("home.photoCredit", { author: credit.author, license: credit.license })}
    </span>
  );
}

function Destinations() {
  const { t, i18n } = useTranslation("site");
  const { data } = useAsyncData("destinations", getRoomDestinations);
  const destinations = Array.isArray(data) ? data.slice(0, DESTINATION_COUNT) : [];

  // Real places only: with nothing in the database the section is left out.
  if (destinations.length === 0) return null;

  return (
    <section className="guest-section" style={{ paddingBottom: 0 }}>
      <div className="guest-container">
        <span className="guest-eyebrow">{t("home.destinationsEyebrow")}</span>
        <h2 className="guest-section-title">{t("home.destinationsTitle")}</h2>

        <div className="dest-grid">
          {destinations.map((destination) => (
            <Link
              key={destination.name}
              to={`/rooms?location=${encodeURIComponent(destination.name)}`}
              className="dest-card"
            >
              <RoomImage
                src={destination.image}
                alt={destination.place ? `${destination.place} – ${destination.name}` : destination.name}
                fallback={placeholderFor(destination.name, "place")}
              />
              <PhotoCredit credit={destination.credit} />
              <div className="dest-card-body">
                <strong>{destination.name}</strong>
                <span>
                  {t("home.destinationMeta", {
                    count: destination.room_count,
                    price: formatMoney(destination.min_price, i18n.language),
                  })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedRooms() {
  const { t } = useTranslation("site");
  const { data, loading, error, reload } = useAsyncData("featured-rooms", () =>
    getRooms({ bookable: true, limit: FEATURED_COUNT, sortBy: "created_at", sortOrder: "desc" })
  );
  const rooms = data?.data || [];

  return (
    <section className="guest-section">
      <div className="guest-container">
        <span className="guest-eyebrow">{t("home.roomsEyebrow")}</span>
        <h2 className="guest-section-title">{t("home.roomsTitle")}</h2>

        {loading && !data ? (
          <div className="room-grid" aria-busy="true">
            {Array.from({ length: 3 }, (_, i) => (
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
            <p>{t("list.noRoomsYet")}</p>
          </div>
        ) : (
          <>
            <div className="room-grid">
              {rooms.map((room) => (
                <RoomCard key={room.id} room={room} />
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <Link to="/rooms" className="g-btn g-btn--primary">
                {t("home.viewAllRooms")}
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// Three statements about how booking here works. Each one is true of the
// software itself (live availability, the configured cancellation window,
// payment through the gateway), not marketing copy to be taken on trust.
function WhyBookDirect() {
  const { t } = useTranslation("site");
  const policy = useBookingPolicy();

  const items = [
    { title: t("home.why.availabilityTitle"), text: t("home.why.availabilityText") },
    {
      title: t("home.why.cancelTitle"),
      text: policy
        ? t("home.why.cancelText", { count: policy.freeCancellationDays })
        : t("home.why.cancelTextGeneric"),
    },
    { title: t("home.why.paymentTitle"), text: t("home.why.paymentText") },
  ];

  return (
    <section className="guest-section" style={{ paddingTop: 0 }}>
      <div className="guest-container">
        <span className="guest-eyebrow">{t("home.whyEyebrow")}</span>
        <h2 className="guest-section-title">{t("home.whyTitle")}</h2>
        <div className="why-grid">
          {items.map((item) => (
            <div key={item.title} className="why-item">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { t } = useTranslation("site");
  const navigate = useNavigate();
  const property = useProperty();
  useDocumentTitle(t("home.documentTitle"));

  return (
    <>
      <section
        className={`guest-hero${property.heroImageUrl ? " guest-hero--photo" : ""}`}
        style={property.heroImageUrl ? { "--hero-image": `url("${property.heroImageUrl}")` } : undefined}
        data-testid="home-hero"
      >
        <div className="guest-container">
          <h1>{t("home.heroTitle")}</h1>
          <p>{t("home.heroSubtitle", { brand: property.name })}</p>
          <SearchBar onSearch={(search) => navigate(`/rooms${searchToQuery(search)}`)} />
        </div>
      </section>

      <Destinations />
      <FeaturedRooms />
      <WhyBookDirect />
    </>
  );
}
