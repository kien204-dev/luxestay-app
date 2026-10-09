// Line icons of the guest site: 24px grid, 1.5px stroke, drawn in the text
// colour. Decorative (aria-hidden): the control they sit in carries the label.
function icon(children) {
  return function GuestIcon({ small = false }) {
    return (
      <svg className={`guest-icon${small ? " guest-icon--small" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
        {children}
      </svg>
    );
  };
}

const GuestIcon = {
  Menu: icon(<path d="M4 8h16M4 16h16" />),
  Close: icon(<path d="M6 6l12 12M18 6L6 18" />),
  User: icon(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.6 3.9-5.5 7-5.5s5.8 1.9 7 5.5" /></>),
  Guests: icon(<><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.9-3 3-4.6 5.5-4.6s4.6 1.6 5.5 4.6" /><path d="M15.5 6a3 3 0 0 1 0 5.6M17 14.6c1.8.5 3 1.9 3.6 4.4" /></>),
  Pin: icon(<><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>),
  Search: icon(<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>),
  Arrow: icon(<path d="M4 12h16M14 6l6 6-6 6" />),
  Previous: icon(<path d="M15 6l-6 6 6 6" />),
  Next: icon(<path d="M9 6l6 6-6 6" />),
  Minus: icon(<path d="M5 12h14" />),
  Plus: icon(<path d="M12 5v14M5 12h14" />),
  Down: icon(<path d="M6 9l6 6 6-6" />),
  Check: icon(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  Filter: icon(<path d="M4 6h16M7 12h10M10 18h4" />),
  Grid: icon(<><rect x="4" y="4" width="6.5" height="6.5" /><rect x="13.5" y="4" width="6.5" height="6.5" /><rect x="4" y="13.5" width="6.5" height="6.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" /></>),
  Bed: icon(<><path d="M3 18V7M3 13h18v5M21 13v-1.5A2.5 2.5 0 0 0 18.5 9H11v4" /><circle cx="7" cy="10.5" r="1.5" /></>),
  Clock: icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  Card: icon(<><rect x="3" y="5.5" width="18" height="13" rx="1.5" /><path d="M3 10h18M7 15h3" /></>),
  Retry: icon(<><path d="M19 12a7 7 0 1 1-2.05-4.95" /><path d="M19 4v4h-4" /></>),
};

// A filled star, for ratings (the surrounding rule sets size and colour).
export function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" />
    </svg>
  );
}

export default GuestIcon;
