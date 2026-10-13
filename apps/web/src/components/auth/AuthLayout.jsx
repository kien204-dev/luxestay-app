import { Link, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import DemoBanner from "../DemoBanner";
import GuestIcon from "../guest/icons";
import { useProperty } from "../../context/PropertyContext";
import { LanguageSwitch } from "../../layout/GuestLayout";
import { placeholderFor } from "../../utils/imageUrl";
import "../../styles/guest.css";
import "../../styles/auth.css";

// Shell of the sign-in pages: the property's photo on one side, the form on
// the other (photo on top on a phone). No site header or footer, so the
// page's only heading is the form's h1.
//
// It waits for /api/settings/public before drawing anything: that answer
// decides whether the demo strip sits on top and whether there is a Google
// button, and drawing the page first would let both push it around.
export default function AuthLayout() {
  const { t } = useTranslation("auth");
  const property = useProperty();

  if (!property.ready) return <div className="au-wait" aria-busy="true" />;

  const art = property.heroImageUrl || placeholderFor(property.name, "place");
  const caption = [property.heroTitle, property.address].filter(Boolean);

  return (
    <div className="guest au-page">
      <DemoBanner signIn />
      <div className="au">
        <div className="au__art">
          <img src={art} alt="" fetchpriority="high" />
          <Link to="/" className="au__logo">
            {property.logoUrl && <img src={property.logoUrl} alt="" width={36} height={36} />}
            {property.name}
          </Link>
          {caption.length > 0 && (
            <p className="au__quote">
              {property.heroTitle}
              {property.address && <small>{property.address}</small>}
            </p>
          )}
        </div>
        <main className="au__panel">
          <div className="au__top">
            <Link to="/" className="g-btn g-btn--ghost g-btn--small">
              <GuestIcon.Previous small />
              {t("common.home")}
            </Link>
            <LanguageSwitch />
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
