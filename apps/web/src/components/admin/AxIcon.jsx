// Line icons of the admin area (24px grid, 1.5 stroke, as in the design).
// Decorative: the button or link around one carries the name.
const PATHS = {
  dashboard: <><rect x="4" y="4" width="7" height="9" rx="1" /><rect x="13" y="4" width="7" height="5" rx="1" /><rect x="13" y="11" width="7" height="9" rx="1" /><rect x="4" y="15" width="7" height="5" rx="1" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  bookings: <><rect x="5" y="4.5" width="14" height="16" rx="1.5" /><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" /></>,
  receipt: <><rect x="5" y="4.5" width="14" height="16" rx="1.5" /><path d="M8.5 10h7M8.5 14h7" /></>,
  rooms: <><path d="M3 18V7M3 13h18v5M21 13v-1.5A2.5 2.5 0 0 0 18.5 9H11v4" /><circle cx="7" cy="10.5" r="1.5" /></>,
  coupons: <><path d="M3.5 12.5V4.5h8l9 9-8 8z" /><circle cx="8" cy="9" r="1.5" /></>,
  reviews: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8.5 9.5h7M8.5 12.5h4" /></>,
  users: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.9-3 3-4.6 5.5-4.6s4.6 1.6 5.5 4.6" /><path d="M15.5 6a3 3 0 0 1 0 5.6M17 14.6c1.8.5 3 1.9 3.6 4.4" /></>,
  property: <path d="M4 20V6l8-3 8 3v14M3 20h18M10 20v-4h4v4M8 9h1M15 9h1M8 13h1M15 13h1" />,
  destinations: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  collapse: <><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M9 4v16M16 9l-3 3 3 3" /></>,
  expand: <><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M9 4v16M13 9l3 3-3 3" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.6 3.9-5.5 7-5.5s5.8 1.9 7 5.5" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="1.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5z" /></>,
  logout: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
  refund: <><path d="M19 12a7 7 0 1 1-2.05-4.95" /><path d="M19 4v4h-4" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  more: <path d="M12 6v.01M12 12v.01M12 18v.01" />,
  download: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />,
  cash: <><rect x="3" y="6.5" width="18" height="11" rx="1.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5v.01M17.5 14.5v.01" /></>,
  trend: <path d="M4 16l5-5 4 4 7-7M15 8h5v5" />,
  bed: <><path d="M3 18V7M3 13h18v5M21 13v-1.5A2.5 2.5 0 0 0 18.5 9H11v4" /><circle cx="7" cy="10.5" r="1.5" /></>,
  moonNight: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  checkIn: <path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H8" />,
  checkOut: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  alert: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.2v.3" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.3" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  trash: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10.5 11v5M13.5 11v5" />,
  phone: <path d="M6.5 4h3l1.5 4-2 1.5a10 10 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15 15 0 0 1 4.5 6a2 2 0 0 1 2-2z" />,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /><path d="M4 7l8 6 8-6" /></>,
  file: <><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 12h6M9 16h6" /></>,
  inbox: <><path d="M4 13.5l2.5-8h11l2.5 8v6H4z" /><path d="M4 13.5h5l1 2h4l1-2h5" /></>,
  chart: <path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" />,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
};

export default function AxIcon({ name, small = false, className = "" }) {
  return (
    <svg className={`ax-icon${small ? " ax-icon--sm" : ""}${className ? ` ${className}` : ""}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name] || null}
    </svg>
  );
}
