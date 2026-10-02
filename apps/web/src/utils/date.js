// "YYYY-MM-DD" for the visitor's own calendar day. Not toISOString(): that
// is the UTC date, which in Vietnam is still yesterday until 07:00.
// The API has the final say on what "today" is (the property's timezone).
export function localDateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
