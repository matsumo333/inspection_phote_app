/**
 * 検査種別を比較用の文字列へ変換する
 *
 * ・全角英数字を半角へ変換
 * ・空白を削除
 * ・小文字へ変換
 * ・末尾の「検査」を削除
 *
 * 例：
 * 「 AQ配筋検査 」→「aq配筋」
 */
export function normalizeInspectionType(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s\u3000]/g, "")
    .trim()
    .toLowerCase()
    .replace(/検査$/u, "");
}

/**
 * 検査種別の末尾に付いている年度を取り除く
 *
 * 例：
 * 非準耐火張上2025 → 非準耐火張上
 * 配筋（2025）     → 配筋
 */
export function removeInspectionYear(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s\u3000]/g, "")
    .replace(/[（(]?\s*20\d{2}\s*[）)]?$/u, "")
    .trim();
}

/**
 * PDFとFirestoreの検査種別を比較するためのキーを作る
 *
 * ・年度を無視
 * ・空白を無視
 * ・全角半角を無視
 * ・末尾の「検査」を無視
 */
export function createInspectionTypeKey(value) {
  return normalizeInspectionType(removeInspectionYear(value));
}
