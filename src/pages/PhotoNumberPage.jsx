import { doc, getDoc } from "firebase/firestore";

import { useEffect, useState } from "react";

import { useLocation, useNavigate, useParams } from "react-router-dom";

import PhotoNumberForm from "../components/PhotoNumberForm";
import { db } from "../firebase";

function PhotoNumberPage() {
  const navigate = useNavigate();

  const location = useLocation();

  const { id } = useParams();

  /* =======================================================
   * 物件入力画面などから渡された物件データ
   * ======================================================= */

  const passedPropertyData = location.state?.propertyData ?? null;

  /* =======================================================
   * state
   * ======================================================= */

  const [propertyData, setPropertyData] = useState(passedPropertyData);

  const [isLoading, setIsLoading] = useState(
    Boolean(id && !passedPropertyData),
  );

  const [error, setError] = useState("");

  /* =======================================================
   * URLに物件IDがある場合
   * Firestoreから物件を取得
   * ======================================================= */

  useEffect(() => {
    /*
     * stateで物件が渡されている場合は
     * Firestore読込不要
     */
    if (!id || passedPropertyData) {
      return;
    }

    let isActive = true;

    const loadProperty = async () => {
      try {
        setIsLoading(true);
        setError("");

        const propertyReference = doc(db, "properties", id);

        const propertySnapshot = await getDoc(propertyReference);

        if (!isActive) {
          return;
        }

        if (!propertySnapshot.exists()) {
          setError("物件データが見つかりません。");

          return;
        }

        setPropertyData({
          id: propertySnapshot.id,

          ...propertySnapshot.data(),
        });
      } catch (loadError) {
        console.error("物件読み込みエラー:", loadError);

        if (!isActive) {
          return;
        }

        const errorText =
          loadError instanceof Error ? loadError.message : String(loadError);

        setError(`物件を読み込めませんでした：${errorText}`);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadProperty();

    return () => {
      isActive = false;
    };
  }, [id, passedPropertyData]);

  /* =======================================================
   * 戻る
   *
   * 既存物件なら編集画面
   *
   * 新規なら新規物件画面
   * ======================================================= */

  const handleBack = () => {
    if (propertyData?.id) {
      navigate(`/property/edit/${propertyData.id}`, {
        state: {
          propertyData,
        },
      });

      return;
    }

    navigate("/property/new", {
      state: {
        propertyData,
      },
    });
  };

  /* =======================================================
   * 保存完了
   * ======================================================= */

  const handleSaved = () => {
    navigate("/");
  };

  /* =======================================================
   * 読込中
   * ======================================================= */

  if (isLoading) {
    return <p>読み込み中...</p>;
  }

  /* =======================================================
   * エラー
   * ======================================================= */

  if (error) {
    return (
      <section>
        <p>{error}</p>

        <button type="button" onClick={() => navigate("/")}>
          一覧へ戻る
        </button>
      </section>
    );
  }

  /* =======================================================
   * 物件データなし
   * ======================================================= */

  if (!propertyData) {
    return (
      <section>
        <p>物件情報がありません。 物件入力画面から開いてください。</p>

        <button type="button" onClick={() => navigate("/")}>
          一覧へ戻る
        </button>
      </section>
    );
  }

  /* =======================================================
   * 写真番号入力画面
   * ======================================================= */

  return (
    <PhotoNumberForm
      key={propertyData.id || "new"}
      propertyData={propertyData}
      onBack={handleBack}
      onSaved={handleSaved}
    />
  );
}

export default PhotoNumberPage;
