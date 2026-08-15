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
 * 検査種別に対応する写真項目をFirestoreから取得
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
 * 判定項目
 *
 * これらの記号で始まる項目は
 * 遠景・近景ではなく
 * 〇・✖の選択欄にする
 * ========================================================= */

const JUDGMENT_MARKS = ["＊", "*", "※", "米", "〇", "○", "△", "×", "✖"];

function isJudgmentItem(item) {
  const firstCharacter = String(item ?? "")
    .trim()
    .charAt(0);

  return JUDGMENT_MARKS.includes(firstCharacter);
}

/* =========================================================
 * 連番の定義
 *
 * 基礎①～⑳
 * 外壁A～T
 * 柱a～t
 * ========================================================= */

const FOUNDATION_SUFFIXES = Array.from("①②③④⑤⑥⑦⑧⑨⑩" + "⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳");

const WALL_SUFFIXES = Array.from("ABCDEFGHIJKLMNOPQRST");

const COLUMN_SUFFIXES = Array.from("abcdefghijklmnopqrst");

/**
 * 項目がどのグループなのかを取得
 *
 * foundation = 基礎①～⑳
 * wall       = 外壁A～T
 * column     = 柱a～t
 */
function getSequenceGroup(item) {
  const text = String(item ?? "").trim();

  if (!text) {
    return null;
  }

  /*
   * 基礎①～⑳
   */
  if (text.startsWith("基礎")) {
    const suffix = text.slice("基礎".length);

    if (FOUNDATION_SUFFIXES.includes(suffix)) {
      return "foundation";
    }
  }

  /*
   * 外壁A～T
   */
  if (text.startsWith("外壁")) {
    const suffix = text.slice("外壁".length);

    if (WALL_SUFFIXES.includes(suffix)) {
      return "wall";
    }
  }

  /*
   * 柱a～t
   */
  if (text.startsWith("柱")) {
    const suffix = text.slice("柱".length);

    if (COLUMN_SUFFIXES.includes(suffix)) {
      return "column";
    }
  }

  /*
   * その他の通常項目
   */
  return null;
}

/* =========================================================
 * 遠景・近景データの整形
 *
 * 新形式
 *
 * {
 *   distant: "10",
 *   close: "11"
 * }
 *
 * 旧形式
 *
 * "10"
 *
 * の場合は遠景として引き継ぐ
 * ========================================================= */

function normalizePhotoValue(value) {
  /*
   * 新形式
   */
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      distant: String(value.distant ?? value.far ?? ""),

      close: String(value.close ?? value.near ?? ""),
    };
  }

  /*
   * 旧形式
   *
   * 旧写真番号は遠景に入れる
   */
  return {
    distant: String(value ?? ""),
    close: "",
  };
}

/* =========================================================
 * 初期写真番号データ作成
 * ========================================================= */

function createInitialPhotoNumbers(savedPhotoNumbers, photoItems) {
  const initialNumbers = {};

  photoItems.forEach((item) => {
    const savedValue = savedPhotoNumbers?.[item];

    /*
     * 判定項目
     */
    if (isJudgmentItem(item)) {
      initialNumbers[item] = typeof savedValue === "string" ? savedValue : "";

      return;
    }

    /*
     * 写真項目
     */
    initialNumbers[item] = normalizePhotoValue(savedValue);
  });

  return initialNumbers;
}

/* =========================================================
 * 入力されているか判定
 * ========================================================= */

function hasEnteredValue(item, photoNumbers) {
  const value = photoNumbers?.[item];

  /*
   * 判定項目
   */
  if (isJudgmentItem(item)) {
    return Boolean(String(value ?? "").trim());
  }

  /*
   * 写真項目
   */
  const normalized = normalizePhotoValue(value);

  return Boolean(normalized.distant.trim() || normalized.close.trim());
}

/* =========================================================
 * 表示する項目を作成
 *
 * 基礎・外壁・柱それぞれについて
 *
 * 初期表示 = 3件
 *
 * 入力後 =
 * 最後に入力されている項目
 * ＋
 * その2件先まで表示
 *
 * ========================================================= */

function createVisiblePhotoItems(photoItems, photoNumbers) {
  const groupItems = {
    foundation: [],
    wall: [],
    column: [],
  };

  /*
   * 基礎、外壁、柱を
   * それぞれ分ける
   */
  photoItems.forEach((item) => {
    const group = getSequenceGroup(item);

    if (group) {
      groupItems[group].push(item);
    }
  });

  /*
   * 各グループの
   * 表示対象を保存
   */
  const visibleSets = {
    foundation: new Set(),
    wall: new Set(),
    column: new Set(),
  };

  Object.entries(groupItems).forEach(([groupName, items]) => {
    if (items.length === 0) {
      return;
    }

    let lastEnteredIndex = -1;

    /*
     * 最後に入力されている
     * 項目の位置を探す
     */
    items.forEach((item, index) => {
      if (hasEnteredValue(item, photoNumbers)) {
        lastEnteredIndex = index;
      }
    });

    /*
     * 初期は3件
     *
     * 最後に入力された項目から
     * 2件先まで表示
     *
     * 例
     *
     * ①入力
     * → ①②③
     *
     * ②入力
     * → ①②③④
     *
     * ⑤入力
     * → ①～⑦
     */
    const visibleCount = Math.min(
      items.length,

      Math.max(2, lastEnteredIndex + 2),
    );

    visibleSets[groupName] = new Set(items.slice(0, visibleCount));
  });

  /*
   * 元々の写真項目の並び順を維持
   */
  return photoItems.filter((item) => {
    const group = getSequenceGroup(item);

    /*
     * 基礎・外壁・柱以外は
     * 常に表示
     */
    if (!group) {
      return true;
    }

    return visibleSets[group].has(item);
  });
}

/* =========================================================
 * Firestore保存用データ作成
 * ========================================================= */

function createPhotoNumbersForSave(photoNumbers, photoItems) {
  const result = {};

  photoItems.forEach((item) => {
    /*
     * 判定項目
     */
    if (isJudgmentItem(item)) {
      result[item] = photoNumbers[item] ?? "";

      return;
    }

    /*
     * 遠景・近景
     */
    const value = normalizePhotoValue(photoNumbers[item]);

    result[item] = {
      distant: value.distant,
      close: value.close,
    };
  });

  return result;
}

/* =========================================================
 * ファイル名整形
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
   * 入力欄のref
   *
   * 例
   *
   * 基礎①__distant
   * 基礎①__close
   * 外壁A__distant
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
   * 全項目のフォーカス順
   *
   * 非表示になっている項目も含む
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
         * 写真項目マスター取得
         */
        const nextPhotoItems =
          await loadPhotoItemsFromFirestore(inspectionType);

        /*
         * 保存済み写真番号取得
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

        /*
         * 初期データ作成
         */
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
   * 判定項目変更
   * ======================================================= */

  const handleJudgmentChange = (item, value) => {
    setPhotoNumbers((previous) => ({
      ...previous,

      [item]: value,
    }));

    setMessage("");
  };

  /* =======================================================
   * Enterで次の入力欄へ
   *
   * 遠景
   * ↓
   * 近景
   * ↓
   * 次項目の遠景
   *
   * 新しい項目が表示された場合も対応
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
     * React再描画後に
     * 次の表示済み入力欄を探す
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
    }, 30);
  };

  /* =======================================================
   * Firestore保存データ
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

      inspectionType: propertyData?.inspectionType ?? "",

      address: propertyData?.address ?? "",

      photoItems,

      photoNumbers: photoNumbersForSave,

      updatedAt: serverTimestamp(),
    };
  };

  /* =======================================================
   * Firestoreへ保存
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

      /*
       * 新規だけcreatedAt
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

  /* =======================================================
   * Excel用1行データ作成
   * ======================================================= */

  const createExcelRow = (targetPhotoNumbers) => {
    const rowData = {
      管理番号: propertyData?.managementNumber ?? "",

      検査日: propertyData?.inspectionDate ?? "",

      物件名: propertyData?.propertyName ?? "",

      検査種別: propertyData?.inspectionType ?? "",

      住所: propertyData?.address ?? "",
    };

    photoItems.forEach((item) => {
      const value = targetPhotoNumbers?.[item];

      /*
       * 〇・✖などの判定項目
       *
       * 選択されているものだけ
       * Excelへ出力
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
       * 遠景・近景ともに空欄なら
       * Excelには出さない
       */
      if (!distant && !close) {
        return;
      }

      /*
       * 入力されている項目だけ
       * Excelへ追加
       */
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
       * Firestoreの最新データ取得
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
       * Excel作成
       */
      const worksheet = XLSX.utils.json_to_sheet([rowData]);

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
               * -----------------------------------------
               * 〇・✖等の判定項目
               * -----------------------------------------
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
               * -----------------------------------------
               * 通常写真項目
               * -----------------------------------------
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
