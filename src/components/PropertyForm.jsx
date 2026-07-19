import { useState } from "react";

const getTomorrow = () => {
  const date = new Date();

  // 日本時間で翌日にする
  date.setDate(date.getDate() + 1);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const createEmptyFormData = () => ({
  managementNumber: "",
  inspectionDate: getTomorrow(),
  propertyName: "",
  inspectionType: "",
  address: "",
  supervisor: "",
});

function PropertyForm({ initialData, onSave, onClose, isEditMode = false }) {
  const [formData, setFormData] = useState(() => {
    const data = {
      ...createEmptyFormData(),
      ...(initialData ?? {}),
    };

    if (!data.inspectionDate) {
      data.inspectionDate = getTomorrow();
    }

    return data;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.managementNumber.trim()) {
      setErrorMessage("管理番号を入力してください。");
      return;
    }

    if (!formData.propertyName.trim()) {
      setErrorMessage("物件名を入力してください。");
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage("");

      const { id: propertyId, createdAt, updatedAt, ...saveData } = formData;

      await onSave(saveData);
    } catch (error) {
      console.error("物件保存エラー:", error);
      setErrorMessage(
        isEditMode
          ? "物件情報を更新できませんでした。"
          : "物件情報を登録できませんでした。",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="property-form">
      <h2>{isEditMode ? "物件情報の編集" : "新規物件登録"}</h2>

      {errorMessage && <p className="property-form__error">{errorMessage}</p>}

      <div className="property-form__field">
        <label htmlFor="managementNumber">管理番号</label>

        <input
          id="managementNumber"
          name="managementNumber"
          type="text"
          value={formData.managementNumber}
          onChange={handleChange}
        />
      </div>

      <div className="property-form__field">
        <label htmlFor="inspectionDate">検査日</label>

        <input
          id="inspectionDate"
          name="inspectionDate"
          type="date"
          value={formData.inspectionDate}
          onChange={handleChange}
        />
      </div>

      <div className="property-form__field">
        <label htmlFor="propertyName">物件名</label>

        <input
          id="propertyName"
          name="propertyName"
          type="text"
          value={formData.propertyName}
          onChange={handleChange}
        />
      </div>

      <div className="property-form__field">
        <label htmlFor="inspectionType">検査種別</label>

        <select
          id="inspectionType"
          name="inspectionType"
          value={formData.inspectionType}
          onChange={handleChange}
        >
          <option value="">選択してください</option>
          <option value="配筋検査">配筋検査</option>
          <option value="上棟検査">上棟検査</option>
          <option value="防水検査">防水検査</option>
          <option value="完了検査">完了検査</option>
        </select>
      </div>

      <div className="property-form__buttons">
        <button type="submit" disabled={isSaving}>
          {isSaving ? "保存中..." : isEditMode ? "変更を保存" : "登録"}
        </button>

        <button type="button" onClick={onClose} disabled={isSaving}>
          キャンセル
        </button>
      </div>
    </form>
  );
}

export default PropertyForm;
