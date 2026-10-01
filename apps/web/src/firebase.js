import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingFirebaseVariables = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([name]) => name);

// Google sign-in is an optional feature layered on top of email/password auth.
// A missing Firebase config must never crash the whole app at module-eval
// time (that takes down every page, including plain email/password login) —
// so it degrades to null exports instead of throwing, and callers check
// `isFirebaseConfigured` before using them.
export const isFirebaseConfigured = missingFirebaseVariables.length === 0;

let app = null;
export let auth = null;
export let provider = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
}
