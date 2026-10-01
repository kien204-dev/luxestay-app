// Google sign-in is optional. Without credentials the endpoint answers 503
// and everything else (email/password auth) works as usual.
function isGoogleLoginConfigured() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

// firebase-admin is only loaded on the first Google sign-in, so an install
// that never enables it does not load the SDK (or its dependency tree) at all.
function getCredential() {
  const { applicationDefault, cert } = require("firebase-admin/app");
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    return applicationDefault();
  }

  try {
    return cert(JSON.parse(serviceAccountJson));
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
}

function getFirebaseApp() {
  const { getApps, initializeApp } = require("firebase-admin/app");
  if (getApps().length > 0) return getApps()[0];

  return initializeApp({
    credential: getCredential(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

async function verifyFirebaseIdToken(idToken) {
  if (typeof idToken !== "string" || !idToken.trim()) {
    throw new Error("Firebase ID token is required");
  }

  const { getAuth } = require("firebase-admin/auth");
  return getAuth(getFirebaseApp()).verifyIdToken(idToken, true);
}

module.exports = { isGoogleLoginConfigured, verifyFirebaseIdToken };
