import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/*
 * ViteでPDF.jsのWorkerを読み込むための設定
 */
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * 空白や改行を整理する
 */
function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 年度表記を除去する
 *
 * 例：
 * 非準耐火張上2025 → 非準耐火張上
 * 配筋2025         → 配筋
 */
function removeYearSuffix(value) {
  return normalizeText(value)
    .replace(/[（(]?\s*20\d{2}\s*[）)]?$/u, "")
    .trim();
}

/**
 * PDF内の日付をYYYY-MM-DDへ変換する
 */
function convertDateToInputFormat(value) {
  const text = normalizeText(value);

  /*
   * 2026年7月22日
   */
  let match = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/u);

  if (match) {
    const [, year, month, day] = match;

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
      2,
      "0",
    )}`;
  }

  /*
   * 2026/7/22
   * 2026-7-22
   * 2026.7.22
   */
  match = text.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/);

  if (match) {
    const [, year, month, day] = match;

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
      2,
      "0",
    )}`;
  }

  return "";
}

/**
 * 管理番号かどうかを判定する
 */
function isManagementNumber(value) {
  const text = normalizeText(value).replace(/\s/g, "");

  /*
   * 例：
   * KFAKHXX28051LL443
   * LHA00000030850001
   */
  return /^[A-Z][A-Z0-9-]{10,}$/i.test(text);
}

/**
 * 文字列から管理番号を取り出す
 */
function extractManagementNumber(value) {
  const text = normalizeText(value);

  const matches = text.match(/\b[A-Z][A-Z0-9-]{10,}\b/gi);

  if (!matches || matches.length === 0) {
    return "";
  }

  return matches[0].replace(/\s/g, "").trim();
}

/**
 * 時刻だけの行かどうか
 */
function isTimeLine(value) {
  const text = normalizeText(value);

  return (
    /^\d{1,2}:\d{2}$/u.test(text) ||
    /^\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}$/u.test(text)
  );
}

/**
 * 日付だけの行かどうか
 */
function isDateLine(value) {
  return convertDateToInputFormat(value) !== "";
}

/**
 * 住所らしい文字列かどうか
 */
function looksLikeAddress(value) {
  const text = normalizeText(value);

  if (!text) {
    return false;
  }

  /*
   * 都道府県名がある場合
   */
  if (/(北海道|東京都|京都府|大阪府|.{2,3}県)/u.test(text)) {
    return true;
  }

  /*
   * 市・区・町・村などを含む場合
   */
  return /.+[市区町村郡].+/u.test(text);
}

/**
 * PDF.jsの文字情報を、画面上の行単位へまとめる
 */
function groupTextItemsIntoLines(items) {
  const lineMap = new Map();

  for (const item of items) {
    const text = normalizeText(item.str);

    if (!text) {
      continue;
    }

    /*
     * transform[5]はPDF上の縦位置
     * 小数の違いを吸収するため整数へ丸める
     */
    const y = Math.round(item.transform?.[5] ?? 0);

    if (!lineMap.has(y)) {
      lineMap.set(y, []);
    }

    lineMap.get(y).push({
      text,
      x: item.transform?.[4] ?? 0,
    });
  }

  /*
   * PDFは下から上へ座標が増えるため、
   * y座標を大きい順に並べる
   */
  return [...lineMap.entries()]
    .sort(([firstY], [secondY]) => secondY - firstY)
    .map(([, lineItems]) => {
      return lineItems
        .sort((first, second) => first.x - second.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    })
    .filter(Boolean);
}

/**
 * PDFから全ページの行を取得する
 */
async function extractPdfLines(file) {
  const arrayBuffer = await file.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({
    data: arrayBuffer,
  });

  const pdfDocument = await loadingTask.promise;

  const allLines = [];

  for (
    let pageNumber = 1;
    pageNumber <= pdfDocument.numPages;
    pageNumber += 1
  ) {
    const page = await pdfDocument.getPage(pageNumber);

    const textContent = await page.getTextContent();

    const pageLines = groupTextItemsIntoLines(textContent.items);

    allLines.push(...pageLines);
  }

  return allLines;
}

/**
 * Firestoreの検査種別一覧を整理する
 */
function createInspectionTypeCandidates(inspectionTypes) {
  const configuredTypes = Array.isArray(inspectionTypes)
    ? inspectionTypes.map((type) => removeYearSuffix(type)).filter(Boolean)
    : [];

  /*
   * PDFで出現する可能性がある検査種別
   * 長い名称を先に並べる
   */
  const fallbackTypes = [
    "非準耐火張上",
    "準耐火張上",
    "非準耐火",
    "準耐火",
    "AQ配筋",
    "基礎配筋",
    "配筋",
    "屋根防水",
    "外装下地",
    "防水",
    "木完",
    "木工事完了",
    "上棟",
    "張上",
  ];

  return [...new Set([...configuredTypes, ...fallbackTypes])]
    .filter(Boolean)
    .sort((first, second) => second.length - first.length);
}

/**
 * 物件行から、物件名・検査種別・監督者を分離する
 */
function splitPropertyLine(value, inspectionTypeCandidates) {
  let text = normalizeText(value);

  let supervisor = "";

  /*
   * 担当者名の候補を末尾から取り除く
   *
   * 現在のPDFでは「松本正」が末尾に入っているため、
   * まず明示的に判定する
   */
  const knownSupervisorMatch = text.match(/\s*(松本\s*正)\s*$/u);

  if (knownSupervisorMatch) {
    supervisor = knownSupervisorMatch[1].replace(/\s/g, "");

    text = text.slice(0, knownSupervisorMatch.index).trim();
  }

  let inspectionType = "";

  /*
   * Firestore設定または既知の検査種別から検索
   */
  for (const candidate of inspectionTypeCandidates) {
    const escapedCandidate = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    /*
     * 検査種別の後ろに2025などが付いても認識する
     */
    const pattern = new RegExp(
      `${escapedCandidate}\\s*(?:20\\d{2})?\\s*$`,
      "u",
    );

    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    inspectionType = candidate;

    text = text.slice(0, match.index).trim();

    break;
  }

  /*
   * 設定一覧で見つからない場合の追加判定
   */
  if (!inspectionType) {
    const fallbackMatch = text.match(
      /(非準耐火張上|準耐火張上|非準耐火|準耐火|AQ配筋|基礎配筋|配筋|屋根防水|外装下地|防水|木工事完了|木完|上棟|張上)\s*(?:20\d{2})?\s*$/u,
    );

    if (fallbackMatch) {
      inspectionType = removeYearSuffix(fallbackMatch[1]);

      text = text.slice(0, fallbackMatch.index).trim();
    }
  }

  return {
    propertyName: text,
    inspectionType,
    supervisor,
  };
}

/**
 * レコード内の行から住所候補を探す
 */
function findAddress(recordLines, propertyLine, managementNumber) {
  const normalizedPropertyLine = normalizeText(propertyLine);

  for (const line of recordLines) {
    const text = normalizeText(line);

    if (!text) {
      continue;
    }

    if (text === normalizedPropertyLine) {
      continue;
    }

    if (text.includes(managementNumber)) {
      continue;
    }

    if (isDateLine(text) || isTimeLine(text)) {
      continue;
    }

    /*
     * 担当者だけの行を除外
     */
    if (/^松本\s*正$/u.test(text)) {
      continue;
    }

    if (looksLikeAddress(text)) {
      return text;
    }
  }

  return "";
}

/**
 * 1件分の行を物件データへ変換する
 */
function parseRecord(
  recordLines,
  defaultInspectionDate,
  inspectionTypeCandidates,
) {
  if (!Array.isArray(recordLines)) {
    return null;
  }

  const normalizedLines = recordLines.map(normalizeText).filter(Boolean);

  if (normalizedLines.length === 0) {
    return null;
  }

  let managementNumber = "";
  let managementLineIndex = -1;

  for (let index = 0; index < normalizedLines.length; index += 1) {
    const extracted = extractManagementNumber(normalizedLines[index]);

    if (extracted && isManagementNumber(extracted)) {
      managementNumber = extracted;
      managementLineIndex = index;
      break;
    }
  }

  if (!managementNumber) {
    return null;
  }

  let inspectionDate = defaultInspectionDate;

  /*
   * レコード内に日付がある場合は優先する
   */
  for (const line of normalizedLines) {
    const date = convertDateToInputFormat(line);

    if (date) {
      inspectionDate = date;
      break;
    }
  }

  /*
   * 管理番号の後ろにある行から、
   * 物件名＋検査種別の行を探す
   */
  let propertyLine = "";

  for (
    let index = managementLineIndex + 1;
    index < normalizedLines.length;
    index += 1
  ) {
    const line = normalizedLines[index];

    if (!line) {
      continue;
    }

    if (isManagementNumber(line)) {
      break;
    }

    if (isDateLine(line) || isTimeLine(line)) {
      continue;
    }

    /*
     * 会社名や見出しだけの可能性が高い行を除外
     */
    if (/^(検査予定|検査日|管理番号|物件名|住所|担当者|監督者)$/u.test(line)) {
      continue;
    }

    const splitResult = splitPropertyLine(line, inspectionTypeCandidates);

    /*
     * 検査種別を含む行を最優先する
     */
    if (splitResult.inspectionType) {
      propertyLine = line;
      break;
    }

    /*
     * 検査種別が取れない場合でも、
     * 市区町村を含む長い行を候補にする
     */
    if (!propertyLine && line.length >= 5 && /[市区町村郡]/u.test(line)) {
      propertyLine = line;
    }
  }

  if (!propertyLine) {
    return null;
  }

  const splitResult = splitPropertyLine(propertyLine, inspectionTypeCandidates);

  let supervisor = splitResult.supervisor;

  /*
   * 物件行から監督者を取れなかった場合、
   * レコード全体から探す
   */
  if (!supervisor) {
    for (const line of normalizedLines) {
      const supervisorMatch = line.match(/松本\s*正/u);

      if (supervisorMatch) {
        supervisor = "松本正";
        break;
      }
    }
  }

  const address = findAddress(normalizedLines, propertyLine, managementNumber);

  return {
    managementNumber,
    inspectionDate,
    propertyName: splitResult.propertyName,
    inspectionType: splitResult.inspectionType,
    address,
    supervisor,
  };
}

/**
 * 管理番号の位置を基準に、PDF全体を物件ごとに分割する
 */
function splitLinesIntoRecords(lines) {
  const records = [];

  let currentRecord = [];
  let currentDate = "";

  for (const line of lines) {
    const text = normalizeText(line);

    if (!text) {
      continue;
    }

    const date = convertDateToInputFormat(text);

    if (date) {
      currentDate = date;
    }

    const managementNumber = extractManagementNumber(text);

    if (managementNumber && isManagementNumber(managementNumber)) {
      if (currentRecord.length > 0) {
        records.push(currentRecord);
      }

      currentRecord = [];

      /*
       * 直前に見つかった検査日をレコードへ入れる
       */
      if (currentDate) {
        currentRecord.push(currentDate);
      }

      currentRecord.push(text);
      continue;
    }

    if (currentRecord.length > 0) {
      currentRecord.push(text);
    }
  }

  if (currentRecord.length > 0) {
    records.push(currentRecord);
  }

  return records;
}

/**
 * PDFから物件情報を読み取る
 *
 * @param {File} file 選択されたPDFファイル
 * @param {string[]} inspectionTypes Firestoreから取得した検査種別
 * @returns {Promise<Array>}
 */
export async function parseInspectionPdf(file, inspectionTypes = []) {
  if (!(file instanceof File)) {
    throw new Error("PDFファイルが選択されていません。");
  }

  if (file.type && file.type !== "application/pdf") {
    throw new Error("PDFファイルを選択してください。");
  }

  const lines = await extractPdfLines(file);

  console.log("PDFから取得した行:", lines);

  if (lines.length === 0) {
    throw new Error("PDFから文字を読み取れませんでした。");
  }

  let defaultInspectionDate = "";

  for (const line of lines) {
    const date = convertDateToInputFormat(line);

    if (date) {
      defaultInspectionDate = date;
      break;
    }
  }

  const inspectionTypeCandidates =
    createInspectionTypeCandidates(inspectionTypes);

  const records = splitLinesIntoRecords(lines);

  console.log("管理番号ごとに分割したデータ:", records);

  const properties = records
    .map((recordLines) =>
      parseRecord(recordLines, defaultInspectionDate, inspectionTypeCandidates),
    )
    .filter(Boolean)
    .filter((property) => property.managementNumber && property.propertyName);

  console.log("PDF解析後の物件データ:", properties);

  return properties;
}
