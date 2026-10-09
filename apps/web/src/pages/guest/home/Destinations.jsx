import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RoomImage } from "../../../components/guest/RoomCard";
import { getRoomDestinations } from "../../../services/roomService";
import { formatMoney } from "../../../utils/format";
import { placeholderFor } from "../../../utils/imageUrl";
import { useAsyncData } from "../../../utils/useAsyncData";

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

export default function Destinations() {
  const { t, i18n } = useTranslation("site");
  const { hash } = useLocation();
  const section = useRef(null);
  const { data } = useAsyncData("destinations", getRoomDestinations);
  const destinations = Array.isArray(data) ? data.slice(0, DESTINATION_COUNT) : [];
  const shown = destinations.length > 0;

  // The header's "Destinations" link is /#destinations. The section only
  // exists once its data has arrived, so the browser cannot scroll to it
  // itself.
  useEffect(() => {
    if (shown && hash === "#destinations") section.current?.scrollIntoView();
  }, [shown, hash]);

  // Real places only: with nothing in the database the section is left out.
  if (!shown) return null;

  return (
    <section id="destinations" ref={section} className="guest-section home-destinations">
      <div className="guest-container">
        <div className="home-sechead">
          <div>
            <p className="guest-eyebrow">{t("home.destinationsEyebrow")}</p>
            <h2 className="guest-section-title">{t("home.destinationsTitle")}</h2>
          </div>
        </div>

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
                width={640}
                height={800}
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
