const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_RULE_MESSAGE =
  "Password must be at least 8 characters and include both letters and numbers";

// One rule for every place a password is set: sign-up, reset, admin-created
// accounts and a user changing their own.
function isStrongPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

module.exports = { isStrongPassword, PASSWORD_MIN_LENGTH, PASSWORD_RULE_MESSAGE };
