// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
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

// Initialized App Check instance (initializeAppCheck returns it, and the
// App Check pre-flight in ActiveScan uses it with getToken).
export let appCheck;

// Initialize App Check with your debug token for local testing
if (typeof window !== 'undefined') {
  // Paste your generated debug token string right here
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = "7F34BB8D-03C1-4C07-9CAD-1A9F02FBD9E6";

  // Use the reCAPTCHA Enterprise Site Key you created in Google Cloud
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider('6LfvZR0uAAAAANaUc7McXvKTVgSwWF4RJQOGrzH7'),
    isTokenAutoRefreshEnabled: true
  });
}

// Firebase AI Logic instance: hybrid on-device (Gemini Nano) with cloud fallback.
export const aiLogic = getAI(app);
