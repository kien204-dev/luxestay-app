// Maximum lengths of the text columns that have one in the schema
// (see src/db/migrations). Checked up front so an over-long value is a clear
// 400 instead of a database error surfacing as a 500.
const TEXT_LIMITS = {
  name: 100,
  email: 255,
  bio: 2000,
  room_name: 150,
  room_type: 100,
  location: 255,
};

const FIELD_LABELS = {
  name: "Name",
  email: "Email",
  bio: "Bio",
  room_name: "Room name",
  room_type: "Room type",
  location: "Location",
};

// fields: { columnName: value }. Returns an error message for the first value
// that is not text or is too long, or null when everything fits.
function findTextLimitError(fields) {
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;

    const label = FIELD_LABELS[field] || field;
    if (typeof value !== "string") return `${label} must be text`;

    const max = TEXT_LIMITS[field];
    if (max && value.length > max) return `${label} must be at most ${max} characters`;
  }

  return null;
}

module.exports = { TEXT_LIMITS, findTextLimitError };
