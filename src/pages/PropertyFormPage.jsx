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

  /**
   * 1件保存
   */
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

  /**
   * PDFから読み取った複数件を一括保存
   */
  const handleBulkSave = async (properties) => {
    if (!Array.isArray(properties)) {
      throw new Error("登録データの形式が正しくありません。");
    }

    if (properties.length === 0) {
      throw new Error("登録する物件情報がありません。");
    }

    console.log("PDF一括登録を開始します:", properties);

    let savedCount = 0;

    for (const [index, property] of properties.entries()) {
      const managementNumber = String(property.managementNumber ?? "").trim();

      const inspectionDate = String(property.inspectionDate ?? "").trim();

      const propertyName = String(property.propertyName ?? "").trim();

      const inspectionType = String(property.inspectionType ?? "").trim();

      const address = String(property.address ?? "").trim();

      const supervisor = String(property.supervisor ?? "").trim();

      if (!managementNumber) {
        throw new Error(`${index + 1}件目の管理番号が空です。`);
      }

      if (!inspectionDate) {
        throw new Error(`${managementNumber} の検査日が空です。`);
      }

      if (!propertyName) {
        throw new Error(`${managementNumber} の物件名が空です。`);
      }

      if (!inspectionType) {
        throw new Error(`${managementNumber} の検査種別が空です。`);
      }

      const saveData = {
        managementNumber,
        inspectionDate,
        propertyName,
        inspectionType,
        address,
        supervisor,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      console.log(`${index + 1}件目を登録します:`, saveData);

      try {
        const documentReference = await addDoc(
          collection(db, "properties"),
          saveData,
        );

        savedCount += 1;

        console.log(`${index + 1}件目を登録しました:`, documentReference.id);
      } catch (error) {
        console.error(`${index + 1}件目の登録エラー:`, error);

        throw error;
      }
    }

    console.log(`${savedCount}件を一括登録しました。`);

    return savedCount;
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
        onBulkSave={handleBulkSave}
        onClose={handleClose}
        isEditMode={isEditMode}
      />
    </main>
  );
}

export default PropertyFormPage;
