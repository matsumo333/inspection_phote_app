import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import {
  createInspectionTypeKey,
  removeInspectionYear,
} from "./inspectionTypeUtils";

/*
 * Vite用PDF.js Worker設定
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
 * PDF内の日付をYYYY-MM-DDへ変換
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
 * 管理番号か判定する
 */
function isManagementNumber(value) {
  const text = normalizeText(value).replace(/\s/g, "");

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
 * 時刻行か判定する
 */
function isTimeLine(value) {
  const text = normalizeText(value);

  return (
    /^\d{1,2}:\d{2}$/u.test(text) ||
    /^\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}$/u.test(text)
  );
}

/**
 * 日付行か判定する
 */
function isDateLine(value) {
  return convertDateToInputFormat(value) !== "";
}

/**
 * 住所らしいか判定する
 */
function looksLikeAddress(value) {
  const text = normalizeText(value);

  if (!text) {
    return false;
  }

  const prefecturePattern =
    /(北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)/u;

  if (prefecturePattern.test(text)) {
    return true;
  }

  return /.+[市区町村郡].+/u.test(text);
}
/**
 * PDFの文字を行単位へまとめる
 */
function groupTextItemsIntoLines(items) {
  const lineMap = new Map();

  for (const item of items) {
    const text = normalizeText(item.str);

    if (!text) {
      continue;
    }

    const y = Math.round(item.transform?.[5] ?? 0);

    if (!lineMap.has(y)) {
      lineMap.set(y, []);
    }

    lineMap.get(y).push({
      text,
      x: item.transform?.[4] ?? 0,
    });
  }

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
 * PDF全ページから行を取得
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
 * Firestoreの検査種別一覧を
 * PDF解析用候補へ変換する
 */
function createInspectionTypeCandidates(inspectionTypes) {
  const configuredTypes = Array.isArray(inspectionTypes)
    ? inspectionTypes
        .map((type) => {
          const displayName = removeInspectionYear(type);

          return {
            displayName,
            key: createInspectionTypeKey(displayName),
          };
        })
        .filter((item) => item.displayName && item.key)
    : [];

  /*
   * Firestoreに設定がない場合の予備候補
   */
  const fallbackNames = [
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
    "木工事完了",
    "木完",
    "上棟",
    "張上",
  ];

  const fallbackTypes = fallbackNames.map((displayName) => ({
    displayName,
    key: createInspectionTypeKey(displayName),
  }));

  return [...configuredTypes, ...fallbackTypes]
    .filter(
      (item, index, array) =>
        array.findIndex((target) => target.key === item.key) === index,
    )
    .sort(
      (first, second) => second.displayName.length - first.displayName.length,
    );
}

/**
 * 正規表現用文字をエスケープする
 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 物件行から
 * ・物件名
 * ・検査種別
 * ・監督者
 * を分離する
 */
function splitPropertyLine(value, inspectionTypeCandidates) {
  let text = normalizeText(value);

  let supervisor = "";

  /*
   * 現在のPDFの監督者名
   */
  const supervisorMatch = text.match(/\s*(松本\s*正)\s*$/u);

  if (supervisorMatch) {
    supervisor = supervisorMatch[1].replace(/\s/g, "");

    text = text.slice(0, supervisorMatch.index).trim();
  }

  let inspectionType = "";

  /*
   * Firestoreの検査種別候補と照合
   */
  for (const candidate of inspectionTypeCandidates) {
    const escapedCandidate = escapeRegExp(candidate.displayName);

    /*
     * 検査種別の後ろに
     * 2025などが付いていても認識
     */
    const pattern = new RegExp(
      `${escapedCandidate}\\s*(?:20\\d{2})?\\s*$`,
      "iu",
    );

    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    inspectionType = candidate.displayName;

    text = text.slice(0, match.index).trim();

    break;
  }

  /*
   * 上記で取れない場合、
   * 行末を正規化して比較する
   */
  if (!inspectionType) {
    const textWithoutYear = removeInspectionYear(text);

    for (const candidate of inspectionTypeCandidates) {
      const candidateKey = candidate.key;

      const normalizedText = createInspectionTypeKey(textWithoutYear);

      if (!normalizedText.endsWith(candidateKey)) {
        continue;
      }

      inspectionType = candidate.displayName;

      const candidateLength = candidate.displayName.length;

      text = textWithoutYear.slice(0, -candidateLength).trim();

      break;
    }
  }

  return {
    propertyName: text,
    inspectionType,
    supervisor,
  };
}

/**
 * レコード内から住所候補を探す
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
 * 1件分の行を物件データへ変換
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

  for (const line of normalizedLines) {
    const date = convertDateToInputFormat(line);

    if (date) {
      inspectionDate = date;
      break;
    }
  }

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

    if (/^(検査予定|検査日|管理番号|物件名|住所|担当者|監督者)$/u.test(line)) {
      continue;
    }

    const splitResult = splitPropertyLine(line, inspectionTypeCandidates);

    /*
     * 検査種別を含む行を優先
     */
    if (splitResult.inspectionType) {
      propertyLine = line;
      break;
    }

    /*
     * 検査種別がなくても
     * 物件名らしい行を候補にする
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

  if (!supervisor) {
    for (const line of normalizedLines) {
      if (/松本\s*正/u.test(line)) {
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
 * 管理番号を基準に
 * PDF全体を物件ごとに分割
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
 * @param {File} file PDFファイル
 * @param {string[]} inspectionTypes
 * Firestoreから取得した検査種別
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

  console.log("検査種別候補:", inspectionTypeCandidates);

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
