import * as XLSX from "xlsx";

/**
 * Excelの有効欄を判定する
 */
function isEnabled(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .toLowerCase();

  const disabledValues = ["×", "x", "無効", "0", "false", "off"];

  return !disabledValues.includes(normalizedValue);
}

/**
 * Excelの行データを検査種別ごとの写真項目に変換する
 */
function convertRowsToPhotoItems(rows) {
  const validRows = rows
    .map((row, originalIndex) => ({
      inspectionType: String(row["検査種別"] ?? "").trim(),

      photoItem: String(row["写真項目"] ?? "").trim(),

      order: Number(row["表示順"] ?? 0),

      enabled: row["有効"],

      originalIndex,
    }))
    .filter((row) => {
      return row.inspectionType && row.photoItem && isEnabled(row.enabled);
    })
    .sort((rowA, rowB) => {
      /*
       * 検査種別が同じ場合は表示順で並べる
       */
      if (rowA.inspectionType === rowB.inspectionType) {
        if (rowA.order !== rowB.order) {
          return rowA.order - rowB.order;
        }

        /*
         * 表示順が同じ場合はExcel上の順番を維持する
         */
        return rowA.originalIndex - rowB.originalIndex;
      }

      /*
       * 異なる検査種別は日本語順で並べる
       */
      return rowA.inspectionType.localeCompare(rowB.inspectionType, "ja");
    });

  const result = {};

  validRows.forEach((row) => {
    if (!result[row.inspectionType]) {
      result[row.inspectionType] = [];
    }

    /*
     * 同じ検査種別内の重複項目は追加しない
     */
    if (!result[row.inspectionType].includes(row.photoItem)) {
      result[row.inspectionType].push(row.photoItem);
    }
  });

  return result;
}

/**
 * public/photo_items.xlsxを読み込む
 */
export async function loadPhotoItemsFromExcel() {
  /*
   * キャッシュ回避のため日時を付加
   */
  const excelUrl = `/photo_items.xlsx?t=${Date.now()}`;

  const response = await fetch(excelUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `photo_items.xlsxを取得できませんでした。HTTP ${response.status}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();

  const workbook = XLSX.read(arrayBuffer, {
    type: "array",
  });

  if (workbook.SheetNames.length === 0) {
    throw new Error("Excelにシートがありません。");
  }

  /*
   * 最初のシートを使用する
   */
  const firstSheetName = workbook.SheetNames[0];

  const worksheet = workbook.Sheets[firstSheetName];

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: "",
    raw: false,
  });

  const convertedData = convertRowsToPhotoItems(rows);

  if (Object.keys(convertedData).length === 0) {
    throw new Error(
      "有効な写真項目がありません。Excelの見出しと内容を確認してください。",
    );
  }

  return convertedData;
}
