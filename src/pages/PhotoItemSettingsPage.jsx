import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";

import { db } from "../firebase";

/**
 * 検査種別を比較・検索しやすい文字列に変換する
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
 * テキストエリアの内容を写真項目配列へ変換する
 */
function convertTextToItems(text) {
  return text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/**
 * 重複する写真項目を取り除く
 */
function removeDuplicateItems(items) {
  return [...new Set(items)];
}

function PhotoItemSettingsPage() {
  const [settings, setSettings] = useState([]);

  const [selectedDocumentId, setSelectedDocumentId] = useState("");

  const [newInspectionType, setNewInspectionType] = useState("");

  const [itemsText, setItemsText] = useState("");

  const [isLoading, setIsLoading] = useState(true);

  const [isSaving, setIsSaving] = useState(false);

  const [isDeleting, setIsDeleting] = useState(false);

  const [message, setMessage] = useState("");

  const [errorMessage, setErrorMessage] = useState("");

  /**
   * 現在選択中の設定
   */
  const selectedSetting =
    settings.find((setting) => setting.id === selectedDocumentId) ?? null;

  /**
   * Firestoreから検査種別一覧を読み込む
   */
  const loadSettings = async (preferredDocumentId = "") => {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const snapshot = await getDocs(collection(db, "photoItemSettings"));

      const nextSettings = snapshot.docs
        .map((documentSnapshot) => {
          const data = documentSnapshot.data();

          return {
            id: documentSnapshot.id,

            inspectionType: String(
              data.inspectionType ?? documentSnapshot.id,
            ).trim(),

            normalizedInspectionType: String(
              data.normalizedInspectionType ??
                normalizeInspectionType(
                  data.inspectionType ?? documentSnapshot.id,
                ),
            ),

            items: Array.isArray(data.items)
              ? data.items
                  .map((item) => String(item ?? "").trim())
                  .filter((item) => item !== "")
              : [],
          };
        })
        .filter((setting) => setting.inspectionType !== "")
        .sort((first, second) =>
          first.inspectionType.localeCompare(second.inspectionType, "ja"),
        );

      setSettings(nextSettings);

      let nextSelectedDocumentId = "";

      if (
        preferredDocumentId &&
        nextSettings.some((setting) => setting.id === preferredDocumentId)
      ) {
        nextSelectedDocumentId = preferredDocumentId;
      } else if (
        selectedDocumentId &&
        nextSettings.some((setting) => setting.id === selectedDocumentId)
      ) {
        nextSelectedDocumentId = selectedDocumentId;
      } else if (nextSettings.length > 0) {
        nextSelectedDocumentId = nextSettings[0].id;
      }

      setSelectedDocumentId(nextSelectedDocumentId);

      const nextSelectedSetting = nextSettings.find(
        (setting) => setting.id === nextSelectedDocumentId,
      );

      setItemsText(
        nextSelectedSetting ? nextSelectedSetting.items.join("\n") : "",
      );
    } catch (error) {
      console.error("写真項目設定読み込みエラー:", error);

      setErrorMessage(
        `設定を読み込めませんでした：${
          error.code ?? error.message ?? "不明なエラー"
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 初回読み込み
   */
  useEffect(() => {
    loadSettings();
  }, []);

  /**
   * 編集対象を変更
   */
  const handleSettingChange = (event) => {
    const nextDocumentId = event.target.value;

    setSelectedDocumentId(nextDocumentId);

    const nextSetting = settings.find(
      (setting) => setting.id === nextDocumentId,
    );

    setItemsText(nextSetting ? nextSetting.items.join("\n") : "");

    setMessage("");
    setErrorMessage("");
  };

  /**
   * 新しい検査種別を追加
   */
  const handleAddInspectionType = async () => {
    if (isSaving) {
      return;
    }

    const trimmedInspectionType = newInspectionType.trim();

    if (!trimmedInspectionType) {
      setErrorMessage("追加する検査種別を入力してください。");
      return;
    }

    const normalizedInspectionType = normalizeInspectionType(
      trimmedInspectionType,
    );

    if (!normalizedInspectionType) {
      setErrorMessage("有効な検査種別を入力してください。");
      return;
    }

    const duplicateSetting = settings.find(
      (setting) =>
        setting.normalizedInspectionType === normalizedInspectionType,
    );

    if (duplicateSetting) {
      setErrorMessage(
        `「${duplicateSetting.inspectionType}」はすでに登録されています。`,
      );

      setSelectedDocumentId(duplicateSetting.id);

      setItemsText(duplicateSetting.items.join("\n"));

      return;
    }

    /*
     * FirestoreのドキュメントIDに「/」は使用できないため置換
     */
    const documentId = normalizedInspectionType.replace(/\//g, "／");

    try {
      setIsSaving(true);
      setMessage("");
      setErrorMessage("");

      const documentReference = doc(db, "photoItemSettings", documentId);

      await setDoc(documentReference, {
        inspectionType: trimmedInspectionType,

        normalizedInspectionType,

        items: [],

        createdAt: serverTimestamp(),

        updatedAt: serverTimestamp(),
      });

      setNewInspectionType("");

      await loadSettings(documentId);

      setMessage(
        `検査種別「${trimmedInspectionType}」を追加しました。続けて写真項目を入力してください。`,
      );
    } catch (error) {
      console.error("検査種別追加エラー:", error);

      setErrorMessage(
        `検査種別を追加できませんでした：${
          error.code ?? error.message ?? "不明なエラー"
        }`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Enterキーでも検査種別を追加
   */
  const handleNewTypeKeyDown = (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    handleAddInspectionType();
  };

  /**
   * 写真項目を保存
   */
  const handleSaveItems = async () => {
    if (isSaving || !selectedSetting) {
      return;
    }

    const items = removeDuplicateItems(convertTextToItems(itemsText));

    if (items.length === 0) {
      setErrorMessage("写真項目を1件以上入力してください。");
      return;
    }

    try {
      setIsSaving(true);
      setMessage("");
      setErrorMessage("");

      const documentReference = doc(
        db,
        "photoItemSettings",
        selectedSetting.id,
      );

      await setDoc(
        documentReference,
        {
          inspectionType: selectedSetting.inspectionType,

          normalizedInspectionType: normalizeInspectionType(
            selectedSetting.inspectionType,
          ),

          items,

          updatedAt: serverTimestamp(),
        },
        {
          merge: true,
        },
      );

      setItemsText(items.join("\n"));

      await loadSettings(selectedSetting.id);

      setMessage(
        `「${selectedSetting.inspectionType}」の写真項目を保存しました。`,
      );
    } catch (error) {
      console.error("写真項目保存エラー:", error);

      setErrorMessage(
        `写真項目を保存できませんでした：${
          error.code ?? error.message ?? "不明なエラー"
        }`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 検査種別を削除
   */
  const handleDeleteInspectionType = async () => {
    if (isDeleting || !selectedSetting) {
      return;
    }

    const confirmed = window.confirm(
      `検査種別「${selectedSetting.inspectionType}」を削除しますか？\n\nこの検査種別の写真項目設定も削除されます。`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsDeleting(true);
      setMessage("");
      setErrorMessage("");

      await deleteDoc(doc(db, "photoItemSettings", selectedSetting.id));

      setItemsText("");

      await loadSettings();

      setMessage(
        `検査種別「${selectedSetting.inspectionType}」を削除しました。`,
      );
    } catch (error) {
      console.error("検査種別削除エラー:", error);

      setErrorMessage(
        `検査種別を削除できませんでした：${
          error.code ?? error.message ?? "不明なエラー"
        }`,
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <section className="photo-item-settings">
        <h2>写真項目設定</h2>

        <p>検査種別を読み込んでいます...</p>
      </section>
    );
  }

  return (
    <section className="photo-item-settings">
      <h2>写真項目設定</h2>

      <div className="settings-section">
        <h3>検査種別の追加</h3>
        <a>
          新しい検査種別を設ける場合は下記枠に入力し、検査種別を追加ボタンを押してください。
        </a>

        <div className="inspection-type-add-row">
          <input
            id="newInspectionType"
            type="text"
            value={newInspectionType}
            onChange={(event) => setNewInspectionType(event.target.value)}
            onKeyDown={handleNewTypeKeyDown}
            placeholder="例：木完"
            disabled={isSaving || isDeleting}
          />

          <button
            type="button"
            onClick={handleAddInspectionType}
            disabled={isSaving || isDeleting || !newInspectionType.trim()}
          >
            {isSaving ? "処理中..." : "検査種別を追加"}
          </button>
        </div>
      </div>

      <hr />

      <div className="settings-section">
        <h3>写真項目の編集</h3>

        <label htmlFor="inspectionType">検査種別</label>

        <select
          id="inspectionType"
          value={selectedDocumentId}
          onChange={handleSettingChange}
          disabled={isSaving || isDeleting || settings.length === 0}
        >
          {settings.length === 0 && (
            <option value="">検査種別がありません</option>
          )}

          {settings.map((setting) => (
            <option key={setting.id} value={setting.id}>
              {setting.inspectionType}
            </option>
          ))}
        </select>

        {selectedSetting && (
          <>
            <label htmlFor="itemsText">写真項目</label>

            <p>
              写真項目を変更する場合、上記の検査種別を選んで、下記の項目を修正してください。
              1行が1項目となり、上から順番に画面表示されます。
            </p>

            <textarea
              id="itemsText"
              rows={18}
              value={itemsText}
              onChange={(event) => setItemsText(event.target.value)}
              disabled={isSaving || isDeleting}
            />

            <div className="settings-buttons">
              <button
                type="button"
                onClick={handleSaveItems}
                disabled={isSaving || isDeleting || !itemsText.trim()}
              >
                {isSaving ? "保存中..." : "写真項目を保存"}
              </button>

              <button
                type="button"
                onClick={handleDeleteInspectionType}
                disabled={isSaving || isDeleting}
                className="delete-button"
              >
                {isDeleting ? "削除中..." : "検査種別を削除"}
              </button>
            </div>
          </>
        )}
      </div>

      {errorMessage && <p className="error-message">{errorMessage}</p>}

      {message && <p className="save-message">{message}</p>}
    </section>
  );
}

export default PhotoItemSettingsPage;
