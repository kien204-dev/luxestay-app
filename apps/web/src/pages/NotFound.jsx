import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import GuestIcon from "../components/guest/icons";
import { useAuth } from "../context/AuthContext";
import { useProperty } from "../context/PropertyContext";
import { ADMIN_HOME } from "../utils/authRedirect";
import { placeholderFor } from "../utils/imageUrl";
import { searchToQuery } from "../utils/stayQuery";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import "../styles/auth.css";
import "../styles/misc.css";

// 404, or (with `forbidden`) a page the signed-in account may not open
// (PrivateRoute sends it here with the address that was refused).
export default function NotFound({ forbidden = false }) {
  const { t } = useTranslation("site");
  const { user, logout } = useAuth();
  const property = useProperty();
  const location = useLocation();
  const navigate = useNavigate();
  const [place, setPlace] = useState("");
  const key = forbidden ? "forbidden" : "notFound";
  useDocumentTitle(t(`errorPage.${key}.title`));
  const isAdmin = user?.role === "admin";
  const refused = location.state?.from;

  const search = (event) => {
    event.preventDefault();
    navigate(`/rooms${searchToQuery({ location: place.trim() })}`);
  };

  const otherAccount = () => {
    logout();
    navigate(`/login${refused ? `?next=${encodeURIComponent(refused)}` : ""}`);
  };

  const contact = property.phone ? `tel:${property.phone.replace(/[^\d+]/g, "")}` : property.email ? `mailto:${property.email}` : "";

  return (
    <section className="guest-container err" data-testid={`error-${key}`}>
      <div className="err__b">
        <div className="err__num" aria-hidden="true">4<em>0</em>{forbidden ? "3" : "4"}</div>
        <h1>{t(`errorPage.${key}.title`)}</h1>
        {forbidden ? (
          <p>
            {user?.email ? (
              <Trans t={t} i18nKey="errorPage.forbidden.textWithEmail" values={{ email: user.email }} components={{ b: <b /> }} />
            ) : (
              t("errorPage.forbidden.text")
            )}
          </p>
        ) : (
          <>
            <p>{t("errorPage.notFound.text")}</p>
            <form className="err__search" role="search" onSubmit={search}>
              <label className="fx-control">
                <GuestIcon.Search />
                <span className="sr-only">{t("errorPage.searchLabel")}</span>
                <input type="search" enterKeyHint="search" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t("errorPage.searchPlaceholder")} />
              </label>
            </form>
          </>
        )}
        <div className="err__acts">
          {forbidden ? (
            <>
              {user ? (
                <button type="button" className="g-btn g-btn--primary" onClick={otherAccount}>{t("errorPage.forbidden.otherAccount")}</button>
              ) : (
                <Link className="g-btn g-btn--primary" to="/login">{t("errorPage.forbidden.signIn")}</Link>
              )}
              <Link className="g-btn g-btn--outline" to="/">{t("errorPage.toHome")}</Link>
            </>
          ) : (
            <>
              <Link className="g-btn g-btn--primary" to="/">{t("errorPage.toHome")}</Link>
              <Link className="g-btn g-btn--outline" to="/rooms">{t("errorPage.allRooms")}</Link>
            </>
          )}
        </div>
        <div className="err__links">
          {forbidden ? (
            <span className="err__code">{t("errorPage.code", { code: 403 })}{refused ? ` · ${refused}` : ""}</span>
          ) : (
            <>
              <Link to="/my-bookings">{t("errorPage.myBookings")}</Link>
              {contact && <a href={contact}>{t("errorPage.contact")}</a>}
              {isAdmin && <Link to={ADMIN_HOME}>{t("errorPage.toAdmin")}</Link>}
            </>
          )}
        </div>
      </div>
      <div className="err__art">
        <img src={property.heroImageUrl || placeholderFor(property.name, "place")} alt="" />
      </div>
    </section>
  );
}
