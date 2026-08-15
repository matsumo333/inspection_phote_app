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
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";

import { db } from "../firebase";
import { normalizeInspectionType } from "../utils/inspectionTypeUtils";

/* =========================================================
 * Firestoreから写真項目を取得
 * ========================================================= */

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

/* =========================================================
 * 〇・✖などの判定項目
 * ========================================================= */

const JUDGMENT_MARKS = ["＊", "*", "※", "米", "〇", "○", "△", "×", "✖"];

function isJudgmentItem(item) {
  const firstCharacter = String(item ?? "")
    .trim()
    .charAt(0);

  return JUDGMENT_MARKS.includes(firstCharacter);
}

/* =========================================================
 * 連番
 *
 * ①～㊿
 * A～Z
 * a～z
 * ========================================================= */

const CIRCLED_NUMBERS = Array.from(
  "①②③④⑤⑥⑦⑧⑨⑩" +
    "⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳" +
    "㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚" +
    "㉛㉜㉝㉞㉟" +
    "㊱㊲㊳㊴㊵" +
    "㊶㊷㊸㊹㊺" +
    "㊻㊼㊽㊾㊿",
);

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/* =========================================================
 * 項目のグループ判定
 *
 * 例
 *
 * はり①  → はり::circled
 * はり②  → はり::circled
 *
 * 柱①    → 柱::circled
 *
 * 基礎①  → 基礎::circled
 *
 * 外壁A  → 外壁::letter
 * 外壁B  → 外壁::letter
 * 外壁a  → 外壁::letter
 *
 * 壁ばりA → 壁ばり::letter
 * 壁ばりa → 壁ばり::letter
 *
 * 開口部① → 開口部::circled
 *
 * A～Zとa～zは同じグループとして扱う
 * ========================================================= */

function getSequenceGroup(item) {
  const text = String(item ?? "").trim();

  if (!text) {
    return null;
  }

  const suffix = text.slice(-1);
  const category = text.slice(0, -1).trim();

  if (!category) {
    return null;
  }

  if (CIRCLED_NUMBERS.includes(suffix)) {
    return `${category}::circled`;
  }

  if (LETTERS.includes(suffix)) {
    return `${category}::letter`;
  }

  return null;
}

/* =========================================================
 * 写真番号の値を
 *
 * {
 *   distant: "10",
 *   close: "11"
 * }
 *
 * に統一
 *
 * 旧データが
 *
 * "10"
 *
 * の場合は遠景として読み込む
 * ========================================================= */

function normalizePhotoValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      distant: String(value.distant ?? value.far ?? ""),

      close: String(value.close ?? value.near ?? ""),
    };
  }

  return {
    distant: String(value ?? ""),
    close: "",
  };
}

/* =========================================================
 * 初期値
 * ========================================================= */

function createInitialPhotoNumbers(savedPhotoNumbers, photoItems) {
  const initialNumbers = {};

  photoItems.forEach((item) => {
    const savedValue = savedPhotoNumbers?.[item];

    if (isJudgmentItem(item)) {
      initialNumbers[item] = typeof savedValue === "string" ? savedValue : "";

      return;
    }

    initialNumbers[item] = normalizePhotoValue(savedValue);
  });

  return initialNumbers;
}

/* =========================================================
 * 入力済み判定
 * ========================================================= */

function hasEnteredValue(item, photoNumbers) {
  const value = photoNumbers?.[item];

  if (isJudgmentItem(item)) {
    return Boolean(String(value ?? "").trim());
  }

  const normalized = normalizePhotoValue(value);

  return Boolean(normalized.distant.trim() || normalized.close.trim());
}

/* =========================================================
 * 表示項目を作成
 *
 * グループごとに
 *
 * ・初期3行
 * ・最後に入力された行の2行先まで
 *
 * 表示
 * ========================================================= */

function createVisiblePhotoItems(photoItems, photoNumbers) {
  const groupItems = {};

  /*
   * グループ分け
   */
  photoItems.forEach((item) => {
    const group = getSequenceGroup(item);

    if (!group) {
      return;
    }

    if (!groupItems[group]) {
      groupItems[group] = [];
    }

    groupItems[group].push(item);
  });

  /*
   * 各グループの表示範囲
   */
  const visibleSets = {};

  Object.entries(groupItems).forEach(([groupName, items]) => {
    let lastEnteredIndex = -1;

    items.forEach((item, index) => {
      if (hasEnteredValue(item, photoNumbers)) {
        lastEnteredIndex = index;
      }
    });

    /*
     * 初期：
     *
     * ①
     * ②
     * ③
     *
     *
     * ②まで入力：
     *
     * ①
     * ②
     * ③
     * ④
     *
     *
     * ⑤まで入力：
     *
     * ①
     * ②
     * ③
     * ④
     * ⑤
     * ⑥
     * ⑦
     */

    const visibleCount = Math.min(
      items.length,

      Math.max(2, lastEnteredIndex + 2),
    );

    visibleSets[groupName] = new Set(items.slice(0, visibleCount));
  });

  /*
   * Firestore設定の並び順を維持
   */
  return photoItems.filter((item) => {
    const group = getSequenceGroup(item);

    /*
     * 連番項目でないものは
     * 常に表示
     */
    if (!group) {
      return true;
    }

    return visibleSets[group]?.has(item) ?? false;
  });
}

/* =========================================================
 * Firestore保存用
 * ========================================================= */

function createPhotoNumbersForSave(photoNumbers, photoItems) {
  const result = {};

  photoItems.forEach((item) => {
    if (isJudgmentItem(item)) {
      result[item] = photoNumbers[item] ?? "";

      return;
    }

    const value = normalizePhotoValue(photoNumbers[item]);

    result[item] = {
      distant: value.distant,
      close: value.close,
    };
  });

  return result;
}

/* =========================================================
 * ファイル名
 * ========================================================= */

function sanitizeFileName(value) {
  const text = String(value ?? "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim();

  return text || "写真番号";
}

/* =========================================================
 * Excel列幅
 * ========================================================= */

function createColumnWidths(rowData) {
  return Object.entries(rowData).map(([heading, value]) => {
    const headingLength = String(heading).length;

    const valueLength = String(value ?? "").length;

    return {
      wch: Math.min(Math.max(headingLength, valueLength, 10) + 2, 45),
    };
  });
}

/* =========================================================
 * PhotoNumberForm
 * ========================================================= */

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

  /*
   * 入力欄
   */
  const inputRefs = useRef({});

  /* =======================================================
   * 現在表示する項目
   * ======================================================= */

  const visiblePhotoItems = useMemo(
    () => createVisiblePhotoItems(photoItems, photoNumbers),
    [photoItems, photoNumbers],
  );

  /* =======================================================
   * 全入力欄の順番
   *
   * Enter移動用
   * ======================================================= */

  const allFocusOrder = useMemo(() => {
    const keys = [];

    photoItems.forEach((item) => {
      if (isJudgmentItem(item)) {
        keys.push(`${item}__judgment`);

        return;
      }

      keys.push(`${item}__distant`);

      keys.push(`${item}__close`);
    });

    return keys;
  }, [photoItems]);

  /* =======================================================
   * Firestore読込
   * ======================================================= */

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
         * 写真項目設定
         */
        const nextPhotoItems =
          await loadPhotoItemsFromFirestore(inspectionType);

        /*
         * 保存済み写真番号
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

        inputRefs.current = {};

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

  /* =======================================================
   * 遠景・近景変更
   * ======================================================= */

  const handlePhotoChange = (item, type, value) => {
    setPhotoNumbers((previous) => {
      const currentValue = normalizePhotoValue(previous[item]);

      return {
        ...previous,

        [item]: {
          ...currentValue,
          [type]: value,
        },
      };
    });

    setMessage("");
  };

  /* =======================================================
   * 判定項目
   * ======================================================= */

  const handleJudgmentChange = (item, value) => {
    setPhotoNumbers((previous) => ({
      ...previous,
      [item]: value,
    }));

    setMessage("");
  };

  /* =======================================================
   * Enterで次へ
   *
   * 遠景
   * ↓
   * 近景
   * ↓
   * 次項目の遠景
   * ======================================================= */

  const handleKeyDown = (event, currentKey) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    const currentIndex = allFocusOrder.indexOf(currentKey);

    if (currentIndex < 0) {
      return;
    }

    /*
     * 入力によって新しい行が
     * 表示される可能性があるため
     * React描画後に移動
     */
    window.setTimeout(() => {
      for (
        let index = currentIndex + 1;
        index < allFocusOrder.length;
        index += 1
      ) {
        const nextKey = allFocusOrder[index];

        const nextElement = inputRefs.current[nextKey];

        if (!nextElement) {
          continue;
        }

        nextElement.focus();

        if (typeof nextElement.select === "function") {
          nextElement.select();
        }

        break;
      }
    }, 50);
  };

  /* =======================================================
   * 保存データ
   * ======================================================= */

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

      inspectionTime: propertyData?.inspectionTime ?? "",

      inspectionType: propertyData?.inspectionType ?? "",

      address: propertyData?.address ?? "",

      photoItems,

      photoNumbers: photoNumbersForSave,

      updatedAt: serverTimestamp(),
    };
  };

  /* =======================================================
   * 保存
   * ======================================================= */

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

  /* =======================================================
   * Excelデータ
   *
   * 写真番号が入力されている項目だけ出力
   * ======================================================= */

  const createExcelRow = (targetPhotoNumbers) => {
    const rowData = {
      管理番号: propertyData?.managementNumber ?? "",

      検査日: propertyData?.inspectionDate ?? "",

      調査予定時間: propertyData?.inspectionTime ?? "",

      物件名: propertyData?.propertyName ?? "",

      検査種別: propertyData?.inspectionType ?? "",

      住所: propertyData?.address ?? "",
    };

    photoItems.forEach((item) => {
      const value = targetPhotoNumbers?.[item];

      /*
       * 〇・✖
       */
      if (isJudgmentItem(item)) {
        const judgment = typeof value === "string" ? value.trim() : "";

        if (!judgment) {
          return;
        }

        rowData[item] = judgment;

        return;
      }

      /*
       * 遠景・近景
       */
      const normalized = normalizePhotoValue(value);

      const distant = normalized.distant.trim();

      const close = normalized.close.trim();

      /*
       * 両方空欄なら
       * Excel対象外
       */
      if (!distant && !close) {
        return;
      }

      rowData[`${item}_遠景`] = distant;

      rowData[`${item}_近景`] = close;
    });

    return rowData;
  };

  /* =======================================================
   * Excelダウンロード
   * ======================================================= */

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
       * Firestore保存済みデータ取得
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
       * ワークシート
       */
      const worksheet = XLSX.utils.json_to_sheet([rowData]);

      /*
       * 列幅
       */
      worksheet["!cols"] = createColumnWidths(rowData);

      /*
       * 先頭行固定
       */
      worksheet["!freeze"] = {
        xSplit: 0,
        ySplit: 1,
      };

      /*
       * オートフィルター
       */
      if (worksheet["!ref"]) {
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
      }

      /*
       * Workbook
       */
      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(workbook, worksheet, "写真番号");

      const managementNumber = sanitizeFileName(propertyData?.managementNumber);

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

  /* =======================================================
   * 戻る
   * ======================================================= */

  const handleBack = () => {
    if (typeof onBack === "function") {
      onBack();
      return;
    }

    navigate("/");
  };

  /* =======================================================
   * 読込中
   * ======================================================= */

  if (isLoadingItems) {
    return (
      <section className="photo-form-area">
        <h2>写真番号入力</h2>

        <p>写真項目を読み込んでいます...</p>
      </section>
    );
  }

  /* =======================================================
   * 画面
   * ======================================================= */

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

      {visiblePhotoItems.length > 0 && (
        <table className="photo-number-table">
          <thead>
            <tr>
              <th>項目</th>
              <th>遠景</th>
              <th>近景</th>
            </tr>
          </thead>

          <tbody>
            {visiblePhotoItems.map((item, index) => {
              /*
               * ---------------------------------------
               * 〇・✖の判定項目
               * ---------------------------------------
               */
              if (isJudgmentItem(item)) {
                const inputKey = `${item}__judgment`;

                return (
                  <tr key={item}>
                    <td>{item}</td>

                    <td colSpan={2}>
                      <select
                        ref={(element) => {
                          inputRefs.current[inputKey] = element;
                        }}
                        autoFocus={index === 0}
                        value={photoNumbers[item] ?? ""}
                        onChange={(event) =>
                          handleJudgmentChange(item, event.target.value)
                        }
                        onKeyDown={(event) => handleKeyDown(event, inputKey)}
                      >
                        <option value="">－</option>

                        <option value="〇">〇</option>

                        <option value="✖">✖</option>
                      </select>
                    </td>
                  </tr>
                );
              }

              /*
               * ---------------------------------------
               * 写真番号
               * ---------------------------------------
               */

              const value = normalizePhotoValue(photoNumbers[item]);

              const distantKey = `${item}__distant`;

              const closeKey = `${item}__close`;

              return (
                <tr key={item}>
                  <td>{item}</td>

                  {/* 遠景 */}
                  <td>
                    <input
                      ref={(element) => {
                        inputRefs.current[distantKey] = element;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoFocus={index === 0}
                      value={value.distant}
                      onChange={(event) =>
                        handlePhotoChange(item, "distant", event.target.value)
                      }
                      onKeyDown={(event) => handleKeyDown(event, distantKey)}
                    />
                  </td>

                  {/* 近景 */}
                  <td>
                    <input
                      ref={(element) => {
                        inputRefs.current[closeKey] = element;
                      }}
                      type="text"
                      inputMode="numeric"
                      value={value.close}
                      onChange={(event) =>
                        handlePhotoChange(item, "close", event.target.value)
                      }
                      onKeyDown={(event) => handleKeyDown(event, closeKey)}
                    />
                  </td>
                </tr>
              );
            })}
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
