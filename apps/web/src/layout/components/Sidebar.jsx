import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Icon from "../../utils/icon";
import { useAuth } from "../../context/AuthContext";
import { useProperty } from "../../context/PropertyContext";
import { useBookingNotifications } from "../../context/BookingNotificationsContext";

const NAV_ITEMS = [
  { path: "/admin", key: "dashboard", icon: "Dashboard", adminOnly: true },
  { path: "/", key: "guestSite", icon: "Booking" },
  { path: "/admin/rooms", key: "rooms", icon: "Rooms", adminOnly: true },
  { path: "/admin/users", key: "users", icon: "Users", adminOnly: true },
  { path: "/admin/orders", key: "orders", icon: "Orders", adminOnly: true },
  { path: "/admin/calendar", key: "calendar", icon: "Calendar", adminOnly: true },
  { path: "/admin/coupons", key: "coupons", icon: "Tag", adminOnly: true },
  { path: "/admin/property", key: "property", icon: "Hotel", adminOnly: true },
  { path: "/admin/destinations", key: "destinations", icon: "Star", adminOnly: true },
  { path: "/settings", key: "account", icon: "Settings" },
];

export default function Sidebar() {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const property = useProperty();
  const { newBookingCount } = useBookingNotifications();

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === "admin");

  return (
    <aside className="adm-sidebar">
      <button type="button" className="adm-brand" onClick={() => navigate(user?.role === "admin" ? "/admin" : "/")}>
        <Icon.Hotel />
        <span>{property.name}</span>
      </button>

      <nav className="adm-nav" aria-label={t("nav.label")}>
        {items.map(({ path, key, icon }) => {
          const IconComp = Icon[icon];
          const exactOnly = path === "/" || path === "/admin";
          const active = exactOnly ? location.pathname === path : location.pathname.startsWith(path);

          return (
            <button
              key={path}
              type="button"
              onClick={() => navigate(path)}
              className={`adm-nav-item ${active ? "is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {IconComp ? <IconComp /> : null}
              <span className="adm-nav-label">{t(`nav.${key}`)}</span>
              {key === "orders" && newBookingCount > 0 && (
                <span className="adm-nav-count" aria-label={t("nav.newBookings", { count: newBookingCount })}>
                  {newBookingCount > 99 ? "99+" : newBookingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        className="adm-nav-item adm-logout"
        onClick={() => {
          logout();
          navigate("/");
        }}
      >
        <Icon.Logout />
        <span>{t("nav.logout")}</span>
      </button>
    </aside>
  );
}
