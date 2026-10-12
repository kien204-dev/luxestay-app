// The one format of a booking's code wherever a person reads it: emails, the
// PDF confirmation, admin alerts and (apps/web/src/utils/bookingCode.js) every
// screen. "#BK-0012"; past 9999 it simply grows ("#BK-12345").
function bookingRef(id) {
  return `BK-${String(id).padStart(4, "0")}`;
}

function bookingCode(id) {
  return `#${bookingRef(id)}`;
}

module.exports = { bookingCode, bookingRef };
