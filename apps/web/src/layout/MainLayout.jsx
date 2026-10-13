import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AdminSidebar, { useNeedsAction } from "./admin/AdminSidebar";
import AdminSearch from "./admin/AdminSearch";
import NotificationsMenu from "./admin/NotificationsMenu";
import AccountMenu from "./admin/AccountMenu";
import AxIcon from "../components/admin/AxIcon";
import Dialog from "../components/Dialog";
import DemoBanner from "../components/DemoBanner";
import ThemeSwitch from "../components/ThemeSwitch";
import { useProperty } from "../context/PropertyContext";
import { NARROW_QUERY, useMedia } from "../utils/useMedia";
import "../styles/admin.css";
import "../styles/guest.css";
import "../styles/auth.css";
import "../styles/admin-shell.css";

// The collapsed/expanded choice, remembered per size: a tablet starts as a
// rail of icons, a wide screen with the full menu.
const RAIL_KEY = { narrow: "luxestay_admin_rail_narrow", wide: "luxestay_admin_rail_wide" };

function readRail(key) {
  try {
    const value = window.localStorage.getItem(key);
    return value === "1" ? true : value === "0" ? false : null;
  } catch {
    return null;
  }
}

function MobileBars({ onMenu, menuOpen }) {
  const { t } = useTranslation("admin");
  const property = useProperty();
  const needsAction = useNeedsAction();
  const [searching, setSearching] = useState(false);

  return (
    <>
      <header className="ax-mtop">
        <button type="button" className="ax-iconbtn" aria-label={t("shell.openMenu")} aria-expanded={menuOpen} onClick={onMenu} data-testid="admin-menu-button">
          <AxIcon name="menu" />
        </button>
        <Link className="ax-mtop__logo" to="/admin">
          {property.name} <small>{t("shell.tag")}</small>
        </Link>
        <button type="button" className="ax-iconbtn" aria-label={t("search.label")} aria-expanded={searching} onClick={() => setSearching((value) => !value)}>
          <AxIcon name={searching ? "close" : "search"} />
        </button>
        <NotificationsMenu testId="notifications-m" />
        <AccountMenu compact testId="account-menu-m" />
        {searching && (
          <div className="ax-msearch">
            <AdminSearch autoFocus onDone={() => setSearching(false)} />
          </div>
        )}
      </header>

      <nav className="ax-mnav" aria-label={t("shell.quickNav")}>
        <NavLink to="/admin" end>
          <AxIcon name="dashboard" />
          {t("nav.dashboardShort")}
        </NavLink>
        <NavLink to="/admin/orders">
          <AxIcon name="bookings" />
          {t("nav.ordersShort")}
          {needsAction > 0 && (
            <>
              <span className="ax-badge-n" aria-hidden="true">{needsAction > 99 ? "99+" : needsAction}</span>
              <span className="sr-only">{t("nav.needsAction", { count: needsAction })}</span>
            </>
          )}
        </NavLink>
        <NavLink to="/admin/calendar">
          <AxIcon name="calendar" />
          {t("nav.calendarShort")}
        </NavLink>
        <NavLink to="/admin/rooms">
          <AxIcon name="rooms" />
          {t("nav.rooms")}
        </NavLink>
        <button type="button" onClick={onMenu} aria-expanded={menuOpen}>
          <AxIcon name="more" />
          {t("nav.more")}
        </button>
      </nav>
    </>
  );
}

// The admin area's frame: the demo strip, the menu on the left (a rail of
// icons on a tablet), the top bar (search, desk booking, light/dark, the
// bell, the account) and, on a phone, a dark top bar with a menu drawer and
// a bar of the main screens at the bottom. Every admin screen renders inside.
function MainLayout({ children }) {
  const { t } = useTranslation("admin");
  const narrow = useMedia(NARROW_QUERY);
  const [rails, setRails] = useState(() => ({ narrow: readRail(RAIL_KEY.narrow), wide: readRail(RAIL_KEY.wide) }));
  const [menuOpen, setMenuOpen] = useState(false);

  const size = narrow ? "narrow" : "wide";
  const rail = rails[size] ?? narrow;
  const toggleRail = () => {
    try {
      window.localStorage.setItem(RAIL_KEY[size], rail ? "0" : "1");
    } catch {
      // Not remembered; it still changes now.
    }
    setRails((current) => ({ ...current, [size]: !rail }));
  };

  return (
    <div className="ax">
      <a className="ax-skip" href="#ax-main">{t("shell.skip")}</a>
      <DemoBanner admin />
      <div className="ax-frame adm-shell">
        <AdminSidebar rail={rail} onToggle={toggleRail} />

        <div className="ax-main">
          <header className="ax-top">
            <AdminSearch />
            <div className="ax-top__right">
              <Link className="g-btn g-btn--primary g-btn--small ax-btn-sm" to="/admin/orders?new=desk" data-testid="walk-in-link">
                <AxIcon name="plus" small />
                <span className="ax-btn__label">{t("shell.walkIn")}</span>
              </Link>
              <span className="ax-top__div" aria-hidden="true" />
              <ThemeSwitch className="ax-iconbtn" />
              <NotificationsMenu />
              <AccountMenu />
            </div>
          </header>

          <MobileBars onMenu={() => setMenuOpen(true)} menuOpen={menuOpen} />

          <main className="ax-body" id="ax-main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>

      {menuOpen && (
        <Dialog className="ax-menu" aria-label={t("shell.menu")} onClose={() => setMenuOpen(false)}>
          <AdminSidebar inMenu id="ax-menu" onNavigate={() => setMenuOpen(false)} />
          <button type="button" className="ax-iconbtn ax-menu__close" aria-label={t("shell.closeMenu")} onClick={() => setMenuOpen(false)} data-autofocus>
            <AxIcon name="close" />
          </button>
        </Dialog>
      )}
    </div>
  );
}

export default MainLayout;
