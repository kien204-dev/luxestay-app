// Query strings that carry a visitor's search between the guest pages, so a
// stay chosen on one page is still filled in on the next.

function toQuery(params) {
  const query = params.toString();
  return query ? `?${query}` : "";
}

// Dates are only meaningful as a pair.
function setDates(params, { checkIn, checkOut }) {
  if (checkIn && checkOut) {
    params.set("checkIn", checkIn);
    params.set("checkOut", checkOut);
  }
}

// For the room list: location + dates + guests.
export function searchToQuery({ location, checkIn, checkOut, guests } = {}) {
  const params = new URLSearchParams();
  if (location) params.set("location", location);
  setDates(params, { checkIn, checkOut });
  if (guests) params.set("guests", guests);
  return toQuery(params);
}

// For a room page: dates + guests.
export function stayQuery({ checkIn, checkOut, guests } = {}) {
  const params = new URLSearchParams();
  setDates(params, { checkIn, checkOut });
  if (guests) params.set("guests", guests);
  return toQuery(params);
}

const isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

// The stay being planned on a room page or in the checkout, read from the
// page's own query string (?checkIn=&checkOut=&guests=): it arrives from the
// list, survives a refresh, and is still there after a detour through login.
export function readStay(searchParams) {
  const checkIn = searchParams.get("checkIn") || "";
  const checkOut = searchParams.get("checkOut") || "";
  const guests = Number(searchParams.get("guests"));

  return {
    checkIn: isDate(checkIn) ? checkIn : "",
    checkOut: isDate(checkOut) ? checkOut : "",
    guests: Number.isInteger(guests) && guests > 0 ? guests : 1,
  };
}

// Unlike stayQuery (complete ranges only), this keeps a lone check-in: the
// guest may have picked the first date and not the second yet.
export function writeStay({ checkIn, checkOut, guests }) {
  const params = new URLSearchParams();
  if (checkIn) params.set("checkIn", checkIn);
  if (checkOut) params.set("checkOut", checkOut);
  if (guests) params.set("guests", guests);
  return params;
}
