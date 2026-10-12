import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Dialog, { CloseIcon } from "../../components/Dialog";
import AvailabilityCalendar from "../../components/guest/AvailabilityCalendar";
import BookingPanel from "../../components/guest/BookingPanel";
import CancellationPolicy from "../../components/guest/CancellationPolicy";
import { RoomImage } from "../../components/guest/RoomCard";
import StateMessage from "../../components/guest/StateMessage";
import GuestIcon from "../../components/guest/icons";
import RoomReviews, { RoomRatingSummary } from "../../components/RoomReviews";
import { useProperty } from "../../context/PropertyContext";
import { getRoomById } from "../../services/roomService";
import { useAsyncData } from "../../utils/useAsyncData";
import { useBookingPolicy } from "../../utils/useBookingPolicy";
import { useDocumentTitle } from "../../utils/useDocumentTitle";
import { formatMoney } from "../../utils/format";
import { placeholderFor } from "../../utils/imageUrl";
import { readStay, stayQuery, writeStay } from "../../utils/stayQuery";
import "../../styles/rooms.css";

// The gallery full screen: one photo at a time, with previous/next (also the
// ← and → keys), a strip of thumbnails, and Escape or "Close" to leave. It is
// a modal dialog, so focus stays inside it.
function Lightbox({ room, photos, start, onClose }) {
  const { t } = useTranslation("site");
  const [index, setIndex] = useState(start);
  const step = (by) => setIndex((current) => (current + by + photos.length) % photos.length);

  return (
    <Dialog
      className="lightbox theme-dark"
      onClose={onClose}
      aria-label={t("detail.galleryOf", { name: room.room_name })}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") step(-1);
        if (event.key === "ArrowRight") step(1);
      }}
      data-testid="lightbox"
    >
      <div className="lightbox-top">
        <span aria-live="polite" data-testid="lightbox-position">{t("detail.photoPosition", { current: index + 1, total: photos.length })}</span>
        <span className="lightbox-name">{room.room_name}</span>
        <button type="button" className="ui-button" onClick={onClose} data-autofocus>
          <CloseIcon />
          {t("detail.closeGallery")}
        </button>
      </div>

      <div className="lightbox-stage">
        <button type="button" className="lightbox-nav" aria-label={t("detail.previousPhoto")} onClick={() => step(-1)} disabled={photos.length < 2}>
          <GuestIcon.Previous />
        </button>
        <RoomImage
          key={photos[index]}
          src={photos[index]}
          alt={t("detail.photoAlt", { name: room.room_name, number: index + 1 })}
          loading="eager"
        />
        <button type="button" className="lightbox-nav" aria-label={t("detail.nextPhoto")} onClick={() => step(1)} disabled={photos.length < 2}>
          <GuestIcon.Next />
        </button>
      </div>

      {photos.length > 1 && (
        <div className="lightbox-thumbs">
          {photos.map((photo, i) => (
            <button
              key={`${photo}-${i}`}
              type="button"
              aria-label={t("detail.showPhoto", { number: i + 1 })}
              aria-current={i === index ? "true" : undefined}
              onClick={() => setIndex(i)}
            >
              <RoomImage src={photo} alt="" width={176} height={120} />
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

// Up to five photos in a mosaic (one on a phone); each opens the lightbox.
const MOSAIC_SIZE = 5;

function Gallery({ room }) {
  const { t } = useTranslation("site");
  const photos = [room.image, ...(room.images || []).map((image) => image.image_path)].filter(Boolean);
  const [openAt, setOpenAt] = useState(null);
  const fallback = placeholderFor(room.room_name || room.id);

  // No photo at all: the drawn placeholder, and nothing to open.
  if (photos.length === 0) {
    return (
      <div className="gallery gallery--1">
        <div className="guest-photo">
          <RoomImage src="" alt="" fallback={fallback} loading="eager" />
        </div>
      </div>
    );
  }

  const shown = photos.slice(0, MOSAIC_SIZE);

  return (
    <div className={`gallery gallery--${shown.length}`} data-testid="gallery">
      {shown.map((photo, index) => (
        <button
          key={`${photo}-${index}`}
          type="button"
          className="guest-photo"
          aria-label={t("detail.openPhoto", { number: index + 1, total: photos.length })}
          onClick={() => setOpenAt(index)}
        >
          <RoomImage
            src={photo}
            alt={t("detail.photoAlt", { name: room.room_name, number: index + 1 })}
            fallback={fallback}
            loading={index === 0 ? "eager" : "lazy"}
            fetchPriority={index === 0 ? "high" : undefined}
          />
        </button>
      ))}
      {photos.length > 1 && (
        <button type="button" className="g-btn g-btn--outline gallery-all" onClick={() => setOpenAt(0)}>
          <GuestIcon.Grid small />
          {t("detail.allPhotos", { count: photos.length })}
        </button>
      )}
      <span className="gallery-count" aria-hidden="true">1 / {photos.length}</span>

      {openAt !== null && <Lightbox room={room} photos={photos} start={openAt} onClose={() => setOpenAt(null)} />}
    </div>
  );
}

// Blocks in the shape of the page while the room loads.
function Loading() {
  const { t } = useTranslation("site");
  const block = (style) => <span className="luxe-skeleton-light" style={style} />;

  return (
    <div className="guest-container room-page" aria-busy="true" data-testid="room-loading">
      <span className="sr-only" role="status">{t("detail.loading")}</span>
      {/* The same boxes as the real heading, so the photos do not move when it arrives. */}
      <div className="page-head page-head--tight">
        <div className="room-loading-line">{block({ height: 12, width: 180 })}</div>
      </div>
      <div className="detail-header">
        {block({ height: 16, width: 160 })}
        <span className="luxe-skeleton-light room-loading-title" />
        <div className="room-loading-line">{block({ height: 12, width: 300, maxWidth: "60%" })}</div>
      </div>
      <div className="gallery gallery--5">
        {Array.from({ length: MOSAIC_SIZE }, (_, i) => <span key={i} className="luxe-skeleton-light guest-photo" />)}
      </div>
      <div className="detail-layout">
        <div className="room-loading-main">
          <div className="detail-facts">{Array.from({ length: 4 }, (_, i) => <span key={i} className="luxe-skeleton-light" style={{ height: 96 }} />)}</div>
          {block({ height: 12 })}
          {block({ height: 12, width: "92%" })}
          {block({ height: 12, width: "80%" })}
          {block({ height: 320, marginTop: 40 })}
        </div>
        <div className="booking-panel room-loading-panel">
          {block({ height: 28, width: "60%" })}
          {block({ height: 128 })}
          {block({ height: 52 })}
        </div>
      </div>
    </div>
  );
}

export default function RoomDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation("site");
  const [searchParams, setSearchParams] = useSearchParams();
  const stay = readStay(searchParams);
  const policy = useBookingPolicy();
  const property = useProperty();

  const { data: room, loading, error, reload } = useAsyncData(`room:${id}`, () => getRoomById(id));
  // While switching rooms, `room` is still the previous one for a moment.
  const current = room && String(room.id) === String(id) ? room : null;
  useDocumentTitle(current?.room_name || t("detail.documentTitle"));

  const setStay = (next) => setSearchParams(writeStay(next), { replace: true });
  const backToList = `/rooms${stayQuery(stay)}`;

  if (!current && loading) return <Loading />;

  if (!current) {
    const notFound = [400, 404].includes(error?.response?.status);

    return (
      <div className="guest-container room-page room-page--message">
        <StateMessage
          error={!notFound}
          heading="h1"
          title={notFound ? t("detail.notFound") : t("detail.errorTitle")}
          text={notFound ? t("detail.notFoundText") : t("detail.errorText")}
          testId={notFound ? "room-not-found" : "room-error"}
        >
          {!notFound && (
            <button type="button" className="g-btn g-btn--primary" onClick={reload}>
              <GuestIcon.Retry />
              {t("list.retry")}
            </button>
          )}
          <Link to={backToList} className={`g-btn ${notFound ? "g-btn--primary" : "g-btn--outline"}`}>
            {t("detail.backToRooms")}
          </Link>
        </StateMessage>
      </div>
    );
  }

  const amenities = Array.isArray(current.amenities) ? current.amenities : [];
  const freeDays = Number(policy?.freeCancellationDays) || 0;
  const facts = [
    { icon: <GuestIcon.Bed />, title: current.room_type, text: t("detail.factType") },
    { icon: <GuestIcon.Guests />, title: t("room.maxGuests", { count: Number(current.capacity) || 1 }), text: t("detail.factCapacity") },
    // The property's times are known from the first paint (PropertyContext),
    // so the row does not grow when the booking policy arrives.
    { icon: <GuestIcon.Clock />, title: policy?.checkInTime || property.checkInTime, text: t("detail.factCheckIn") },
    { icon: <GuestIcon.Clock />, title: policy?.checkOutTime || property.checkOutTime, text: t("detail.factCheckOut") },
  ];

  return (
    <div className="guest-container room-page" data-testid="room-page">
      <div className="page-head page-head--tight">
        <ol className="crumbs">
          <li><Link to="/">{t("list.home")}</Link></li>
          <li><Link to={backToList}>{t("nav.rooms")}</Link></li>
          <li aria-current="page">{current.room_name}</li>
        </ol>
      </div>

      <div className="detail-header">
        {current.location && (
          <span className="room-location">
            <GuestIcon.Pin small />
            {current.location}
          </span>
        )}
        <h1>{current.room_name}</h1>
        <div className="detail-sub">
          <a href="#reviews"><RoomRatingSummary roomId={current.id} showEmpty /></a>
          <span className="badge badge--brass">{current.room_type}</span>
          {freeDays > 0 && <span className="badge badge--accent">{t("detail.freeCancellation", { count: freeDays })}</span>}
        </div>
      </div>

      <Gallery key={current.id} room={current} />

      <div className="detail-layout">
        <div className="detail-main">
          <section>
            <div className="detail-facts">
              {facts.map((fact) => (
                <div key={fact.text} className="detail-fact">
                  {fact.icon}
                  <b>{fact.title}</b>
                  <span>{fact.text}</span>
                </div>
              ))}
            </div>
            <h2 className="sr-only">{t("detail.about")}</h2>
            <p className="detail-description">{current.description || t("detail.noDescription")}</p>
          </section>

          {/* Only what the property has listed for this room. */}
          {amenities.length > 0 && (
            <section aria-labelledby="amenities-title" data-testid="room-amenities">
              <h2 id="amenities-title">{t("detail.amenities")}</h2>
              <ul className="amenities">
                {amenities.map((amenity) => (
                  <li key={amenity}>
                    <GuestIcon.Check />
                    {amenity}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="availability-title">
            <h2 id="availability-title">{t("detail.availability")}</h2>
            <AvailabilityCalendar
              key={current.id}
              roomId={current.id}
              checkIn={stay.checkIn}
              checkOut={stay.checkOut}
              onSelect={(dates) => setStay({ ...stay, ...dates })}
            />
          </section>

          {policy && (
            <section aria-labelledby="policies-title" data-testid="room-policies">
              <h2 id="policies-title">{t("detail.policies")}</h2>
              <div className="policies">
                <div>
                  <h3><GuestIcon.Clock small />{t("detail.policyTimesTitle")}</h3>
                  <p>{t("detail.policyTimes", { checkIn: policy.checkInTime, checkOut: policy.checkOutTime })}</p>
                </div>
                <div>
                  <h3><GuestIcon.Card small />{t("home.why.paymentTitle")}</h3>
                  <p>{t("home.why.paymentText")}</p>
                </div>
                <CancellationPolicy policy={policy} checkIn={stay.checkIn} />
              </div>
            </section>
          )}

          <section id="reviews" aria-labelledby="reviews-title">
            <h2 id="reviews-title">{t("detail.reviews")}</h2>
            <RoomReviews roomId={current.id} />
          </section>
        </div>

        <BookingPanel key={current.id} room={current} stay={stay} onStayChange={setStay} policy={policy} />
      </div>

      <div className="mobile-book-bar">
        <span className="room-price">
          {formatMoney(current.price, i18n.language)} <small>{t("room.perNight")}</small>
        </span>
        <a href="#booking-panel" className="g-btn g-btn--primary">
          {t("booking.title")}
        </a>
      </div>
    </div>
  );
}
