import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCv_AVo0MhSHqU-R9JjZiiDDjItadxauAk",
  authDomain: "inspection-photo-app.firebaseapp.com",
  projectId: "inspection-photo-app",
  storageBucket: "inspection-photo-app.firebasestorage.app",
  messagingSenderId: "377579657159",
  appId: "1:377579657159:web:bd788ad1a5544005736be2",
  measurementId: "G-LCBKMLKKZS"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);