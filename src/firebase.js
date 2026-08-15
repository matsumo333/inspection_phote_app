import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/*
 * Firebase設定
 */
const firebaseConfig = {
  apiKey: "AIzaSyB_x8h8ILqKNxa9LPNcuDeZJjPsKD9uTNA",
  authDomain: "quake-photo-manager.firebaseapp.com",
  projectId: "quake-photo-manager",
  storageBucket: "quake-photo-manager.firebasestorage.app",
  messagingSenderId: "1068932948886",
  appId: "1:1068932948886:web:30a891dcb3a1ac5c76b3b7",
  measurementId: "G-CX7PYWQ13K",
};

/*
 * Firebase初期化
 */
const app = initializeApp(firebaseConfig);

/*
 * Firestore
 */
const db = getFirestore(app);

/*
 * Firebase Authentication
 */
const auth = getAuth(app);

/*
 * Googleログイン用プロバイダー
 */
const googleProvider = new GoogleAuthProvider();

/*
 * Googleアカウント選択画面を
 * 毎回表示したい場合
 */
googleProvider.setCustomParameters({
  prompt: "select_account",
});

/*
 * 他のファイルから使用できるようにする
 */
export { app, auth, db, googleProvider };
