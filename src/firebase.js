import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  OAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  signInWithPopup
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase configuration loaded from Vite environment variables.
// Fallback values prevent the app from crashing on start if keys are not yet configured.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyPlaceholderKeyForViteDevBuild",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "fitness-management-mock.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "fitness-management-mock",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "fitness-management-mock.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:mockappid"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Authentication Providers
const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider('apple.com');

// Scopes configuration
googleProvider.addScope('email');
googleProvider.addScope('profile');

export { 
  auth, 
  googleProvider, 
  appleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  signInWithPopup,
  db
};

