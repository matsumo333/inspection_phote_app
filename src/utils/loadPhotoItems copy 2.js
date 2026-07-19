import { doc, getDoc } from "firebase/firestore";

import { db } from "../firebase";

export async function loadPhotoItems(inspectionType) {
  if (!inspectionType) {
    throw new Error("検査種別が指定されていません。");
  }

  const settingReference = doc(db, "photoItemSettings", inspectionType);

  const settingSnapshot = await getDoc(settingReference);

  if (!settingSnapshot.exists()) {
    throw new Error(`「${inspectionType}」の写真項目設定がありません。`);
  }

  const settingData = settingSnapshot.data();

  if (!Array.isArray(settingData.items) || settingData.items.length === 0) {
    throw new Error(`「${inspectionType}」に有効な写真項目がありません。`);
  }

  return settingData.items
    .filter(
      (item) =>
        item && typeof item.label === "string" && item.label.trim() !== "",
    )
    .map((item, index) => ({
      id: item.id || `photo-${index + 1}`,
      label: item.label.trim(),
      order: typeof item.order === "number" ? item.order : index + 1,
    }))
    .sort((firstItem, secondItem) => {
      return firstItem.order - secondItem.order;
    });
}
