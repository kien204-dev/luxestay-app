import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AxIcon from "../../../components/admin/AxIcon";
import { Crumbs, EmptyState, Skel } from "../../../components/admin/ax";
import { useToast } from "../../../context/ToastContext";
import { getAdminDestinations } from "../../../services/destinationService";
import { apiErrorText } from "../../../utils/apiError";
import { normalizeImageUrl, placeholderFor, showFallback } from "../../../utils/imageUrl";
import { useAsyncData } from "../../../utils/useAsyncData";
import { useDocumentTitle } from "../../../utils/useDocumentTitle";
import DestinationDrawer from "./DestinationDrawer";

// Where a destination's photo credit stands: credited under a licence
// (shown on /credits), the property's own photo with its author, no credit
// at all, or no photo of its own.
export function creditState(destination) {
  if (!destination.image) return "noPhoto";
  if (!destination.author) return "missing";
  return destination.license ? "licensed" : "own";
}

// Admin: the destinations guests pick from on the home page, one card each
// with its photo and the credit the photo's licence asks for. Destinations
// come from the rooms' locations (the part after the last comma), so they
// are added and removed with the rooms.
export default function DestinationsPage() {
  const { t } = useTranslation("property");
  const toast = useToast();
  const { data, error, reload } = useAsyncData("admin-destinations", getAdminDestinations);
  const [editing, setEditing] = useState(null);
  useDocumentTitle(t("destinations.title"));
  const destinations = Array.isArray(data) ? data : [];
  const missing = destinations.filter((item) => creditState(item) === "missing").length;

  const credit = (destination) => {
    const state = creditState(destination);
    if (state === "missing" || state === "noPhoto") {
      return (
        <span className={`ax-dcard__credit${state === "missing" ? " is-missing" : ""}`}>
          {state === "missing" && <AxIcon name="alert" small />}
          {t(`destinations.credit.${state}`)}
        </span>
      );
    }
    return (
      <span className="ax-dcard__credit">
        {t("destinations.credit.by", { author: destination.author, license: destination.license || t("destinations.credit.ownPhoto") })}
      </span>
    );
  };

  let content;
  if (error && !data) {
    content = (
      <EmptyState error icon="alert" title={t("destinations.errorTitle")} actions={<button type="button" className="g-btn g-btn--primary" onClick={reload}>{t("admin:retry")}</button>} testId="destinations-error">
        {apiErrorText(error, "admin:loadFailed")}
      </EmptyState>
    );
  } else if (!data) {
    content = (
      <div className="ax-dgrid" aria-busy="true" data-testid="destinations-loading">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="ax-dcard">
            <Skel style={{ aspectRatio: "16 / 10", borderRadius: 0 }} />
            <div className="ax-dcard__b">
              <Skel variant="title" width="50%" />
              <Skel variant="text" width="70%" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (destinations.length === 0) {
    content = (
      <EmptyState
        icon="destinations"
        title={t("destinations.emptyTitle")}
        actions={<Link className="g-btn g-btn--primary" to="/admin/rooms/new">{t("destinations.addRoom")}</Link>}
        testId="destinations-empty"
      >
        {t("destinations.emptyHelp")}
      </EmptyState>
    );
  } else {
    content = (
      <div className="ax-dgrid" data-testid="destinations-grid">
        {destinations.map((destination) => (
          <article key={destination.name} className="ax-dcard" data-testid="destination-row">
            <div className="ax-dcard__img">
              <img
                src={normalizeImageUrl(destination.image, placeholderFor(destination.name, "place"))}
                alt={destination.place || destination.name}
                loading="lazy"
                onError={(event) => showFallback(event, placeholderFor(destination.name, "place"))}
              />
            </div>
            <div className="ax-dcard__b">
              <h2>{destination.name}</h2>
              <p>{t("destinations.rooms", { count: destination.roomCount })}</p>
              {credit(destination)}
            </div>
            <div className="ax-dcard__f">
              <button
                type="button"
                className="g-btn g-btn--outline g-btn--small"
                onClick={() => setEditing(destination)}
                aria-label={t("destinations.editName", { name: destination.name })}
                data-testid="destination-edit"
              >
                {t("destinations.edit")}
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="ax-screen" data-testid="destinations-page">
      <div className="ax-head">
        <div>
          <Crumbs current={t("destinations.title")} />
          <h1>{t("destinations.title")}</h1>
          <p>
            {data
              ? [t("destinations.count", { count: destinations.length }), missing ? t("destinations.missingCount", { count: missing }) : t("destinations.allCredited")].join(" · ")
              : t("destinations.subtitle")}
          </p>
        </div>
        <div className="ax-actions">
          <Link className="g-btn g-btn--outline" to="/credits" target="_blank">
            <AxIcon name="external" small />
            {t("destinations.creditsPage")}
          </Link>
        </div>
      </div>
      <p className="ax-lede">{t("destinations.lede")}</p>
      {content}
      {editing && (
        <DestinationDrawer
          destination={editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            toast.success(message);
            reload();
          }}
        />
      )}
    </div>
  );
}
