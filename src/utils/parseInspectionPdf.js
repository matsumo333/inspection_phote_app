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
 * 空白・全角空白・改行を整理する
 */
function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 日付をYYYY-MM-DD形式へ変換する
 */
function convertDateToInputFormat(value) {
  const text = normalizeText(value);

  /*
   * 2026年7月23日
   */
  let match = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/u);

  if (match) {
    const [, year, month, day] = match;

    return [
      year,
      String(month).padStart(2, "0"),
      String(day).padStart(2, "0"),
    ].join("-");
  }

  /*
   * 2026/7/23
   * 2026-7-23
   * 2026.7.23
   * 曜日付きにも対応
   */
  match = text.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/u);

  if (match) {
    const [, year, month, day] = match;

    return [
      year,
      String(month).padStart(2, "0"),
      String(day).padStart(2, "0"),
    ].join("-");
  }

  return "";
}

/**
 * 列上部の単独の日付見出しか判定する
 *
 * 対象:
 * 2026/07/23(木)
 *
 * 対象外:
 * 検査予定表：2026/07/23～2026/07/28
 */
function isStandaloneDateHeading(value) {
  const text = normalizeText(value);

  return (
    /^20\d{2}[./-]\d{1,2}[./-]\d{1,2}(?:\s*[（(][^)）]*[)）])?$/u.test(text) ||
    /^20\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日(?:\s*[（(][^)）]*[)）])?$/u.test(
      text,
    )
  );
}

/**
 * 時刻だけの行か判定する
 */
function isTimeLine(value) {
  const text = normalizeText(value);

  return (
    /^\d{1,2}:\d{2}$/u.test(text) ||
    /^\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}$/u.test(text)
  );
}

/**
 * 管理番号として使用できる候補か判定する
 *
 * 例:
 * KFAKHXX28051LL443
 * LHA00000030850001
 * KFA408810001
 */
function isManagementNumber(value) {
  const text = normalizeText(value).replace(/\s/g, "");

  return /^[A-Z][A-Z0-9-]{8,}$/iu.test(text) && /\d/u.test(text);
}

/**
 * 文字列から管理番号を取得する
 */
function extractManagementNumber(value) {
  const text = normalizeText(value);

  /*
   * 英字から始まり、英数字またはハイフンが続く文字列
   */
  const matches = text.match(/[A-Z][A-Z0-9-]{8,}/giu);

  if (!matches || matches.length === 0) {
    return "";
  }

  /*
   * 数字を含み、管理番号として有効な最初の候補を返す
   */
  const candidate = matches.find((item) => isManagementNumber(item));

  return candidate ? candidate.replace(/\s/g, "") : "";
}

/**
 * 住所らしい文字列か判定する
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
 * 都道府県から始まる明確な住所か判定する
 */
function isDefiniteAddressLine(value) {
  const text = normalizeText(value);

  return /^(北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)/u.test(
    text,
  );
}

/**
 * 住所末尾の時刻を削除する
 *
 * 例:
 * 京都府宇治市伊勢田町浮面14-12 2F 13:00
 *
 * 結果:
 * 京都府宇治市伊勢田町浮面14-12 2F
 */
function removeTimeFromAddress(value) {
  return normalizeText(value)
    .replace(/\s+\d{1,2}:\d{2}(?:\s*[～〜~-]\s*\d{1,2}:\d{2})?\s*$/u, "")
    .trim();
}

/**
 * PDF.jsの文字データを座標付きデータに変換する
 */
function createPositionedItems(items) {
  return items
    .map((item) => {
      const text = normalizeText(item.str);

      if (!text) {
        return null;
      }

      return {
        text,
        x: Number(item.transform?.[4] ?? 0),
        y: Number(item.transform?.[5] ?? 0),
        width: Number(item.width ?? 0),
        height: Number(item.height ?? 0),
      };
    })
    .filter(Boolean);
}

/**
 * 近いX座標の日付見出しを重複除外する
 */
function createUniqueDateHeadings(dateItems, pageWidth) {
  const sortedItems = [...dateItems].sort(
    (first, second) => first.x - second.x,
  );

  const result = [];

  /*
   * PDFによって同じ日付が複数文字項目に分かれる場合への対策
   */
  const tolerance = Math.max(pageWidth * 0.015, 8);

  for (const item of sortedItems) {
    const duplicate = result.some(
      (target) =>
        Math.abs(target.x - item.x) <= tolerance &&
        convertDateToInputFormat(target.text) ===
          convertDateToInputFormat(item.text),
    );

    if (!duplicate) {
      result.push(item);
    }
  }

  return result;
}

/**
 * 日付見出しの位置から各列の範囲を作成する
 *
 * 日付見出しのX座標を、その列の左端として扱う。
 */
function createColumnRanges(dateHeadings, pageWidth) {
  const sortedHeadings = [...dateHeadings].sort(
    (first, second) => first.x - second.x,
  );

  /*
   * PDF内部座標のわずかなずれを吸収する
   */
  const leftTolerance = 6;

  return sortedHeadings.map((heading, index) => {
    let left;
    let right;

    if (index === 0) {
      left = 0;
    } else {
      left = Math.max(0, heading.x - leftTolerance);
    }

    if (index < sortedHeadings.length - 1) {
      const nextHeading = sortedHeadings[index + 1];

      right = Math.max(left, nextHeading.x - leftTolerance);
    } else {
      right = pageWidth;
    }

    return {
      dateText: heading.text,
      date: convertDateToInputFormat(heading.text),
      headingX: heading.x,
      headingY: heading.y,
      left,
      right,
    };
  });
}
/**
 * 文字の開始X座標から所属列を取得する
 *
 * 長い文字列でも、中央座標ではなく
 * 開始座標を使うことで隣の列への誤振り分けを防ぐ。
 */
function getColumnIndexByStartX(item, columnRanges) {
  const index = columnRanges.findIndex((range, rangeIndex) => {
    const isLast = rangeIndex === columnRanges.length - 1;

    if (isLast) {
      return item.x >= range.left && item.x <= range.right;
    }

    return item.x >= range.left && item.x < range.right;
  });

  if (index >= 0) {
    return index;
  }

  /*
   * 誤差で範囲外になった場合は、
   * 日付見出しに最も近い列へ入れる
   */
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  columnRanges.forEach((range, rangeIndex) => {
    const distance = Math.abs(item.x - range.headingX);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = rangeIndex;
    }
  });

  return nearestIndex;
}

/**
 * 近いY座標の文字を同じ行にまとめる
 */
function groupItemsIntoLines(items, yTolerance = 2.5) {
  const sortedItems = [...items].sort((first, second) => {
    const yDifference = second.y - first.y;

    if (Math.abs(yDifference) > yTolerance) {
      return yDifference;
    }

    return first.x - second.x;
  });

  const groups = [];

  for (const item of sortedItems) {
    let targetGroup = null;

    for (const group of groups) {
      if (Math.abs(group.averageY - item.y) <= yTolerance) {
        targetGroup = group;
        break;
      }
    }

    if (targetGroup) {
      targetGroup.items.push(item);

      targetGroup.averageY =
        targetGroup.items.reduce((sum, target) => sum + target.y, 0) /
        targetGroup.items.length;
    } else {
      groups.push({
        averageY: item.y,
        items: [item],
      });
    }
  }

  return groups
    .sort((first, second) => second.averageY - first.averageY)
    .map((group) => {
      const lineItems = [...group.items].sort(
        (first, second) => first.x - second.x,
      );

      return lineItems
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    })
    .filter(Boolean);
}

/**
 * ページ全体を1列形式として解析する
 */
function groupSingleColumnPage(positionedItems) {
  return groupItemsIntoLines(positionedItems);
}

/**
 * 複数列のページを
 * 左列から右列へ順番に解析する
 */
function groupMultiColumnPage(positionedItems, dateHeadings, pageWidth) {
  const columnRanges = createColumnRanges(dateHeadings, pageWidth);

  const columns = columnRanges.map((range) => ({
    ...range,
    items: [],
  }));

  const highestHeadingY = Math.max(
    ...columnRanges.map((range) => range.headingY),
  );

  for (const item of positionedItems) {
    /*
     * ページタイトルなど、
     * 日付見出しより上にある文字は
     * 物件解析には使用しない。
     */
    if (item.y > highestHeadingY + 5) {
      continue;
    }

    /*
     * 日付見出し自体は後で列の先頭に追加するため除外
     */
    if (isStandaloneDateHeading(item.text)) {
      continue;
    }

    const columnIndex = getColumnIndexByStartX(item, columnRanges);

    columns[columnIndex].items.push(item);
  }

  const allLines = [];

  for (const column of columns) {
    /*
     * 各列の先頭に、その列の日付を必ず入れる
     */
    if (column.dateText) {
      allLines.push(column.dateText);
    }

    const columnLines = groupItemsIntoLines(column.items);

    allLines.push(...columnLines);
  }

  return allLines;
}

/**
 * PDFページを行配列に変換する
 */
function groupPageTextItemsIntoLines(items, pageWidth) {
  const positionedItems = createPositionedItems(items);

  if (positionedItems.length === 0) {
    return [];
  }

  const dateItems = positionedItems.filter((item) =>
    isStandaloneDateHeading(item.text),
  );

  const uniqueDateHeadings = createUniqueDateHeadings(dateItems, pageWidth);

  if (import.meta.env.DEV) {
    console.log(
      "検出した日付見出し:",
      uniqueDateHeadings.map((item) => ({
        text: item.text,
        x: item.x,
        y: item.y,
      })),
    );
  }

  /*
   * 日付見出しが2つ以上なら複数列
   */
  if (uniqueDateHeadings.length >= 2) {
    return groupMultiColumnPage(positionedItems, uniqueDateHeadings, pageWidth);
  }

  /*
   * 日付見出しが1つ以下なら通常の1列形式
   */
  return groupSingleColumnPage(positionedItems);
}

/**
 * PDF全ページから行を取得する
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

    const viewport = page.getViewport({
      scale: 1,
    });

    const textContent = await page.getTextContent();

    const pageLines = groupPageTextItemsIntoLines(
      textContent.items,
      viewport.width,
    );

    allLines.push(...pageLines);
  }

  return allLines;
}

/**
 * Firestoreの検査種別と予備候補を
 * PDF解析用候補へ変換する
 */
function createInspectionTypeCandidates(inspectionTypes) {
  /*
   * PDFで使用される標準的な表記を先にする。
   * 同じキーがある場合、こちらの表記を優先する。
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

  const fallbackTypes = fallbackNames
    .map((displayName) => ({
      displayName,
      key: createInspectionTypeKey(displayName),
    }))
    .filter((item) => item.displayName && item.key);

  const configuredTypes = Array.isArray(inspectionTypes)
    ? inspectionTypes
        .map((type) => {
          /*
           * Firestoreの値が文字列でも
           * オブジェクトでも対応する
           */
          const sourceName =
            typeof type === "string"
              ? type
              : (type?.name ??
                type?.inspectionType ??
                type?.displayName ??
                type?.label ??
                type?.value ??
                "");

          const displayName = removeInspectionYear(sourceName);

          return {
            displayName,
            key: createInspectionTypeKey(displayName),
          };
        })
        .filter((item) => item.displayName && item.key)
    : [];

  /*
   * 予備候補を先に置き、
   * 同一キーの場合は予備候補の標準表記を残す
   */
  return [...fallbackTypes, ...configuredTypes]
    .filter(
      (item, index, array) =>
        array.findIndex((target) => target.key === item.key) === index,
    )
    .sort(
      (first, second) => second.displayName.length - first.displayName.length,
    );
}

/**
 * 正規表現用の特殊文字をエスケープする
 */
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 検査種別の文字間に空白が入っても
 * 認識できる正規表現を作る
 *
 * 例:
 * 非準耐火張上
 * 非 準耐火 張上
 */
function createFlexibleTextPattern(value) {
  return [...String(value)]
    .map((character) => escapeRegExp(character))
    .join("\\s*");
}

/**
 * 検査種別の比較用文字列を作る
 *
 * ・全角英数字を半角へ変換
 * ・空白を削除
 * ・検査年度を削除
 * ・記号の違いを吸収
 */
function normalizeInspectionText(value) {
  const normalized = normalizeText(value)
    .normalize("NFKC")
    .replace(/\s+/gu, "");

  return createInspectionTypeKey(removeInspectionYear(normalized));
}

/**
 * 文字列内から検査種別を取得する
 */
function findInspectionTypeInText(value, inspectionTypeCandidates) {
  const normalizedText = normalizeInspectionText(value);

  if (!normalizedText) {
    return "";
  }

  for (const candidate of inspectionTypeCandidates) {
    if (candidate.key && normalizedText.includes(candidate.key)) {
      return candidate.displayName;
    }
  }

  return "";
}

/**
 * 物件行または検査種別行を解析する
 */
function splitPropertyLine(value, inspectionTypeCandidates) {
  const text = normalizeText(value);

  if (!text) {
    return {
      propertyName: "",
      inspectionType: "",
      supervisor: "",
    };
  }

  const inspectionType = findInspectionTypeInText(
    text,
    inspectionTypeCandidates,
  );

  if (!inspectionType) {
    return {
      propertyName: text,
      inspectionType: "",
      supervisor: "",
    };
  }

  /*
   * 検査種別の文字間に空白が入っていても
   * 物件名と検査種別を分離する
   */
  const flexibleCandidate = createFlexibleTextPattern(inspectionType);

  const pattern = new RegExp(flexibleCandidate, "iu");

  const match = text.match(pattern);

  /*
   * 通常の正規表現で位置を取得できた場合
   */
  if (match && match.index !== undefined) {
    return {
      propertyName: text.slice(0, match.index).trim(),
      inspectionType,
      supervisor: "",
    };
  }

  /*
   * 見えない文字などの影響で位置を特定できなくても、
   * 検査種別自体は取得する
   */
  return {
    propertyName: "",
    inspectionType,
    supervisor: "",
  };
}

/**
 * レコード全体から検査種別を探す
 */
function findInspectionTypeInRecord(recordLines, inspectionTypeCandidates) {
  const normalizedLines = recordLines.map(normalizeText).filter(Boolean);

  // 1行ずつ検索
  for (const line of normalizedLines) {
    const inspectionType = findInspectionTypeInText(
      line,
      inspectionTypeCandidates,
    );

    if (inspectionType) {
      return inspectionType;
    }
  }

  // 2行結合
  for (let index = 0; index < normalizedLines.length - 1; index++) {
    const combined = normalizedLines[index] + normalizedLines[index + 1];

    const inspectionType = findInspectionTypeInText(
      combined,
      inspectionTypeCandidates,
    );

    if (inspectionType) {
      return inspectionType;
    }
  }

  // 3行結合
  for (let index = 0; index < normalizedLines.length - 2; index++) {
    const combined =
      normalizedLines[index] +
      normalizedLines[index + 1] +
      normalizedLines[index + 2];

    const inspectionType = findInspectionTypeInText(
      combined,
      inspectionTypeCandidates,
    );

    if (inspectionType) {
      return inspectionType;
    }
  }

  return "";
}
/**
 * 住所候補から除外する行か判定する
 */
function isExcludedAddressLine(text, propertyLine, managementNumber) {
  if (!text) {
    return true;
  }

  if (text === normalizeText(propertyLine)) {
    return true;
  }

  if (managementNumber && text.includes(managementNumber)) {
    return true;
  }

  if (isStandaloneDateHeading(text) || isTimeLine(text)) {
    return true;
  }

  if (/^(今のところ)?検査なし$/u.test(text)) {
    return true;
  }

  if (/^(株式会社|有限会社|合同会社)/u.test(text)) {
    return true;
  }

  if (/システム検査結果登録/u.test(text)) {
    return true;
  }

  if (/^(構造|木工事業者|業者名|PJコード|地盤改良|事業者)[：:]/u.test(text)) {
    return true;
  }

  if (/^(検査予定|検査日|管理番号|物件名|住所|担当者|監督者)$/u.test(text)) {
    return true;
  }

  return false;
}

/**
 * レコード内から住所を取得する
 */
function findAddress(recordLines, propertyLine, managementNumber) {
  /*
   * 都道府県から始まる明確な住所を優先
   */
  for (const line of recordLines) {
    const text = normalizeText(line);

    if (isExcludedAddressLine(text, propertyLine, managementNumber)) {
      continue;
    }

    if (isDefiniteAddressLine(text)) {
      return removeTimeFromAddress(text);
    }
  }

  /*
   * 明確な住所がない場合の予備判定
   */
  for (const line of recordLines) {
    const text = normalizeText(line);

    if (isExcludedAddressLine(text, propertyLine, managementNumber)) {
      continue;
    }

    if (looksLikeAddress(text)) {
      return removeTimeFromAddress(text);
    }
  }

  return "";
}

/**
 * 物件名候補として除外する行か判定する
 */
function isExcludedPropertyLine(value) {
  const text = normalizeText(value);

  if (!text) {
    return true;
  }

  if (isStandaloneDateHeading(text) || isTimeLine(text)) {
    return true;
  }

  if (isDefiniteAddressLine(text)) {
    return true;
  }

  if (/^(今のところ)?検査なし$/u.test(text)) {
    return true;
  }

  if (/^(株式会社|有限会社|合同会社)/u.test(text)) {
    return true;
  }

  if (/システム検査結果登録/u.test(text)) {
    return true;
  }

  if (/^(構造|木工事業者|業者名|PJコード|地盤改良|事業者)[：:]/u.test(text)) {
    return true;
  }

  return false;
}

/**
 * 1件分の行を物件データに変換する
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
    if (!isStandaloneDateHeading(line)) {
      continue;
    }

    const date = convertDateToInputFormat(line);

    if (date) {
      inspectionDate = date;
      break;
    }
  }

  /*
   * レコード全体から検査種別を探す。
   *
   * 物件名と検査種別が別々の行でも取得できる。
   */
  const inspectionType = findInspectionTypeInRecord(
    normalizedLines,
    inspectionTypeCandidates,
  );

  let propertyName = "";
  let fallbackPropertyName = "";

  for (
    let index = managementLineIndex + 1;
    index < normalizedLines.length;
    index += 1
  ) {
    const line = normalizedLines[index];

    const nextManagementNumber = extractManagementNumber(line);

    if (nextManagementNumber && isManagementNumber(nextManagementNumber)) {
      break;
    }

    if (isExcludedPropertyLine(line)) {
      continue;
    }

    const splitResult = splitPropertyLine(line, inspectionTypeCandidates);

    /*
     * 物件名と検査種別が同じ行の場合
     */
    if (splitResult.inspectionType && splitResult.propertyName) {
      propertyName = splitResult.propertyName;
      break;
    }

    /*
     * 検査種別だけの行は物件名にしない
     */
    if (splitResult.inspectionType && !splitResult.propertyName) {
      continue;
    }

    /*
     * 市区町村郡を含む行を物件名候補にする
     */
    if (
      !fallbackPropertyName &&
      line.length >= 5 &&
      /[市区町村郡]/u.test(line)
    ) {
      fallbackPropertyName = line;
    }
  }

  if (!propertyName) {
    propertyName = fallbackPropertyName;
  }

  if (!propertyName) {
    return null;
  }

  const address = findAddress(normalizedLines, propertyName, managementNumber);

  return {
    managementNumber,
    inspectionDate,
    propertyName,
    inspectionType,
    address,
    supervisor: "",
  };
}

/**
 * 管理番号ごとに行を分割する
 */
function splitLinesIntoRecords(lines) {
  const records = [];

  let currentDate = "";
  let currentRecord = [];

  const saveCurrentRecord = () => {
    if (currentRecord.length > 0) {
      records.push(currentRecord);

      currentRecord = [];
    }
  };

  for (const line of lines) {
    const text = normalizeText(line);

    if (!text) {
      continue;
    }

    /*
     * 各列先頭の日付を更新
     */
    if (isStandaloneDateHeading(text)) {
      saveCurrentRecord();

      currentDate = convertDateToInputFormat(text);

      continue;
    }

    /*
     * 検査なしの列は登録しない
     */
    if (/^(今のところ)?検査なし$/u.test(text)) {
      saveCurrentRecord();
      continue;
    }

    const managementNumber = extractManagementNumber(text);

    if (managementNumber && isManagementNumber(managementNumber)) {
      saveCurrentRecord();

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

  saveCurrentRecord();

  return records;
}

/**
 * 同じ日付・同じ管理番号の重複を除外する
 */
function removeDuplicateProperties(properties) {
  const propertyMap = new Map();

  for (const property of properties) {
    const key = [property.inspectionDate, property.managementNumber].join("__");

    if (!propertyMap.has(key)) {
      propertyMap.set(key, property);
    }
  }

  return [...propertyMap.values()];
}

/**
 * PDFから物件情報を取得する
 *
 * @param {File} file PDFファイル
 * @param {string[]} inspectionTypes
 * Firestoreから取得した検査種別
 */
export async function parseInspectionPdf(file, inspectionTypes = []) {
  if (typeof File !== "undefined" && !(file instanceof File)) {
    throw new Error("PDFファイルが選択されていません。");
  }

  if (!file) {
    throw new Error("PDFファイルが選択されていません。");
  }

  if (file.type && file.type !== "application/pdf") {
    throw new Error("PDFファイルを選択してください。");
  }

  const lines = await extractPdfLines(file);

  if (import.meta.env.DEV) {
    console.log("PDFから取得した列別の行:", lines);
  }

  if (lines.length === 0) {
    throw new Error("PDFから文字を読み取れませんでした。");
  }

  let defaultInspectionDate = "";

  for (const line of lines) {
    if (!isStandaloneDateHeading(line)) {
      continue;
    }

    const date = convertDateToInputFormat(line);

    if (date) {
      defaultInspectionDate = date;
      break;
    }
  }

  const inspectionTypeCandidates =
    createInspectionTypeCandidates(inspectionTypes);

  if (import.meta.env.DEV) {
    console.log("元のinspectionTypes:", inspectionTypes);

    console.table(
      inspectionTypeCandidates.map((item) => ({
        表示名: item.displayName,
        キー: item.key,
      })),
    );
  }

  const records = splitLinesIntoRecords(lines);

  if (import.meta.env.DEV) {
    console.log("管理番号ごとのデータ:", records);
  }

  const parsedProperties = records
    .map((recordLines) =>
      parseRecord(recordLines, defaultInspectionDate, inspectionTypeCandidates),
    )
    .filter(Boolean)
    .filter((property) => property.managementNumber && property.propertyName);

  if (import.meta.env.DEV) {
    console.table(
      parsedProperties.map((property) => ({
        管理番号: property.managementNumber,
        検査日: property.inspectionDate,
        物件名: property.propertyName,
        検査種別: property.inspectionType,
        住所: property.address,
      })),
    );
  }

  const properties = removeDuplicateProperties(parsedProperties);

  if (import.meta.env.DEV) {
    console.table(properties);

    console.log("PDF解析後の物件データ:", properties);
  }

  if (properties.length === 0) {
    throw new Error(
      "PDFから物件情報を取得できませんでした。ブラウザのConsoleに表示された「検出した日付見出し」と「PDFから取得した列別の行」を確認してください。",
    );
  }

  return properties;
}
