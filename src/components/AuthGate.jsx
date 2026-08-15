import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { useEffect, useState } from "react";

import { auth, googleProvider } from "../firebase";

function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  /*
   * ログイン状態を監視
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setIsLoading(false);
      },
      (error) => {
        console.error("認証状態確認エラー:", error);

        setErrorMessage("ログイン状態を確認できませんでした。");

        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  /*
   * Googleログイン
   */
  const handleGoogleLogin = async () => {
    try {
      setErrorMessage("");

      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Googleログインエラー:", error);

      if (error?.code === "auth/popup-closed-by-user") {
        setErrorMessage("Googleログインがキャンセルされました。");

        return;
      }

      setErrorMessage("Googleログインに失敗しました。");
    }
  };

  /*
   * ログアウト
   */
  const handleLogout = async () => {
    try {
      setErrorMessage("");

      await signOut(auth);
    } catch (error) {
      console.error("ログアウトエラー:", error);

      setErrorMessage("ログアウトできませんでした。");
    }
  };

  /*
   * Firebaseがログイン状態を
   * 確認している途中
   */
  if (isLoading) {
    return (
      <main
        style={{
          maxWidth: "500px",
          margin: "100px auto",
          textAlign: "center",
        }}
      >
        <p>ログイン状態を確認しています...</p>
      </main>
    );
  }

  /*
   * 未ログイン
   */
  if (!user) {
    return (
      <main
        style={{
          maxWidth: "500px",
          margin: "100px auto",
          padding: "30px",
          textAlign: "center",
        }}
      >
        <h1>Quake Photo Manager</h1>

        <p>Googleアカウントで ログインしてください。</p>

        <button type="button" onClick={handleGoogleLogin}>
          Googleでログイン
        </button>

        {errorMessage && (
          <p
            style={{
              color: "red",
              marginTop: "20px",
            }}
          >
            {errorMessage}
          </p>
        )}
      </main>
    );
  }

  /*
   * ログイン済み
   */
  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "12px",
          padding: "8px 16px",
          borderBottom: "1px solid #ddd",
        }}
      >
        {user.photoURL && (
          <img
            src={user.photoURL}
            alt=""
            width="32"
            height="32"
            style={{
              borderRadius: "50%",
            }}
          />
        )}

        <span>{user.displayName || user.email || "ログイン中"}</span>

        <button type="button" onClick={handleLogout}>
          ログアウト
        </button>
      </div>

      {errorMessage && (
        <p
          style={{
            color: "red",
            textAlign: "right",
            paddingRight: "16px",
          }}
        >
          {errorMessage}
        </p>
      )}

      {children}
    </>
  );
}

export default AuthGate;
