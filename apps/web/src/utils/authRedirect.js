// Where people go around signing in.
//
// A guest who presses "book" is sent to /login?next=<where they were>, and
// lands back on that exact page (room, dates, guests) once signed in.

export const ADMIN_HOME = "/admin";
export const GUEST_HOME = "/";

// Only same-site paths are accepted, so a crafted link cannot use the login
// page to bounce someone to another website.
export function safeNextPath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/^\/(login|register)(\/|\?|$)/.test(value)) return null;
  return value;
}

export function loginPathFor(location) {
  const here = `${location.pathname}${location.search || ""}`;
  return `/login?next=${encodeURIComponent(here)}`;
}

// `search` is the query string of the login/register page itself.
export function postLoginPath(user, search = "") {
  if (user?.must_change_password) return "/settings";

  const next = safeNextPath(new URLSearchParams(search).get("next"));
  if (next) return next;

  return user?.role === "admin" ? ADMIN_HOME : GUEST_HOME;
}
