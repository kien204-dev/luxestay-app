// Stands in for "firebase/auth" in the browser tests' build (vite.config.js,
// E2E_GOOGLE_STUB=1). Google's popup cannot run in a test, so it returns the
// account the test put in window.__e2eGoogleAccount; its "ID token" is that
// account as JSON, which the test API accepts (stack.mjs). Everything the
// page does with the answer is the real code.
export function getAuth() {
  return {};
}

export class GoogleAuthProvider {
  setCustomParameters() {}
}

export async function signInWithPopup() {
  const account = window.__e2eGoogleAccount;
  if (!account) throw Object.assign(new Error("Popup closed"), { code: "auth/popup-closed-by-user" });
  return { user: { email: account.email, getIdToken: async () => JSON.stringify(account) } };
}
