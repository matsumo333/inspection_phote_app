import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { db } from "../firebase";
import { parseInspectionPdf } from "../utils/parseInspectionPdf";

/**
 * 明日の日付をYYYY-MM-DD形式で作成する
 */
function getTomorrowDate() {
  const tomorrow = new Date();

  tomorrow.setDate(tomorrow.getDate() + 1);

  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const day = String(tomorrow.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * 空の物件情報
 */
const createEmptyFormData = () => ({
  managementNumber: "",
  inspectionDate: getTomorrowDate(),
  propertyName: "",
  inspectionType: "",
  address: "",
  supervisor: "",
});

function PropertyForm({
  initialData,
  onSave,
  onBulkSave,
  onClose,
  isEditMode = false,
}) {
  const navigate = useNavigate();

  const [formData, setFormData] = useState(() => ({
    ...createEmptyFormData(),
    ...(initialData ?? {}),
  }));

  const [inspectionTypes, setInspectionTypes] = useState([]);

  const [isLoadingInspectionTypes, setIsLoadingInspectionTypes] =
    useState(true);

  const [isSaving, setIsSaving] = useState(false);

  const [isReadingPdf, setIsReadingPdf] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");

  /**
   * Firestoreから検査種別一覧を取得
   */
  useEffect(() => {
    let isActive = true;

    async function loadInspectionTypes() {
      try {
        setIsLoadingInspectionTypes(true);

        const snapshot = await getDocs(collection(db, "photoItemSettings"));

        const nextInspectionTypes = snapshot.docs
          .map((documentSnapshot) => {
            const data = documentSnapshot.data();

            return String(data.inspectionType ?? documentSnapshot.id).trim();
          })
          .filter((inspectionType) => inspectionType !== "")
          .filter(
            (inspectionType, index, array) =>
              array.indexOf(inspectionType) === index,
          )
          .sort((first, second) => first.localeCompare(second, "ja"));

        if (!isActive) {
          return;
        }

        setInspectionTypes(nextInspectionTypes);
      } catch (error) {
        console.error("検査種別読み込みエラー:", error);

        if (!isActive) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);

        setErrorMessage(`検査種別を読み込めませんでした：${message}`);
      } finally {
        if (isActive) {
          setIsLoadingInspectionTypes(false);
        }
      }
    }

    loadInspectionTypes();

    return () => {
      isActive = false;
    };
  }, []);

  /**
   * 入力内容変更
   */
  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    setErrorMessage("");
  };

  /**
   * PDFから複数物件を読み取り、一括保存する
   */
  const handlePdfImport = async (event) => {
    const file = event.target.files?.[0];

    /*
     * 同じPDFを続けて選択できるようにする
     */
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setIsReadingPdf(true);
      setErrorMessage("");

      console.log("PDF読み取り開始:", file.name);

      const properties = await parseInspectionPdf(file, inspectionTypes);

      console.log("PDFから読み取った物件:", properties);

      if (!Array.isArray(properties)) {
        throw new Error("PDF解析結果の形式が正しくありません。");
      }

      if (properties.length === 0) {
        throw new Error("PDFから物件情報を取得できませんでした。");
      }

      const details = properties
        .map((property, index) => {
          return (
            `${index + 1}. ${property.inspectionDate ?? ""}\n` +
            `${property.managementNumber ?? ""}\n` +
            `${property.propertyName ?? ""}\n` +
            `${property.inspectionType ?? ""}`
          );
        })
        .join("\n\n");

      const shouldSave = window.confirm(
        `${properties.length}件を読み取りました。\n\n` +
          `${details}\n\n` +
          "すべて登録しますか？",
      );

      if (!shouldSave) {
        return;
      }

      if (typeof onBulkSave !== "function") {
        throw new Error("PDF一括保存処理が設定されていません。");
      }

      const savedCount = await onBulkSave(properties);

      window.alert(`${savedCount}件を登録しました。`);

      navigate("/");
    } catch (error) {
      console.error("PDF一括登録エラー:", error);

      const message = error instanceof Error ? error.message : String(error);

      setErrorMessage(`PDFを登録できませんでした：${message}`);
    } finally {
      setIsReadingPdf(false);
    }
  };

  /**
   * 通常の1件保存
   */
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSaving || isReadingPdf) {
      return;
    }

    if (!formData.managementNumber.trim()) {
      setErrorMessage("管理番号を入力してください。");
      return;
    }

    if (!formData.inspectionDate) {
      setErrorMessage("検査日を入力してください。");
      return;
    }

    if (!formData.propertyName.trim()) {
      setErrorMessage("物件名を入力してください。");
      return;
    }

    if (!formData.inspectionType) {
      setErrorMessage("検査種別を選択してください。");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");

      if (typeof onSave !== "function") {
        throw new Error("保存処理が設定されていません。");
      }

      await onSave({
        ...formData,

        managementNumber: formData.managementNumber.trim(),

        propertyName: formData.propertyName.trim(),

        inspectionType: formData.inspectionType.trim(),

        address: formData.address.trim(),

        supervisor: formData.supervisor.trim(),
      });
    } catch (error) {
      console.error("物件保存エラー:", error);

      const message = error instanceof Error ? error.message : String(error);

      setErrorMessage(`物件を保存できませんでした：${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * 戻る
   */
  const handleBack = () => {
    if (typeof onClose === "function") {
      onClose();
      return;
    }

    navigate("/");
  };

  const isFormBusy = isSaving || isReadingPdf || isLoadingInspectionTypes;

  return (
    <form className="property-form" onSubmit={handleSubmit}>
      <h2>{isEditMode ? "物件情報編集" : "新規物件登録"}</h2>

      {!isEditMode && (
        <div className="form-group">
          <label htmlFor="inspectionPdf">検査予定PDFから入力</label>

          <input
            id="inspectionPdf"
            type="file"
            accept="application/pdf,.pdf"
            onChange={handlePdfImport}
            disabled={isFormBusy}
          />

          {isReadingPdf && (
            <p className="loading-message">PDFを読み取っています...</p>
          )}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="managementNumber">管理番号</label>

        <input
          id="managementNumber"
          name="managementNumber"
          type="text"
          value={formData.managementNumber}
          onChange={handleChange}
          disabled={isSaving || isReadingPdf}
          autoFocus
        />
      </div>

      <div className="form-group">
        <label htmlFor="inspectionDate">検査日</label>

        <input
          id="inspectionDate"
          name="inspectionDate"
          type="date"
          value={formData.inspectionDate}
          onChange={handleChange}
          disabled={isSaving || isReadingPdf}
        />
      </div>

      <div className="form-group">
        <label htmlFor="propertyName">物件名</label>

        <input
          id="propertyName"
          name="propertyName"
          type="text"
          value={formData.propertyName}
          onChange={handleChange}
          disabled={isSaving || isReadingPdf}
        />
      </div>

      <div className="form-group">
        <label htmlFor="inspectionType">検査種別</label>

        <select
          id="inspectionType"
          name="inspectionType"
          value={formData.inspectionType}
          onChange={handleChange}
          disabled={isFormBusy}
        >
          <option value="">
            {isLoadingInspectionTypes ? "読み込み中..." : "選択してください"}
          </option>

          {formData.inspectionType &&
            !inspectionTypes.includes(formData.inspectionType) && (
              <option value={formData.inspectionType}>
                {formData.inspectionType}
                （現在は設定なし）
              </option>
            )}

          {inspectionTypes.map((inspectionType) => (
            <option key={inspectionType} value={inspectionType}>
              {inspectionType}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="address">住所</label>

        <input
          id="address"
          name="address"
          type="text"
          value={formData.address}
          onChange={handleChange}
          disabled={isSaving || isReadingPdf}
        />
      </div>

      <div className="form-group">
        <label htmlFor="supervisor">監督者</label>

        <input
          id="supervisor"
          name="supervisor"
          type="text"
          value={formData.supervisor}
          onChange={handleChange}
          disabled={isSaving || isReadingPdf}
        />
      </div>

      {errorMessage && <p className="error-message">{errorMessage}</p>}

      <div className="form-buttons">
        <button
          type="button"
          onClick={handleBack}
          disabled={isSaving || isReadingPdf}
        >
          戻る
        </button>

        <button type="submit" disabled={isFormBusy}>
          {isSaving
            ? "保存中..."
            : isReadingPdf
              ? "PDF読込中..."
              : isEditMode
                ? "更新"
                : "登録"}
        </button>
      </div>
    </form>
  );
}

export default PropertyForm;
