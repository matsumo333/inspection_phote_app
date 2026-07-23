import { collection, getDocs } from "firebase/firestore";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { db } from "../firebase";
import { normalizeInspectionType } from "../utils/inspectionTypeUtils";

const PhotoItemSettingsContext = createContext(null);

export function PhotoItemSettingsProvider({ children }) {
  const [photoItemSettings, setPhotoItemSettings] = useState({});
  const [isLoadingPhotoItems, setIsLoadingPhotoItems] = useState(true);
  const [photoItemLoadError, setPhotoItemLoadError] = useState("");

  const loadPhotoItemSettings = async () => {
    try {
      setIsLoadingPhotoItems(true);
      setPhotoItemLoadError("");

      const snapshot = await getDocs(collection(db, "photoItemSettings"));

      const nextSettings = {};

      snapshot.docs.forEach((document) => {
        const data = document.data();

        const normalizedInspectionType =
          data.normalizedInspectionType ||
          normalizeInspectionType(data.inspectionType);

        if (!normalizedInspectionType) {
          return;
        }

        if (!Array.isArray(data.items)) {
          return;
        }

        const items = data.items
          .map((item) => String(item ?? "").trim())
          .filter((item) => item !== "");

        if (items.length === 0) {
          return;
        }

        nextSettings[normalizedInspectionType] = items;
      });

      setPhotoItemSettings(nextSettings);
    } catch (error) {
      console.error("写真項目設定の読み込みエラー:", error);

      const errorText = error instanceof Error ? error.message : String(error);

      setPhotoItemLoadError(`写真項目設定を読み込めませんでした：${errorText}`);
    } finally {
      setIsLoadingPhotoItems(false);
    }
  };

  useEffect(() => {
    loadPhotoItemSettings();
  }, []);

  const getPhotoItems = (inspectionType) => {
    const normalizedInspectionType = normalizeInspectionType(inspectionType);

    if (!normalizedInspectionType) {
      return [];
    }

    return photoItemSettings[normalizedInspectionType] ?? [];
  };

  const contextValue = useMemo(
    () => ({
      photoItemSettings,
      isLoadingPhotoItems,
      photoItemLoadError,
      getPhotoItems,
      reloadPhotoItemSettings: loadPhotoItemSettings,
    }),
    [photoItemSettings, isLoadingPhotoItems, photoItemLoadError],
  );

  return (
    <PhotoItemSettingsContext.Provider value={contextValue}>
      {children}
    </PhotoItemSettingsContext.Provider>
  );
}

export function usePhotoItemSettings() {
  const context = useContext(PhotoItemSettingsContext);

  if (!context) {
    throw new Error(
      "usePhotoItemSettingsはPhotoItemSettingsProvider内で使用してください。",
    );
  }

  return context;
}
