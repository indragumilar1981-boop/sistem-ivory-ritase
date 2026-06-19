import { initializeApp } from "firebase/app";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

const isFirebaseConfigured = !!firebaseConfig.projectId;

let app;
let db = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    
    // Enable local offline persistence for real-time sync
    enableMultiTabIndexedDbPersistence(db).catch((err) => {
        if (err.code == 'failed-precondition') {
            console.warn("Firestore offline persistence: multiple tabs open.");
        } else if (err.code == 'unimplemented') {
            console.warn("Firestore offline persistence: browser unsupported.");
        } else {
            console.warn("Firestore offline persistence failed:", err);
        }
    });
  } catch (err) {
    console.error("Gagal menginisialisasi Firebase:", err);
  }
} else {
  console.warn("Firebase belum dikonfigurasi. Harap isi file .env Anda.");
}

export { db, isFirebaseConfigured };
