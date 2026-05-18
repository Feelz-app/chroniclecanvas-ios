import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "firebase/app-check";

/* YOUR CONFIG */
const firebaseConfig = {
  apiKey: "AIzaSyC2MUWbKYceNjJfi3ijZwpN-EMSxBqqDHU",
  authDomain: "timeline-builder-a5292.firebaseapp.com",
  projectId: "timeline-builder-a5292",
  storageBucket: "timeline-builder-a5292.firebasestorage.app",
  messagingSenderId: "500393519729",
  appId: "1:500393519729:web:618e5b59ba30e8437089d0"
};

/* INIT */
const app = initializeApp(firebaseConfig);

const isLocalDebugHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);

const isNativeChronicleCanvasIos =
  typeof window !== "undefined" &&
  (
    window.Capacitor?.isNativePlatform?.() === true ||
    /iPad|iPhone|iPod/i.test(window.navigator?.userAgent || "")
  );

if (isLocalDebugHost) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

export const appCheck = isNativeChronicleCanvasIos
  ? null
  : initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider("6LfmDb0sAAAAAMVwWqtliUtKsznOTWPXPAf3f9d5"),
      isTokenAutoRefreshEnabled: true
    });

/* EXPORTS */
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
