import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

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
    
    // Initialize Firestore with persistent local cache (offline-first)
    // Data will be stored locally in IndexedDB and synced to cloud when online
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
    
    console.log("Firestore initialized with persistent offline cache (IndexedDB).");
  } catch (err) {
    console.error("Gagal menginisialisasi Firebase:", err);
  }
} else {
  console.warn("Firebase belum dikonfigurasi. Harap isi file .env Anda.");
}

export { db, isFirebaseConfigured };
