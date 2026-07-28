import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import PropertyForm from "../components/PropertyForm";
import { db } from "../firebase";

function PropertyFormPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  const passedPropertyData = location.state?.propertyData ?? null;

  const [initialData, setInitialData] = useState(passedPropertyData);

  const [isLoading, setIsLoading] = useState(
    Boolean(id && !passedPropertyData),
  );

  const [errorMessage, setErrorMessage] = useState("");

  const isEditMode = Boolean(id);

  useEffect(() => {
    if (!id || passedPropertyData) {
      return;
    }

    let isActive = true;

    async function loadProperty() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const propertyReference = doc(db, "properties", id);
        const propertySnapshot = await getDoc(propertyReference);

        if (!propertySnapshot.exists()) {
          throw new Error("物件データが見つかりません。");
        }

        if (!isActive) {
          return;
        }

        setInitialData({
          id: propertySnapshot.id,
          ...propertySnapshot.data(),
        });
      } catch (error) {
        console.error("物件読み込みエラー:", error);

        if (!isActive) {
          return;
        }

        const errorText =
          error instanceof Error ? error.message : String(error);

        setErrorMessage(`物件を読み込めませんでした：${errorText}`);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadProperty();

    return () => {
      isActive = false;
    };
  }, [id, passedPropertyData]);

  /**
   * 通常の1件保存
   */
  const handleSave = async (formData) => {
    try {
      setErrorMessage("");

      if (isEditMode) {
        const propertyReference = doc(db, "properties", id);

        await updateDoc(propertyReference, {
          ...formData,
          updatedAt: serverTimestamp(),
        });

        navigate("/");
        return;
      }

      await addDoc(collection(db, "properties"), {
        ...formData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      navigate("/");
    } catch (error) {
      console.error("物件保存エラー:", error);

      const errorText = error instanceof Error ? error.message : String(error);

      setErrorMessage(`物件を保存できませんでした：${errorText}`);

      throw error;
    }
  };

  /**
   * PDFから読み取った複数物件を一括保存
   */
  const handleBulkSave = async (properties) => {
    try {
      setErrorMessage("");

      if (!Array.isArray(properties) || properties.length === 0) {
        throw new Error("登録する物件データがありません。");
      }

      const batch = writeBatch(db);
      const propertiesCollection = collection(db, "properties");

      properties.forEach((property) => {
        const propertyReference = doc(propertiesCollection);

        batch.set(propertyReference, {
          managementNumber: String(property.managementNumber ?? "").trim(),

          inspectionDate: String(property.inspectionDate ?? "").trim(),

          propertyName: String(property.propertyName ?? "").trim(),

          inspectionType: String(property.inspectionType ?? "").trim(),

          address: String(property.address ?? "").trim(),

          supervisor: String(property.supervisor ?? "").trim(),

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      await batch.commit();

      return properties.length;
    } catch (error) {
      console.error("PDF一括保存エラー:", error);

      const errorText = error instanceof Error ? error.message : String(error);

      setErrorMessage(`PDFの物件を保存できませんでした：${errorText}`);

      throw error;
    }
  };

  const handleClose = () => {
    navigate("/");
  };

  if (isLoading) {
    return <p>物件情報を読み込んでいます...</p>;
  }

  if (errorMessage && isEditMode && !initialData) {
    return (
      <section>
        <p className="error-message">{errorMessage}</p>

        <button type="button" onClick={() => navigate("/")}>
          一覧へ戻る
        </button>
      </section>
    );
  }

  return (
    <>
      {errorMessage && <p className="error-message">{errorMessage}</p>}

      <PropertyForm
        key={id ?? "new"}
        initialData={initialData}
        isEditMode={isEditMode}
        onSave={handleSave}
        onBulkSave={handleBulkSave}
        onClose={handleClose}
      />
    </>
  );
}

export default PropertyFormPage;
