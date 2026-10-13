import { Link, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AxIcon from "../../components/admin/AxIcon";
import { useProperty } from "../../context/PropertyContext";
import { useBookingNotifications } from "../../context/BookingNotificationsContext";

// Only screens that exist. "/admin" matches itself alone (`end`).
export const NAV_GROUPS = [
  {
    key: "overview",
    items: [
      { to: "/admin", key: "dashboard", icon: "dashboard", end: true },
      { to: "/admin/calendar", key: "calendar", icon: "calendar" },
    ],
  },
  {
    key: "business",
    items: [
      { to: "/admin/orders", key: "orders", icon: "bookings", count: true },
      { to: "/admin/rooms", key: "rooms", icon: "rooms" },
      { to: "/admin/coupons", key: "coupons", icon: "coupons" },
      { to: "/admin/reviews", key: "reviews", icon: "reviews" },
    ],
  },
  { key: "customers", items: [{ to: "/admin/users", key: "users", icon: "users" }] },
  {
    key: "settings",
    items: [
      { to: "/admin/property", key: "property", icon: "property" },
      { to: "/admin/destinations", key: "destinations", icon: "destinations" },
    ],
  },
];

// Bookings that wait on the admin: not paid yet, or money to send back.
export function useNeedsAction() {
  const { counts } = useBookingNotifications();
  if (!counts) return 0;
  return (counts.pending || 0) + (counts.refund_pending || 0);
}

export function BrandMark() {
  const property = useProperty();
  return (
    <span className="ax-side__mark" aria-hidden="true">
      {property.logoUrl ? <img src={property.logoUrl} alt="" /> : property.initial}
    </span>
  );
}

// The dark menu on the left. `rail`: icons only (a tablet, or collapsed by
// the admin), names shown on hover and focus. `onToggle` is the collapse
// button (not in the phone menu); `onNavigate` closes the phone menu.
export default function AdminSidebar({ rail = false, onToggle, onNavigate, inMenu = false, id }) {
  const { t } = useTranslation("admin");
  const property = useProperty();
  const needsAction = useNeedsAction();

  return (
    <aside id={id} className={`ax-side${rail ? " is-rail" : ""}${inMenu ? " ax-side--menu" : ""}`}>
      <Link className="ax-side__brand" to="/admin" onClick={onNavigate}>
        <BrandMark />
        <span className="ax-side__brandtext">
          <span className="ax-side__name">{property.name}</span>
          <span className="ax-side__tag">{t("shell.tag")}</span>
        </span>
        {rail && <span className="sr-only">{property.name}</span>}
      </Link>

      <nav className="ax-side__nav" aria-label={t("nav.label")}>
        {NAV_GROUPS.map((group) => (
          <div key={group.key} className="ax-side__group">
            <div className="ax-side__gt" id={`${id || "ax-side"}-${group.key}`}>{t(`nav.groups.${group.key}`)}</div>
            <ul aria-labelledby={`${id || "ax-side"}-${group.key}`}>
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink className="ax-side__link" to={item.to} end={item.end} onClick={onNavigate} data-testid={`nav-${item.key}`}>
                    <AxIcon name={item.icon} />
                    <span className="ax-side__label">{t(`nav.${item.key}`)}</span>
                    {item.count && needsAction > 0 && (
                      <>
                        <span className="ax-side__count" aria-hidden="true">{needsAction > 99 ? "99+" : needsAction}</span>
                        <span className="ax-side__dot" aria-hidden="true" />
                        <span className="sr-only">{t("nav.needsAction", { count: needsAction })}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="ax-side__foot">
        <Link className="ax-side__link" to="/" onClick={onNavigate}>
          <AxIcon name="external" />
          <span className="ax-side__label">{t("nav.guestSite")}</span>
        </Link>
        {onToggle && (
          <button type="button" className="ax-side__link" onClick={onToggle} aria-expanded={!rail} aria-label={rail ? t("shell.expand") : t("shell.collapse")} data-testid="sidebar-toggle">
            <AxIcon name={rail ? "expand" : "collapse"} />
            <span className="ax-side__label" aria-hidden="true">{rail ? t("shell.expand") : t("shell.collapseShort")}</span>
          </button>
        )}
      </div>
    </aside>
  );
}
