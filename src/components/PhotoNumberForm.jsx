import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";

import { db } from "../firebase";
import { loadPhotoItemsFromExcel } from "../utils/loadPhotoItems";

/*
 * Excelを読み込めなかった場合に表示する既定項目
 */
const defaultPhotoItems = [
  "全景",
  "基礎",
  "土台と基礎",
  "柱脚金物",
  "柱頭金物",
  "筋交い金物",
  "横架材",
  "小屋裏1",
  "小屋裏2",
  "小屋裏3",
  "床釘ピッチ",
  "火打金物",
  "垂木金物",
];

/**
 * 検査種別の文字を比較しやすい形にそろえる
 *
 * 削除するもの
 * ・半角スペース
 * ・全角スペース
 * ・改行
 * ・タブ
 *
 * また、全角英数字を半角へ変換する
 */
function normalizeInspectionType(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s\u3000]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Excelの検査種別から、現在のinspectionTypeに一致する項目を探す
 */
function findPhotoItemsByInspectionType(
  photoItemsByInspectionType,
  inspectionType,
) {
  const normalizedCurrentType = normalizeInspectionType(inspectionType);

  if (!normalizedCurrentType) {
    return null;
  }

  /*
   * 最初に完全一致を確認する
   */
  if (Array.isArray(photoItemsByInspectionType[inspectionType])) {
    return {
      matchedInspectionType: inspectionType,
      photoItems: photoItemsByInspectionType[inspectionType],
    };
  }

  /*
   * 空白や全角・半角の違いを無視して検索する
   */
  const matchedEntry = Object.entries(photoItemsByInspectionType).find(
    ([excelInspectionType]) => {
      return (
        normalizeInspectionType(excelInspectionType) === normalizedCurrentType
      );
    },
  );

  if (matchedEntry) {
    return {
      matchedInspectionType: matchedEntry[0],
      photoItems: matchedEntry[1],
    };
  }

  /*
   * 「検査」の有無だけが違う場合にも対応する
   *
   * 例：
   * Excel       躯体検査
   * propertyData 躯体
   */
  const currentTypeWithoutInspection = normalizedCurrentType.replace(
    /検査$/g,
    "",
  );

  const relaxedMatchedEntry = Object.entries(photoItemsByInspectionType).find(
    ([excelInspectionType]) => {
      const normalizedExcelType = normalizeInspectionType(
        excelInspectionType,
      ).replace(/検査$/g, "");

      return normalizedExcelType === currentTypeWithoutInspection;
    },
  );

  if (relaxedMatchedEntry) {
    return {
      matchedInspectionType: relaxedMatchedEntry[0],
      photoItems: relaxedMatchedEntry[1],
    };
  }

  return null;
}

/**
 * 写真番号の初期値を作成する
 */
function createInitialPhotoNumbers(propertyData, photoItems) {
  const initialNumbers = {};

  photoItems.forEach((item) => {
    initialNumbers[item] = propertyData?.photoNumbers?.[item] ?? "";
  });

  return initialNumbers;
}

/**
 * 現在表示している項目だけを保存用に取り出す
 */
function createPhotoNumbersForSave(photoNumbers, photoItems) {
  const filteredPhotoNumbers = {};

  photoItems.forEach((item) => {
    filteredPhotoNumbers[item] = photoNumbers[item] ?? "";
  });

  return filteredPhotoNumbers;
}

function PhotoNumberForm({ propertyData, onBack, onSaved }) {
  const inspectionType = propertyData?.inspectionType ?? "";

  const [photoItems, setPhotoItems] = useState([]);

  const [photoNumbers, setPhotoNumbers] = useState({});

  const [isLoadingItems, setIsLoadingItems] = useState(true);

  const [isSaving, setIsSaving] = useState(false);

  const [message, setMessage] = useState("");

  const [loadError, setLoadError] = useState("");

  const [matchedInspectionType, setMatchedInspectionType] = useState("");

  const inputRefs = useRef([]);

  /*
   * 画面表示時にExcelを読み込む
   */
  useEffect(() => {
    let isActive = true;

    async function initializePhotoItems() {
      try {
        setIsLoadingItems(true);
        setLoadError("");
        setMatchedInspectionType("");

        const photoItemsByInspectionType = await loadPhotoItemsFromExcel();

        /*
         * 原因確認用
         */
        console.log("Excelから読み込んだ写真項目:", photoItemsByInspectionType);

        console.log("物件のinspectionType:", inspectionType);

        console.log(
          "正規化後のinspectionType:",
          normalizeInspectionType(inspectionType),
        );

        if (!isActive) {
          return;
        }

        const matchedResult = findPhotoItemsByInspectionType(
          photoItemsByInspectionType,
          inspectionType,
        );

        let nextPhotoItems;

        if (
          matchedResult &&
          Array.isArray(matchedResult.photoItems) &&
          matchedResult.photoItems.length > 0
        ) {
          nextPhotoItems = matchedResult.photoItems;

          setMatchedInspectionType(matchedResult.matchedInspectionType);

          setLoadError("");

          console.log(
            "一致したExcelの検査種別:",
            matchedResult.matchedInspectionType,
          );

          console.log("表示する写真項目:", matchedResult.photoItems);
        } else {
          nextPhotoItems = defaultPhotoItems;

          const excelTypes = Object.keys(photoItemsByInspectionType);

          console.warn("一致する検査種別がありません。", {
            propertyInspectionType: inspectionType,
            excelInspectionTypes: excelTypes,
          });

          setLoadError(
            `Excelに「${
              inspectionType || "未選択"
            }」と一致する設定がありません。既定の写真項目を表示しています。Excelに登録されている検査種別：${
              excelTypes.length > 0 ? excelTypes.join("、") : "なし"
            }`,
          );
        }

        const nextPhotoNumbers = createInitialPhotoNumbers(
          propertyData,
          nextPhotoItems,
        );

        inputRefs.current = [];

        setPhotoItems(nextPhotoItems);
        setPhotoNumbers(nextPhotoNumbers);
      } catch (error) {
        console.error("写真項目Excel読込エラー:", error);

        if (!isActive) {
          return;
        }

        const nextPhotoItems = defaultPhotoItems;

        setPhotoItems(nextPhotoItems);

        setPhotoNumbers(
          createInitialPhotoNumbers(propertyData, nextPhotoItems),
        );

        setMatchedInspectionType("");

        setLoadError(
          `写真項目Excelを読み込めませんでした：${
            error.message ?? "不明なエラー"
          }`,
        );
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
  }, [inspectionType, propertyData?.id, propertyData?.photoNumbers]);

  /**
   * 入力値変更
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
   * Firestoreへ保存
   */
  const handleSave = async () => {
    if (isSaving) {
      return;
    }

    if (!propertyData) {
      setMessage("物件情報がありません。");
      return;
    }

    try {
      setIsSaving(true);
      setMessage("");

      const photoNumbersForSave = createPhotoNumbersForSave(
        photoNumbers,
        photoItems,
      );

      const saveData = {
        managementNumber: propertyData.managementNumber ?? "",

        inspectionDate: propertyData.inspectionDate ?? "",

        propertyName: propertyData.propertyName ?? "",

        inspectionType: propertyData.inspectionType ?? "",

        address: propertyData.address ?? "",

        supervisor: propertyData.supervisor ?? "",

        photoNumbers: photoNumbersForSave,

        updatedAt: serverTimestamp(),
      };

      if (propertyData.id) {
        const propertyReference = doc(db, "properties", propertyData.id);

        await updateDoc(propertyReference, saveData);

        setMessage("更新しました。");
      } else {
        await addDoc(collection(db, "properties"), {
          ...saveData,
          createdAt: serverTimestamp(),
        });

        setMessage("保存しました。");
      }

      window.setTimeout(() => {
        if (typeof onSaved === "function") {
          onSaved();
        }
      }, 1000);
    } catch (error) {
      console.error("保存エラー:", error);

      setMessage(
        `保存できませんでした：${
          error.code ?? error.message ?? "不明なエラー"
        }`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingItems) {
    return (
      <section className="photo-form-area">
        <h2>{propertyData?.id ? "写真番号編集" : "写真番号入力"}</h2>

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
      </div>

      {loadError && <p className="error-message">{loadError}</p>}

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

      {message && <p className="save-message">{message}</p>}

      <div className="form-buttons">
        <button type="button" onClick={onBack} disabled={isSaving}>
          戻る
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || photoItems.length === 0}
        >
          {isSaving ? "保存中..." : propertyData?.id ? "更新" : "保存"}
        </button>
      </div>
    </section>
  );
}

export default PhotoNumberForm;
