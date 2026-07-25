import { collection, getDocs } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { db } from "../firebase";
import { normalizeInspectionType } from "../utils/inspectionTypeUtils";

const PhotoItemSettingsContext = createContext(null);

/**
 * Firestoreのデータから写真項目設定を作成する
 *
 * 戻り値の例
 * {
 *   "防水": ["全景", "外壁", "サッシ"],
 *   "上棟": ["柱脚金物", "柱頭金物"]
 * }
 */
function createPhotoItemSettings(snapshot) {
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

  return nextSettings;
}

export function PhotoItemSettingsProvider({ children }) {
  const [photoItemSettings, setPhotoItemSettings] = useState({});

  const [isLoadingPhotoItemSettings, setIsLoadingPhotoItemSettings] =
    useState(true);

  const [photoItemSettingsError, setPhotoItemSettingsError] = useState("");

  /**
   * Firestoreから写真項目設定を全件取得する
   */
  const loadPhotoItemSettings = useCallback(async () => {
    try {
      setIsLoadingPhotoItemSettings(true);
      setPhotoItemSettingsError("");

      const snapshot = await getDocs(collection(db, "photoItemSettings"));

      const nextSettings = createPhotoItemSettings(snapshot);

      setPhotoItemSettings(nextSettings);
    } catch (error) {
      console.error("写真項目設定の読み込みエラー:", error);

      const errorText = error instanceof Error ? error.message : String(error);

      setPhotoItemSettings({});

      setPhotoItemSettingsError(
        `写真項目設定を読み込めませんでした：${errorText}`,
      );
    } finally {
      setIsLoadingPhotoItemSettings(false);
    }
  }, []);

  /**
   * アプリ起動時に1回だけ読み込む
   */
  useEffect(() => {
    loadPhotoItemSettings();
  }, [loadPhotoItemSettings]);

  /**
   * 検査種別に対応する写真項目を返す
   */
  const getPhotoItems = useCallback(
    (inspectionType) => {
      const normalizedInspectionType = normalizeInspectionType(inspectionType);

      if (!normalizedInspectionType) {
        return [];
      }

      return photoItemSettings[normalizedInspectionType] ?? [];
    },
    [photoItemSettings],
  );

  /**
   * 設定画面で保存した直後などに、
   * Contextの内容を直接更新するための関数
   */
  const updatePhotoItems = useCallback((inspectionType, items) => {
    const normalizedInspectionType = normalizeInspectionType(inspectionType);

    if (!normalizedInspectionType) {
      return;
    }

    const normalizedItems = Array.isArray(items)
      ? items
          .map((item) => String(item ?? "").trim())
          .filter((item) => item !== "")
      : [];

    setPhotoItemSettings((previous) => ({
      ...previous,
      [normalizedInspectionType]: normalizedItems,
    }));
  }, []);

  const contextValue = useMemo(
    () => ({
      photoItemSettings,
      isLoadingPhotoItemSettings,
      photoItemSettingsError,
      getPhotoItems,
      updatePhotoItems,
      reloadPhotoItemSettings: loadPhotoItemSettings,
    }),
    [
      photoItemSettings,
      isLoadingPhotoItemSettings,
      photoItemSettingsError,
      getPhotoItems,
      updatePhotoItems,
      loadPhotoItemSettings,
    ],
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
