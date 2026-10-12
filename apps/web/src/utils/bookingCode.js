// The one format of a booking's code on every screen, matching the emails and
// the PDF (apps/api/src/utils/bookingCode.js): "#BK-0012".
export function bookingRef(id) {
  return `BK-${String(id).padStart(4, "0")}`;
}

export function bookingCode(id) {
  return `#${bookingRef(id)}`;
}
