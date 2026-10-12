// The API's password rule (apps/api/src/utils/password.js). The API publishes
// the list in /api/settings/public (auth.passwordRules); each rule it names is
// checked here the same way, so the checklist and the "Save" button agree
// with what the server will accept. DEFAULT_RULES is what the page uses until
// that answer arrives.
const CHECKS = {
  minLength: (password, rule) => password.length >= rule.min,
  // ASCII letters only, like the API: "ă" or "đ" alone do not count.
  letter: (password) => /[A-Za-z]/.test(password),
  digit: (password) => /[0-9]/.test(password),
};

export const DEFAULT_RULES = [{ id: "minLength", min: 8 }, { id: "letter" }, { id: "digit" }];

// [{ id, min?, ok }] for the rules this web app knows how to check.
export function checkPassword(password, rules = DEFAULT_RULES) {
  const value = typeof password === "string" ? password : "";
  return rules.filter((rule) => CHECKS[rule.id]).map((rule) => ({ ...rule, ok: CHECKS[rule.id](value, rule) }));
}

export function isStrongPassword(password, rules = DEFAULT_RULES) {
  return typeof password === "string" && checkPassword(password, rules).every((rule) => rule.ok);
}

// The meter is the checklist counted, nothing more: "strong" means the API
// will accept it. null while the box is empty.
export function passwordStrength(password, rules = DEFAULT_RULES) {
  if (!password) return null;
  const results = checkPassword(password, rules);
  const passed = results.filter((rule) => rule.ok).length;
  if (passed === results.length) return "strong";
  return passed >= results.length - 1 ? "medium" : "weak";
}
