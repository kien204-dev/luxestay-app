import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { SUPPORTED_LANGUAGES } from "../config/brand";
import { useProperty } from "../context/PropertyContext";
import DemoBanner from "../components/DemoBanner";
import GuestIcon from "../components/guest/icons";
import ThemeSwitch from "../components/ThemeSwitch";
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

function Brand({ onClick }) {
  const property = useProperty();

  return (
    <Link to="/" className="guest-brand" onClick={onClick}>
      {property.logoUrl ? (
        <img className="guest-brand-logo" src={property.logoUrl} alt="" width={36} height={36} />
      ) : (
        <span className="guest-brand-mark" aria-hidden="true">{property.initial}</span>
      )}
      {property.name}
    </Link>
  );
}

// True once the page has been scrolled away from its top.
function useScrolled(enabled) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [enabled]);

  return enabled && scrolled;
}

function Header() {
  const { t } = useTranslation("site");
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // The home page opens with its hero photo under the header.
  const onHome = location.pathname === "/";
  const scrolled = useScrolled(onHome);
  const overlay = onHome && !scrolled && !menuOpen;

  const closeMenu = () => setMenuOpen(false);
  const navClass = ({ isActive }) => (isActive ? "is-active" : "");

  const handleLogout = () => {
    closeMenu();
    logout();
    navigate("/");
  };

  return (
    <header className={`guest-header${overlay ? " guest-header--overlay" : ""}`}>
      <div className="guest-container guest-header-inner">
        <Brand onClick={closeMenu} />

        <button
          type="button"
          className="guest-icon-button guest-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="guest-nav"
          aria-label={menuOpen ? t("nav.closeMenu") : t("nav.menu")}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <GuestIcon.Close /> : <GuestIcon.Menu />}
        </button>

        <nav id="guest-nav" className={`guest-nav ${menuOpen ? "is-open" : ""}`} aria-label={t("nav.label")}>
          <div className="guest-nav-links">
            <NavLink to="/rooms" className={navClass} onClick={closeMenu}>
              <span>{t("nav.rooms")}</span>
            </NavLink>
            <Link to="/#destinations" onClick={closeMenu}>
              <span>{t("nav.destinations")}</span>
            </Link>
            <NavLink to="/my-bookings" className={navClass} onClick={closeMenu}>
              <span>{t("nav.myBookings")}</span>
            </NavLink>
            {user?.role === "admin" && (
              <NavLink to={ADMIN_HOME} className={navClass} onClick={closeMenu}>
                <span>{t("nav.admin")}</span>
              </NavLink>
            )}
          </div>

          <div className="guest-nav-tools">
            <LanguageSwitch />
            <ThemeSwitch className="guest-icon-button" />
            {user ? (
              <>
                <NavLink to="/settings" className={navClass} onClick={closeMenu}>
                  <GuestIcon.User />
                  <span>{user.name || t("nav.account")}</span>
                </NavLink>
                <button type="button" className="guest-nav-button" onClick={handleLogout}>
                  <span>{t("nav.logout")}</span>
                </button>
              </>
            ) : (
              <Link to={loginPathFor(location)} className="g-btn g-btn--primary" onClick={closeMenu}>
                {t("nav.login")}
              </Link>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const { t } = useTranslation("site");
  const property = useProperty();
  const hasContact = property.phone || property.email;

  return (
    <footer className="guest-footer">
      <div className="guest-container">
        <div className="guest-footer-grid">
          <div className="guest-footer-brand">
            <Brand />
            <p>{property.address || t("footer.tagline")}</p>
          </div>

          <nav aria-label={t("footer.explore")}>
            <h3>{t("footer.explore")}</h3>
            <ul>
              <li><Link to="/rooms">{t("nav.rooms")}</Link></li>
              <li><Link to="/#destinations">{t("nav.destinations")}</Link></li>
              <li><Link to="/my-bookings">{t("nav.myBookings")}</Link></li>
            </ul>
          </nav>

          {hasContact && (
            <div>
              <h3>{t("footer.contact")}</h3>
              <ul>
                {property.phone && (
                  <li><a href={`tel:${property.phone.replace(/[^\d+]/g, "")}`}>{property.phone}</a></li>
                )}
                {property.email && (
                  <li><a href={`mailto:${property.email}`}>{property.email}</a></li>
                )}
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
      <DemoBanner />
      <Header />
      <main className="guest-main">
        {children ?? <Outlet />}
      </main>
      <Footer />
    </div>
  );
}
