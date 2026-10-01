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
