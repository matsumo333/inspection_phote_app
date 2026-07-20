import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";

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

function PropertyForm({ initialData, onSave, onClose, isEditMode = false }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState(() => ({
    ...createEmptyFormData(),
    ...(initialData ?? {}),
  }));

  const [inspectionTypes, setInspectionTypes] = useState([]);

  const [isLoadingInspectionTypes, setIsLoadingInspectionTypes] =
    useState(true);

  const [isSaving, setIsSaving] = useState(false);

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

        setErrorMessage(
          `検査種別を読み込めませんでした：${
            error.code ?? error.message ?? "不明なエラー"
          }`,
        );
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
   * フォーム送信
   */
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isSaving) {
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

        address: formData.address.trim(),

        supervisor: formData.supervisor.trim(),
      });
    } catch (error) {
      console.error("物件保存エラー:", error);

      setErrorMessage(
        `物件を保存できませんでした：${
          error.code ?? error.message ?? "不明なエラー"
        }`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (typeof onClose === "function") {
      onClose();
      return;
    }

    navigate("/");
  };

  return (
    <form className="property-form" onSubmit={handleSubmit}>
      <h2>{isEditMode ? "物件情報編集" : "新規物件登録"}</h2>

      <div className="form-group">
        <label htmlFor="managementNumber">管理番号</label>

        <input
          id="managementNumber"
          name="managementNumber"
          type="text"
          value={formData.managementNumber}
          onChange={handleChange}
          disabled={isSaving}
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
          disabled={isSaving}
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
          disabled={isSaving}
        />
      </div>

      <div className="form-group">
        <label htmlFor="inspectionType">検査種別</label>

        <select
          id="inspectionType"
          name="inspectionType"
          value={formData.inspectionType}
          onChange={handleChange}
          disabled={isSaving || isLoadingInspectionTypes}
        >
          <option value="">
            {isLoadingInspectionTypes ? "読み込み中..." : "選択してください"}
          </option>

          {/*
           * 編集中の古い検査種別が
           * 設定から削除されていても表示する
           */}
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
          disabled={isSaving}
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
          disabled={isSaving}
        />
      </div>

      {errorMessage && <p className="error-message">{errorMessage}</p>}

      <div className="form-buttons">
        <button type="button" onClick={handleBack} disabled={isSaving}>
          戻る
        </button>

        <button type="submit" disabled={isSaving || isLoadingInspectionTypes}>
          {isSaving ? "保存中..." : isEditMode ? "更新" : "登録"}
        </button>
      </div>
    </form>
  );
}

export default PropertyForm;
