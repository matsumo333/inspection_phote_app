import { doc, setDoc } from "firebase/firestore";

import { db } from "../firebase";

const photoItemSettings = {
  配筋検査: [
    "全景",
    "基礎全景",
    "配筋状況",
    "主筋",
    "補強筋",
    "かぶり厚さ",
    "アンカーボルト",
  ],

  上棟検査: [
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

  防水検査: [
    "建物全景",
    "屋根防水",
    "外壁防水",
    "防水シート",
    "防水テープ",
    "サッシまわり",
    "バルコニー防水",
    "配管貫通部",
  ],
};

export async function initializePhotoItemSettings() {
  const registrationPromises = Object.entries(photoItemSettings).map(
    ([inspectionType, labels]) => {
      const items = labels.map((label, index) => ({
        id: `item-${index + 1}`,
        label,
        order: index + 1,
      }));

      return setDoc(doc(db, "photoItemSettings", inspectionType), {
        inspectionType,
        items,
        updatedAt: new Date(),
      });
    },
  );

  await Promise.all(registrationPromises);
}
