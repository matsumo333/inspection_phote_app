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
import * as XLSX from "xlsx";

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

/**
 * ファイル名に使えない文字を置き換える
 */
function sanitizeFileName(value) {
  const text = String(value ?? "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim();

  return text || "写真番号";
}

/**
 * 列幅を文字数に応じて作成する
 */
function createColumnWidths(rowData) {
  return Object.entries(rowData).map(([heading, value]) => {
    const headingLength = String(heading).length;

    const valueLength = String(value ?? "").length;

    return {
      wch: Math.min(Math.max(headingLength, valueLength, 10) + 2, 45),
    };
  });
}

const JUDGMENT_MARKS = ["＊", "*", "※", "米", "〇", "○", "△", "×"];

function isJudgmentItem(item) {
  const firstCharacter = String(item ?? "")
    .trim()
    .charAt(0);

  return JUDGMENT_MARKS.includes(firstCharacter);
}

function PhotoNumberForm({ propertyData, onBack, onSaved }) {
  const navigate = useNavigate();

  const inspectionType = propertyData?.inspectionType ?? "";

  const [photoItems, setPhotoItems] = useState([]);

  const [photoNumbers, setPhotoNumbers] = useState({});

  const [isLoadingItems, setIsLoadingItems] = useState(true);

  const [isSaving, setIsSaving] = useState(false);

  const [isDownloading, setIsDownloading] = useState(false);

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
   * Firestoreへ保存するデータを作成する
   */
  const createSaveData = () => {
    const photoNumbersForSave = createPhotoNumbersForSave(
      photoNumbers,
      photoItems,
    );

    return {
      propertyId: propertyData?.id ?? "",

      managementNumber: propertyData?.managementNumber ?? "",

      propertyName: propertyData?.propertyName ?? "",

      inspectionDate: propertyData?.inspectionDate ?? "",

      inspectionType: propertyData?.inspectionType ?? "",

      address: propertyData?.address ?? "",

      photoItems,

      photoNumbers: photoNumbersForSave,

      updatedAt: serverTimestamp(),
    };
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

      const propertyPhotoReference = doc(db, "propertyPhotos", propertyData.id);

      const existingSnapshot = await getDoc(propertyPhotoReference);

      const saveData = createSaveData();

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
   * Excelダウンロード用の
   * 1行分のデータを作成する
   */
  const createExcelRow = (targetPhotoNumbers) => {
    const rowData = {
      管理番号: propertyData?.managementNumber ?? "",

      検査日: propertyData?.inspectionDate ?? "",

      物件名: propertyData?.propertyName ?? "",

      検査種別: propertyData?.inspectionType ?? "",

      住所: propertyData?.address ?? "",
    };

    /*
     * 写真項目を横方向の列として追加する
     */
    photoItems.forEach((item) => {
      rowData[item] = targetPhotoNumbers?.[item] ?? "";
    });

    return rowData;
  };

  /**
   * 写真番号をExcelでダウンロードする
   *
   * 1物件を1行にし、
   * 写真項目を横方向へ並べる
   */
  const handleExcelDownload = async () => {
    if (isDownloading) {
      return;
    }

    if (!propertyData?.id) {
      setMessage("物件IDがありません。");
      return;
    }

    if (photoItems.length === 0) {
      setMessage("ダウンロードする写真項目がありません。");
      return;
    }

    try {
      setIsDownloading(true);
      setMessage("");

      /*
       * Firestoreに保存されている
       * 最新データを取得する
       */
      const propertyPhotoReference = doc(db, "propertyPhotos", propertyData.id);

      const propertyPhotoSnapshot = await getDoc(propertyPhotoReference);

      if (!propertyPhotoSnapshot.exists()) {
        throw new Error(
          "写真番号がまだ保存されていません。先に保存してください。",
        );
      }

      const savedData = propertyPhotoSnapshot.data();

      const savedPhotoNumbers = savedData.photoNumbers ?? {};

      const rowData = createExcelRow(savedPhotoNumbers);

      /*
       * 1物件1行のワークシートを作成
       */
      const worksheet = XLSX.utils.json_to_sheet([rowData]);

      /*
       * 列幅を調整
       */
      worksheet["!cols"] = createColumnWidths(rowData);

      /*
       * 先頭行を固定
       */
      worksheet["!freeze"] = {
        xSplit: 0,
        ySplit: 1,
      };

      /*
       * オートフィルターを設定
       */
      const worksheetRange = XLSX.utils.decode_range(worksheet["!ref"]);

      worksheet["!autofilter"] = {
        ref: XLSX.utils.encode_range({
          s: {
            r: 0,
            c: 0,
          },
          e: {
            r: worksheetRange.e.r,
            c: worksheetRange.e.c,
          },
        }),
      };

      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(workbook, worksheet, "写真番号");

      const managementNumber = sanitizeFileName(propertyData?.managementNumber);

      // const propertyName = sanitizeFileName(propertyData?.propertyName);

      const fileName = `${managementNumber}.xlsx`;

      XLSX.writeFile(workbook, fileName);

      setMessage("Excelをダウンロードしました。");
    } catch (error) {
      console.error("Excelダウンロードエラー:", error);

      const errorText = error instanceof Error ? error.message : String(error);

      setMessage(`Excelを作成できませんでした：${errorText}`);
    } finally {
      setIsDownloading(false);
    }
  };

  /**
   * 戻る
   */
  const handleBack = () => {
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
                  {isJudgmentItem(item) ? (
                    <select
                      ref={(element) => {
                        inputRefs.current[index] = element;
                      }}
                      autoFocus={index === 0}
                      value={photoNumbers[item] ?? ""}
                      onChange={(event) =>
                        handleChange(item, event.target.value)
                      }
                      onKeyDown={(event) => handleKeyDown(event, index)}
                    >
                      <option value="">－</option>

                      <option value="〇">〇</option>

                      <option value="✖">✖</option>
                    </select>
                  ) : (
                    <input
                      ref={(element) => {
                        inputRefs.current[index] = element;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoFocus={index === 0}
                      value={photoNumbers[item] ?? ""}
                      onChange={(event) =>
                        handleChange(item, event.target.value)
                      }
                      onKeyDown={(event) => handleKeyDown(event, index)}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {message && <p className="save-message">{message}</p>}

      <div className="form-buttons">
        <button
          type="button"
          onClick={handleBack}
          disabled={isSaving || isDownloading}
        >
          戻る
        </button>

        <button
          type="button"
          onClick={handleExcelDownload}
          disabled={isSaving || isDownloading || photoItems.length === 0}
        >
          {isDownloading ? "作成中..." : "Excelダウンロード"}
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isDownloading || photoItems.length === 0}
        >
          {isSaving ? "保存中..." : "保存"}
        </button>
      </div>
    </section>
  );
}

export default PhotoNumberForm;
