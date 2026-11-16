// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getFirestore } from "firebase/firestore";
import { getAI } from "firebase/ai";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};
export const app = initializeApp(firebaseConfig);

// Firestore database instance.
export const db = getFirestore(app);

// Initialized App Check instance (initializeAppCheck returns it, and the
// App Check pre-flight in ActiveScan uses it with getToken).
export let appCheck;

// App Check (Fraud Defense / reCAPTCHA Enterprise). The site key must belong
// to the SAME Firebase project as the config above and be registered under
// Firebase console > App Check. It is public, but keep it in env so each
// environment (local / preview / prod) can use its own key.
if (typeof window !== 'undefined') {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
  const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

  // Debug token only for local development: import.meta.env.DEV is false in
  // production builds, so this branch is dead-code-eliminated from prod.
  // Generate one via a debug run, then register it under
  // Firebase console > App Check > Manage debug tokens.
  if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  }

  if (configured && siteKey) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true
    });
  } else {
    // Intentionally leave appCheck undefined: callers (ActiveScan) already
    // fall back with a warning. Initializing with a missing/wrong key is
    // what produces the "AppCheck: 400 error" + throttle spam.
    console.warn(
      '[AppCheck] Skipped initialization (missing VITE_FIREBASE_* config or VITE_RECAPTCHA_SITE_KEY).'
    );
  }
}

// Firebase AI Logic instance: hybrid on-device (Gemini Nano) with cloud fallback.
export const aiLogic = getAI(app);
