// One rule for every place a password is set: sign-up, reset, admin-created
// accounts and a user changing their own. The list is also published to the
// web app (config/auth.js), which shows it as a checklist and checks the
// same things as the visitor types (apps/web/src/utils/password.js).
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_RULES = [
  { id: "minLength", min: PASSWORD_MIN_LENGTH, test: (password) => password.length >= PASSWORD_MIN_LENGTH },
  // ASCII letters only: "ă" or "đ" alone do not count.
  { id: "letter", test: (password) => /[A-Za-z]/.test(password) },
  { id: "digit", test: (password) => /[0-9]/.test(password) },
];

function isStrongPassword(password) {
  return typeof password === "string" && PASSWORD_RULES.every((rule) => rule.test(password));
}

// The rules without their checks, for the web app.
function describePasswordRules() {
  return PASSWORD_RULES.map(({ id, min }) => (min ? { id, min } : { id }));
}

module.exports = { describePasswordRules, isStrongPassword, PASSWORD_MIN_LENGTH };
