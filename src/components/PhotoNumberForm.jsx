import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { db } from "../firebase";
import { normalizeInspectionType } from "../utils/inspectionTypeUtils";

/**
 * Firestoreから検査種別に対応する
 * 写真項目を読み込む
 */
async function loadPhotoItemsFromFirestore(inspectionType) {
  const normalizedInspectionType = normalizeInspectionType(inspectionType);

  if (!normalizedInspectionType) {
    throw new Error("検査種別が設定されていません。");
  }

  const photoItemQuery = query(
    collection(db, "photoItemSettings"),
    where("normalizedInspectionType", "==", normalizedInspectionType),
    limit(1),
  );

  const snapshot = await getDocs(photoItemQuery);

  if (snapshot.empty) {
    throw new Error(
      `検査種別「${inspectionType}」の写真項目設定がありません。`,
    );
  }

  const photoItemData = snapshot.docs[0].data();

  if (!Array.isArray(photoItemData.items) || photoItemData.items.length === 0) {
    throw new Error(
      `検査種別「${inspectionType}」には写真項目が登録されていません。`,
    );
  }

  return photoItemData.items
    .map((item) => String(item ?? "").trim())
    .filter((item) => item !== "");
}

/**
 * 写真番号の初期値を作成する
 */
function createInitialPhotoNumbers(savedPhotoNumbers, photoItems) {
  const initialNumbers = {};

  photoItems.forEach((item) => {
    initialNumbers[item] = savedPhotoNumbers?.[item] ?? "";
  });

  return initialNumbers;
}

/**
 * 現在表示中の項目だけを
 * 保存データにする
 */
function createPhotoNumbersForSave(photoNumbers, photoItems) {
  const filteredPhotoNumbers = {};

  photoItems.forEach((item) => {
    filteredPhotoNumbers[item] = photoNumbers[item] ?? "";
  });

  return filteredPhotoNumbers;
}

function PhotoNumberForm({ propertyData, onBack, onSaved }) {
  const navigate = useNavigate();

  const inspectionType = propertyData?.inspectionType ?? "";

  const [photoItems, setPhotoItems] = useState([]);

  const [photoNumbers, setPhotoNumbers] = useState({});

  const [isLoadingItems, setIsLoadingItems] = useState(true);

  const [isSaving, setIsSaving] = useState(false);

  const [message, setMessage] = useState("");

  const [loadError, setLoadError] = useState("");

  const inputRefs = useRef([]);

  /**
   * Firestoreから
   * ・写真項目マスター
   * ・物件ごとの保存済み写真番号
   * を読み込む
   */
  useEffect(() => {
    let isActive = true;

    async function initializePhotoItems() {
      try {
        setIsLoadingItems(true);
        setLoadError("");
        setMessage("");

        if (!propertyData?.id) {
          throw new Error("物件IDがありません。");
        }

        /*
         * 検査種別に対応した写真項目
         */
        const nextPhotoItems =
          await loadPhotoItemsFromFirestore(inspectionType);

        /*
         * 物件ごとの保存済み写真番号
         */
        const propertyPhotoReference = doc(
          db,
          "propertyPhotos",
          propertyData.id,
        );

        const propertyPhotoSnapshot = await getDoc(propertyPhotoReference);

        let savedPhotoNumbers = {};

        if (propertyPhotoSnapshot.exists()) {
          savedPhotoNumbers = propertyPhotoSnapshot.data().photoNumbers ?? {};
        }

        if (!isActive) {
          return;
        }

        const nextPhotoNumbers = createInitialPhotoNumbers(
          savedPhotoNumbers,
          nextPhotoItems,
        );

        inputRefs.current = [];

        setPhotoItems(nextPhotoItems);

        setPhotoNumbers(nextPhotoNumbers);
      } catch (error) {
        console.error("写真項目読み込みエラー:", error);

        if (!isActive) {
          return;
        }

        setPhotoItems([]);
        setPhotoNumbers({});

        const errorText =
          error instanceof Error ? error.message : String(error);

        setLoadError(`写真項目を読み込めませんでした：${errorText}`);
      } finally {
        if (isActive) {
          setIsLoadingItems(false);
        }
      }
    }

    initializePhotoItems();

    return () => {
      isActive = false;
    };
  }, [inspectionType, propertyData?.id]);

  /**
   * 写真番号変更
   */
  const handleChange = (item, value) => {
    setPhotoNumbers((previous) => ({
      ...previous,
      [item]: value,
    }));
  };

  /**
   * Enterキーで次の入力欄へ移動
   */
  const handleKeyDown = (event, index) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    const nextInput = inputRefs.current[index + 1];

    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }
  };

  /**
   * 写真番号をpropertyPhotosへ保存
   */
  const handleSave = async () => {
    if (isSaving) {
      return;
    }

    if (!propertyData?.id) {
      setMessage("物件IDがありません。先に物件を登録してください。");
      return;
    }

    try {
      setIsSaving(true);
      setMessage("");

      const photoNumbersForSave = createPhotoNumbersForSave(
        photoNumbers,
        photoItems,
      );

      const propertyPhotoReference = doc(db, "propertyPhotos", propertyData.id);

      const existingSnapshot = await getDoc(propertyPhotoReference);

      const saveData = {
        propertyId: propertyData.id,

        managementNumber: propertyData.managementNumber ?? "",

        propertyName: propertyData.propertyName ?? "",

        inspectionDate: propertyData.inspectionDate ?? "",

        inspectionType: propertyData.inspectionType ?? "",

        photoItems,

        photoNumbers: photoNumbersForSave,

        updatedAt: serverTimestamp(),
      };

      /*
       * 新規作成時だけcreatedAtを追加
       */
      if (!existingSnapshot.exists()) {
        saveData.createdAt = serverTimestamp();
      }

      await setDoc(propertyPhotoReference, saveData, {
        merge: true,
      });

      setMessage("写真番号を保存しました。");

      window.setTimeout(() => {
        if (typeof onSaved === "function") {
          onSaved();
          return;
        }

        navigate("/");
      }, 1000);
    } catch (error) {
      console.error("写真番号保存エラー:", error);

      const errorText = error instanceof Error ? error.message : String(error);

      setMessage(`保存できませんでした：${errorText}`);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 戻る
   */
  const handleBack = () => {
    if (typeof onBack === "function") {
      onBack();
      return;
    }

    navigate("/");
  };

  if (isLoadingItems) {
    return (
      <section className="photo-form-area">
        <h2>写真番号入力</h2>

        <p>写真項目を読み込んでいます...</p>
      </section>
    );
  }

  return (
    <section className="photo-form-area">
      <div className="property-summary">
        <p>
          <strong>物件名：</strong>
          {propertyData?.propertyName ?? ""}
        </p>

        <p>
          <strong>検査種別：</strong>
          {propertyData?.inspectionType ?? ""}
        </p>
      </div>

      {loadError && <p className="error-message">{loadError}</p>}

      {photoItems.length > 0 && (
        <table className="photo-number-table">
          <thead>
            <tr>
              <th>項目</th>
              <th>写真番号</th>
            </tr>
          </thead>

          <tbody>
            {photoItems.map((item, index) => (
              <tr key={item}>
                <td>{item}</td>

                <td>
                  <input
                    ref={(element) => {
                      inputRefs.current[index] = element;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoFocus={index === 0}
                    value={photoNumbers[item] ?? ""}
                    onChange={(event) => handleChange(item, event.target.value)}
                    onKeyDown={(event) => handleKeyDown(event, index)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {message && <p className="save-message">{message}</p>}

      <div className="form-buttons">
        <button type="button" onClick={handleBack} disabled={isSaving}>
          戻る
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || photoItems.length === 0}
        >
          {isSaving ? "保存中..." : "保存"}
        </button>
      </div>
    </section>
  );
}

export default PhotoNumberForm;
