import { useNavigate, useLocation } from "react-router-dom";
import Icon from "../../utils/icon";
import { useAuth } from "../../context/AuthContext";
import { useProperty } from "../../context/PropertyContext";
import { useBookingNotifications } from "../../context/BookingNotificationsContext";

export default function Sidebar({ compact = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const property = useProperty();
  const { newBookingCount } = useBookingNotifications();

  const navItems = [
    { path: "/admin", label: "Dashboard", icon: "Dashboard", adminOnly: true },
    { path: "/", label: "Guest site", icon: "Booking" },
    { path: "/admin/rooms", label: "Rooms", icon: "Rooms", adminOnly: true },
    { path: "/admin/users", label: "Users", icon: "Users", adminOnly: true },
    { path: "/admin/orders", label: "Orders", icon: "Orders", adminOnly: true },
    { path: "/admin/calendar", label: "Calendar", icon: "Calendar", adminOnly: true },
    { path: "/admin/coupons", label: "Coupons", icon: "Tag", adminOnly: true },
    { path: "/admin/property", label: "Property", icon: "Hotel", adminOnly: true },
    { path: "/admin/destinations", label: "Destinations", icon: "Star", adminOnly: true },
    { path: "/settings", label: "Settings", icon: "Settings" },
  ].filter((item) => !item.adminOnly || user?.role === "admin");

  return (
    <aside
      style={{
        width: compact ? "100%" : 240,
        position: compact ? "sticky" : "fixed",
        top: 0,
        left: 0,
        height: compact ? "auto" : "100vh",
        background: "rgba(10,17,40,0.94)",
        backdropFilter: "blur(24px)",
        borderRight: compact ? "none" : "1px solid var(--color-border-soft)",
        borderBottom: compact ? "1px solid var(--color-border-soft)" : "none",
        display: "flex",
        flexDirection: compact ? "row" : "column",
        padding: compact ? "12px" : "24px 16px",
        zIndex: 100,
        boxSizing: "border-box",
        gap: compact ? 12 : 0,
        overflowX: compact ? "auto" : "visible",
      }}
    >
      <div
        onClick={() => navigate(user?.role === "admin" ? "/admin" : "/")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: compact ? "0 8px" : "0 8px 28px",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "var(--color-gold-400)" }}>
          <Icon.Hotel />
        </span>
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 20,
            fontWeight: 700,
            color: "var(--color-gold-400)",
          }}
        >
          {property.name}
        </span>
      </div>

      <nav
        style={{
          flex: compact ? "0 0 auto" : 1,
          display: "flex",
          flexDirection: compact ? "row" : "column",
          gap: 6,
        }}
      >
        {navItems.map(({ path, label, icon }) => {
          const IconComp = Icon[icon];
          const exactOnly = path === "/" || path === "/admin";
          const active = exactOnly ? location.pathname === path : location.pathname.startsWith(path);

          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: compact ? "9px 12px" : "11px 14px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                background: active ? "var(--color-gold-100)" : "transparent",
                color: active ? "var(--color-gold-400)" : "var(--color-text-muted)",
                fontWeight: active ? 700 : 500,
                borderLeft: active
                  ? "2px solid var(--color-gold-500)"
                  : "2px solid transparent",
                textAlign: "left",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {IconComp ? <IconComp /> : <span>•</span>}
              <span style={{ flex: 1 }}>{label}</span>
              {path === "/orders" && newBookingCount > 0 && (
                <span
                  style={{
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: 9,
                    background: "var(--color-danger)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {newBookingCount > 99 ? "99+" : newBookingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <button
        onClick={() => {
          logout();
          navigate("/");
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: compact ? "9px 12px" : "11px 14px",
          borderRadius: 10,
          background: "transparent",
          color: "var(--color-danger)",
          cursor: "pointer",
          border: "none",
          fontWeight: 600,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <Icon.Logout />
        <span>Logout</span>
      </button>
    </aside>
  );
}
