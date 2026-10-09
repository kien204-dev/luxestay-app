import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SearchBar from "../../components/guest/SearchBar";
import { formatRating } from "../../components/RoomReviews";
import { StarIcon } from "../../components/guest/icons";
import { getFeaturedReviews } from "../../services/reviewService";
import { useAsyncData } from "../../utils/useAsyncData";
import { useBookingPolicy } from "../../utils/useBookingPolicy";
import { useDocumentTitle } from "../../utils/useDocumentTitle";
import { searchToQuery } from "../../utils/stayQuery";
import { useProperty } from "../../context/PropertyContext";
import Destinations from "./home/Destinations";
import FeaturedRooms from "./home/FeaturedRooms";
import GuestVoices from "./home/GuestVoices";
import "../../styles/home.css";

// Everything on this page comes from data: the property's settings
// (/admin/property), its rooms, destinations and reviews. A section with
// nothing real to show is left out rather than filled with sample text.

// A score from one or two reviews says little and is easy to skew, so the
// hero's score and the guest quotes wait for this many visible reviews.
const MIN_REVIEWS_TO_SHOW = 3;

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
    <section className="guest-section">
      <div className="guest-container">
        <div className="home-sechead">
          <div>
            <p className="guest-eyebrow">{t("home.whyEyebrow")}</p>
            <h2 className="guest-section-title">{t("home.whyTitle")}</h2>
          </div>
        </div>
        <div className="home-facts">
          {items.map((item) => (
            <div key={item.title} className="home-fact">
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// What the property offers, as its admin listed it. The band reuses the home
// page photo when there is one.
function Amenities() {
  const { t } = useTranslation("site");
  const property = useProperty();
  if (property.amenities.length === 0) return null;

  return (
    <section className="guest-section home-dark" data-testid="amenities">
      <div className="guest-container home-amenities">
        {property.heroImageUrl && (
          <div className="home-amenities-photo guest-photo">
            <img src={property.heroImageUrl} alt="" width={1200} height={1500} loading="lazy" decoding="async" />
          </div>
        )}
        <div className="home-amenities-body">
          <div>
            <p className="guest-eyebrow">{t("home.amenitiesEyebrow")}</p>
            <h2 className="guest-section-title">{t("home.amenitiesTitle")}</h2>
          </div>
          <ul className="home-amenities-list">
            {property.amenities.map((amenity, index) => (
              <li key={index}>
                <b>{amenity.name}</b>
                {amenity.description && <span>{amenity.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// The address and how far the places around it are, as the admin listed
// them. Shown once there is at least one nearby place.
function Location() {
  const { t } = useTranslation("site");
  const property = useProperty();
  if (property.nearbyPlaces.length === 0) return null;

  return (
    <section className="guest-section" data-testid="location">
      <div className="guest-container home-location">
        <div className="home-location-info">
          <div>
            <p className="guest-eyebrow">{t("home.locationEyebrow")}</p>
            <h2 className="guest-section-title">{t("home.locationTitle")}</h2>
          </div>
          {property.address && (
            <>
              <address>{property.address}</address>
              <a
                className="g-btn g-btn--primary"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.address)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("home.directions")}
              </a>
            </>
          )}
        </div>
        <ul className="home-distances">
          {property.nearbyPlaces.map((place, index) => (
            <li key={index}>
              <div>
                <b>{place.name}</b>
                {place.note && <small>{place.note}</small>}
              </div>
              {place.distance && <span>{place.distance}</span>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default function Home() {
  const { t, i18n } = useTranslation("site");
  const navigate = useNavigate();
  const property = useProperty();
  // One request serves both the score in the hero and the quotes below.
  const { data } = useAsyncData("featured-reviews", getFeaturedReviews);
  const reviews = data?.totalReviews >= MIN_REVIEWS_TO_SHOW ? data : null;
  useDocumentTitle(t("home.documentTitle"));

  return (
    <>
      <section className="home-hero" data-testid="home-hero">
        {property.heroImageUrl && (
          <>
            <img
              className="home-hero-photo"
              src={property.heroImageUrl}
              alt=""
              width={2400}
              height={1350}
              fetchPriority="high"
              decoding="async"
            />
            <div className="home-hero-veil" />
          </>
        )}

        <div className="guest-container home-hero-inner">
          <div className="home-hero-copy">
            <div>
              {property.address && <p className="home-hero-kicker">{property.address}</p>}
              <h1>{property.heroTitle || t("home.heroTitle")}</h1>
            </div>
            <div className="home-hero-side">
              <p>{property.heroSubtitle || t("home.heroSubtitle", { brand: property.name })}</p>
              {/* Only once enough guests have left reviews. */}
              <p className="home-hero-rating" data-testid="hero-rating">
                {reviews && (
                  <>
                    <StarIcon />
                    {t("home.ratingOutOfFive", { score: formatRating(reviews.averageRating, i18n.language) })}
                    <span>· {t("reviews.count", { count: reviews.totalReviews })}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <SearchBar onSearch={(search) => navigate(`/rooms${searchToQuery(search)}`)} />
        </div>
      </section>

      <WhyBookDirect />
      <FeaturedRooms />
      <Destinations />
      <Amenities />
      <GuestVoices reviews={reviews} />
      <Location />
    </>
  );
}
