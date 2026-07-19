import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import PropertyForm from "../components/PropertyForm";
import { db } from "../firebase";

function PropertyFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const isEditMode = Boolean(id);

  const [initialData, setInitialData] = useState(null);
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    // 新規登録の場合は読み込み不要
    if (!isEditMode) {
      setIsLoading(false);
      return;
    }

    let isCancelled = false;

    const loadProperty = async () => {
      try {
        setIsLoading(true);
        setLoadError("");

        const propertyReference = doc(db, "properties", id);

        const propertySnapshot = await getDoc(propertyReference);

        if (isCancelled) {
          return;
        }

        if (!propertySnapshot.exists()) {
          setLoadError("編集する物件が見つかりませんでした。");
          return;
        }

        setInitialData({
          id: propertySnapshot.id,
          ...propertySnapshot.data(),
        });
      } catch (error) {
        console.error("物件情報の読み込みエラー:", error);

        if (!isCancelled) {
          setLoadError("物件情報を読み込めませんでした。");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadProperty();

    return () => {
      isCancelled = true;
    };
  }, [id, isEditMode]);

  const handleSave = async (formData) => {
    console.log("保存するデータ:", formData);
    console.log("編集モード:", isEditMode);
    console.log("物件ID:", id);

    if (isEditMode) {
      const propertyReference = doc(db, "properties", id);

      await updateDoc(propertyReference, {
        ...formData,
        updatedAt: serverTimestamp(),
      });

      console.log("物件情報を更新しました。");
    } else {
      const documentReference = await addDoc(collection(db, "properties"), {
        ...formData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      console.log("物件を登録しました:", documentReference.id);
    }

    navigate("/");
  };

  const handleClose = () => {
    navigate("/");
  };

  if (isLoading) {
    return <p>物件情報を読み込み中です...</p>;
  }

  if (loadError) {
    return (
      <main>
        <p>{loadError}</p>

        <button type="button" onClick={() => navigate("/")}>
          物件一覧へ戻る
        </button>
      </main>
    );
  }

  if (isEditMode && !initialData) {
    return <p>物件情報がありません。</p>;
  }

  return (
    <main>
      <PropertyForm
        key={id ?? "new"}
        initialData={initialData}
        onSave={handleSave}
        onClose={handleClose}
        isEditMode={isEditMode}
      />
    </main>
  );
}

export default PropertyFormPage;
