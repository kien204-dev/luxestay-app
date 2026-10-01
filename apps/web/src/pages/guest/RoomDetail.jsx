import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AvailabilityCalendar from "../../components/guest/AvailabilityCalendar";
import BookingPanel from "../../components/guest/BookingPanel";
import { RoomImage } from "../../components/guest/RoomCard";
import RoomReviews, { RoomRatingSummary } from "../../components/RoomReviews";
import { getRoomById } from "../../services/roomService";
import { useAsyncData } from "../../utils/useAsyncData";
import { useBookingPolicy } from "../../utils/useBookingPolicy";
import { useDocumentTitle } from "../../utils/useDocumentTitle";
import { formatMoney, isDateString } from "../../utils/format";
import { stayQuery } from "../../utils/stayQuery";

// The stay being planned is kept in the URL (?checkIn=&checkOut=&guests=):
// it arrives from the list, survives a refresh, and is still there when the
// guest comes back from the login page.
function readStay(searchParams) {
  const checkIn = searchParams.get("checkIn") || "";
  const checkOut = searchParams.get("checkOut") || "";
  const guests = Number(searchParams.get("guests"));

  return {
    checkIn: isDateString(checkIn) ? checkIn : "",
    checkOut: isDateString(checkOut) ? checkOut : "",
    guests: Number.isInteger(guests) && guests > 0 ? guests : 1,
  };
}

// Unlike stayQuery (complete ranges only), this keeps a lone check-in: the
// guest may have picked the first date and not the second yet.
function writeStay({ checkIn, checkOut, guests }) {
  const params = new URLSearchParams();
  if (checkIn) params.set("checkIn", checkIn);
  if (checkOut) params.set("checkOut", checkOut);
  if (guests) params.set("guests", guests);
  return params;
}

function Gallery({ room }) {
  const photos = [room.image, ...(room.images || []).map((image) => image.image_path)].filter(Boolean);
  const [active, setActive] = useState(0);
  const current = photos[Math.min(active, Math.max(photos.length - 1, 0))];

  return (
    <div>
      <div className="gallery-main">
        <RoomImage src={current} alt={room.room_name} loading="eager" />
      </div>
      {photos.length > 1 && (
        <div className="gallery-thumbs">
          {photos.map((photo, index) => (
            <button
              key={`${photo}-${index}`}
              type="button"
              className={`gallery-thumb ${index === active ? "is-active" : ""}`}
              aria-label={`${room.room_name} ${index + 1}`}
              aria-pressed={index === active}
              onClick={() => setActive(index)}
            >
              <RoomImage src={photo} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RoomDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation("site");
  const [searchParams, setSearchParams] = useSearchParams();
  const stay = readStay(searchParams);
  const policy = useBookingPolicy();

  const { data: room, loading, error, reload } = useAsyncData(`room:${id}`, () => getRoomById(id));
  // While switching rooms, `room` is still the previous one for a moment.
  const current = room && String(room.id) === String(id) ? room : null;
  useDocumentTitle(current?.room_name || t("detail.documentTitle"));

  const setStay = (next) => setSearchParams(writeStay(next), { replace: true });

  if (!current) {
    const notFound = [400, 404].includes(error?.response?.status);

    return (
      <div className="guest-container guest-state" style={{ paddingTop: 96 }}>
        {loading ? (
          <p aria-busy="true">{t("detail.loading")}</p>
        ) : (
          <>
            <p>{notFound ? t("detail.notFound") : t("list.loadFailed")}</p>
            {!notFound && (
              <button
                type="button"
                className="g-btn g-btn--outline"
                onClick={reload}
                style={{ marginRight: 12 }}
              >
                {t("list.retry")}
              </button>
            )}
            <Link to="/rooms" className="g-btn g-btn--primary">
              {t("detail.backToRooms")}
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="guest-container">
      <div className="detail-header">
        <Link to={`/rooms${stayQuery(stay)}`} className="guest-muted" style={{ fontSize: 14 }}>
          ‹ {t("detail.backToRooms")}
        </Link>
        <h1>{current.room_name}</h1>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          {current.location && <span className="guest-muted">{current.location}</span>}
          <RoomRatingSummary roomId={current.id} />
        </div>
      </div>

      <div className="detail-layout">
        <div className="detail-main">
          <Gallery key={current.id} room={current} />

          <section>
            <h2>{t("detail.about")}</h2>
            <p className="detail-description">{current.description || t("detail.noDescription")}</p>
            <div className="detail-facts">
              <span className="detail-fact">{current.room_type}</span>
              <span className="detail-fact">
                {t("room.maxGuests", { count: Number(current.capacity) || 1 })}
              </span>
            </div>
          </section>

          <section>
            <h2>{t("detail.availability")}</h2>
            <AvailabilityCalendar
              key={current.id}
              roomId={current.id}
              checkIn={stay.checkIn}
              checkOut={stay.checkOut}
              onSelect={(dates) => setStay({ ...stay, ...dates })}
            />
          </section>

          <section>
            <h2>{t("detail.reviews")}</h2>
            <RoomReviews roomId={current.id} />
          </section>
        </div>

        <BookingPanel key={current.id} room={current} stay={stay} onStayChange={setStay} policy={policy} />
      </div>

      <div className="mobile-book-bar">
        <span className="room-price">
          {formatMoney(current.price, i18n.language)} <small>{t("room.perNight")}</small>
        </span>
        <a href="#booking-panel" className="g-btn g-btn--gold g-btn--small">
          {t("booking.title")}
        </a>
      </div>
    </div>
  );
}
