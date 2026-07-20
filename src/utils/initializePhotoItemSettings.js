import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "../firebase";

/**
 * 検査種別を比較用の文字列へ変換する
 *
 * 例：
 * 「躯体検査」→「躯体」
 * 「 躯体 」→「躯体」
 */
function normalizeInspectionType(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s\u3000]/g, "")
    .trim()
    .toLowerCase()
    .replace(/検査$/g, "");
}

/**
 * Firestoreに登録する写真項目設定
 *
 * inspectionTypeは、物件登録画面で使用している
 * 検査種別と同じ名称にしてください。
 */
const photoItemSettings = [
  {
    inspectionType: "躯体検査",

    items: [
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
    ],
  },

  {
    inspectionType: "防水検査",

    items: [
      "建物全景",
      "外壁防水紙",
      "防水紙の重ね",
      "サッシ周囲",
      "配管貫通部",
      "バルコニー防水",
      "軒先",
      "ケラバ",
    ],
  },

  {
    inspectionType: "配筋検査",

    items: [
      "建物全景",
      "基礎全景",
      "底盤配筋",
      "立上り配筋",
      "人通口補強",
      "開口補強",
      "アンカーボルト",
      "かぶり厚さ",
    ],
  },

  {
    inspectionType: "完了検査",

    items: ["建物全景", "玄関", "外壁", "屋根", "バルコニー", "設備", "室内"],
  },
];

/**
 * 写真項目設定をFirestoreへ登録する
 */
export async function initializePhotoItemSettings() {
  for (const setting of photoItemSettings) {
    const normalizedInspectionType = normalizeInspectionType(
      setting.inspectionType,
    );

    const settingReference = doc(
      db,
      "photoItemSettings",
      normalizedInspectionType,
    );

    await setDoc(
      settingReference,
      {
        inspectionType: setting.inspectionType,

        normalizedInspectionType,

        items: setting.items,

        updatedAt: serverTimestamp(),
      },
      {
        merge: true,
      },
    );
  }

  console.log("写真項目設定をFirestoreへ登録しました。");
}
