import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { SUPPORTED_LANGUAGES } from "../config/brand";
import { useProperty } from "../context/PropertyContext";
import { ADMIN_HOME, loginPathFor } from "../utils/authRedirect";
import "../styles/guest.css";

function LanguageSwitch() {
  const { i18n, t } = useTranslation("common");

  return (
    <div className="guest-lang" role="group" aria-label={t("language.label")}>
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          className={i18n.language === lng ? "is-active" : ""}
          aria-pressed={i18n.language === lng}
          onClick={() => i18n.changeLanguage(lng)}
        >
          {lng.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function Header() {
  const { t } = useTranslation("site");
  const { user, logout } = useAuth();
  const property = useProperty();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);
  const navClass = ({ isActive }) => (isActive ? "is-active" : "");

  const handleLogout = () => {
    closeMenu();
    logout();
    navigate("/");
  };

  return (
    <header className="guest-header">
      <div className="guest-container guest-header-inner">
        <Link to="/" className="guest-brand" onClick={closeMenu}>
          {property.logoUrl ? (
            <img className="guest-brand-logo" src={property.logoUrl} alt="" />
          ) : (
            <span className="guest-brand-mark" aria-hidden="true">{property.initial}</span>
          )}
          {property.name}
        </Link>

        <button
          type="button"
          className="guest-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="guest-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {t("nav.menu")}
        </button>

        <nav id="guest-nav" className={`guest-nav ${menuOpen ? "is-open" : ""}`}>
          <NavLink to="/rooms" className={navClass} onClick={closeMenu}>
            {t("nav.rooms")}
          </NavLink>

          {user && (
            <NavLink to="/my-bookings" className={navClass} onClick={closeMenu}>
              {t("nav.myBookings")}
            </NavLink>
          )}

          {user?.role === "admin" && (
            <NavLink to={ADMIN_HOME} className={navClass} onClick={closeMenu}>
              {t("nav.admin")}
            </NavLink>
          )}

          {user ? (
            <>
              <NavLink to="/settings" className={navClass} onClick={closeMenu}>
                {user.name || t("nav.account")}
              </NavLink>
              <button type="button" className="guest-nav-button" onClick={handleLogout}>
                {t("nav.logout")}
              </button>
            </>
          ) : (
            <Link to={loginPathFor(location)} className="g-btn g-btn--primary g-btn--small" onClick={closeMenu}>
              {t("nav.login")}
            </Link>
          )}

          <LanguageSwitch />
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const { t } = useTranslation("site");
  const property = useProperty();
  const contactLines = [
    property.address,
    property.phone && `${t("footer.phone")}: ${property.phone}`,
    property.email && `${t("footer.email")}: ${property.email}`,
  ].filter(Boolean);

  return (
    <footer className="guest-footer">
      <div className="guest-container">
        <div className="guest-footer-grid">
          <div>
            <h4>{property.name}</h4>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{t("footer.tagline")}</p>
          </div>

          <div>
            <h4>{t("footer.explore")}</h4>
            <ul>
              <li><Link to="/rooms">{t("nav.rooms")}</Link></li>
              <li><Link to="/my-bookings">{t("nav.myBookings")}</Link></li>
            </ul>
          </div>

          {contactLines.length > 0 && (
            <div>
              <h4>{t("footer.contact")}</h4>
              <ul>
                {contactLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="guest-footer-bottom">
          <span>© {new Date().getFullYear()} {property.name}</span>
          <Link to="/credits">{t("footer.credits")}</Link>
        </div>
      </div>
    </footer>
  );
}

// Shell of the public site: header, the current page, footer. Used as a
// layout route (renders the matched child route) or around explicit children.
export default function GuestLayout({ children }) {
  return (
    <div className="guest">
      <Header />
      <main className="guest-main">
        {children ?? <Outlet />}
      </main>
      <Footer />
    </div>
  );
}
