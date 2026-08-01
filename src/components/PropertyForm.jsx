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
 * 比較用に文字列を整える
 *
 * ・nullやundefinedを空文字にする
 * ・前後の空白を削除する
 * ・半角空白、全角空白、改行を削除する
 * ・英字の大文字と小文字を同じものとして扱う
 */
const normalizeValue = (value) => {
  return String(value ?? "")
    .trim()
    .replace(/[\s\u3000]+/g, "")
    .toLowerCase();
};

/**
 * 管理番号と検査種別から
 * 重複確認用のキーを作成する
 */
const createDuplicateKey = (managementNumber, inspectionType) => {
  const normalizedManagementNumber = normalizeValue(managementNumber);
  const normalizedInspectionType = normalizeValue(inspectionType);

  return `${normalizedManagementNumber}__${normalizedInspectionType}`;
};

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
   * PDFから読み取った物件を整える
   */
  const normalizePdfProperty = (property) => {
    return {
      ...property,

      managementNumber: String(property.managementNumber ?? "").trim(),

      inspectionDate: String(property.inspectionDate ?? "").trim(),

      propertyName: String(property.propertyName ?? "").trim(),

      inspectionType: String(property.inspectionType ?? "").trim(),

      address: String(property.address ?? "").trim(),

      supervisor: String(property.supervisor ?? "").trim(),
    };
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

      const parsedProperties = await parseInspectionPdf(file, inspectionTypes);

      console.log("PDFから読み取った物件:", parsedProperties);

      if (!Array.isArray(parsedProperties)) {
        throw new Error("PDF解析結果の形式が正しくありません。");
      }

      if (parsedProperties.length === 0) {
        throw new Error("PDFから物件情報を取得できませんでした。");
      }

      /*
       * PDFから読み取った文字列の前後の空白を除去する
       */
      const properties = parsedProperties.map(normalizePdfProperty);

      /*
       * 管理番号または検査種別が空の物件を確認する
       */
      const invalidProperties = properties.filter(
        (property) => !property.managementNumber || !property.inspectionType,
      );

      if (invalidProperties.length > 0) {
        const invalidDetails = invalidProperties
          .map((property, index) => {
            return (
              `${index + 1}. ` +
              `管理番号：${property.managementNumber || "未取得"}\n` +
              `検査種別：${property.inspectionType || "未取得"}\n` +
              `物件名：${property.propertyName || "未取得"}`
            );
          })
          .join("\n\n");

        throw new Error(
          "管理番号または検査種別を取得できない物件があります。\n\n" +
            invalidDetails,
        );
      }

      /*
       * Firestoreに現在登録されている
       * すべての物件を取得する
       */
      const existingSnapshot = await getDocs(collection(db, "properties"));

      /*
       * 登録済みの「管理番号＋検査種別」を
       * Setに格納する
       */
      const existingKeys = new Set(
        existingSnapshot.docs.map((documentSnapshot) => {
          const data = documentSnapshot.data();

          return createDuplicateKey(data.managementNumber, data.inspectionType);
        }),
      );

      /*
       * PDF内の重複確認に使用する
       */
      const pdfKeys = new Set();

      /*
       * 新規登録できる物件
       */
      const newProperties = [];

      /*
       * 重複しているため登録しない物件
       */
      const duplicateProperties = [];

      properties.forEach((property) => {
        const duplicateKey = createDuplicateKey(
          property.managementNumber,
          property.inspectionType,
        );

        /*
         * Firestoreに同じ
         * 「管理番号＋検査種別」が存在するか
         */
        const alreadyExists = existingKeys.has(duplicateKey);

        /*
         * 同じPDF内に同じ
         * 「管理番号＋検査種別」が存在するか
         */
        const duplicatedInPdf = pdfKeys.has(duplicateKey);

        if (alreadyExists) {
          duplicateProperties.push({
            ...property,
            duplicateReason: "すでに登録されています",
          });

          return;
        }

        if (duplicatedInPdf) {
          duplicateProperties.push({
            ...property,
            duplicateReason: "PDF内で重複しています",
          });

          return;
        }

        pdfKeys.add(duplicateKey);
        newProperties.push(property);
      });

      /*
       * すべての物件が重複している場合
       */
      if (newProperties.length === 0) {
        const duplicateDetails = duplicateProperties
          .map((property, index) => {
            return (
              `${index + 1}. ` +
              `${property.managementNumber}\n` +
              `${property.propertyName}\n` +
              `${property.inspectionType}\n` +
              `理由：${property.duplicateReason}`
            );
          })
          .join("\n\n");

        window.alert(
          "新規登録できる物件がありません。\n\n" +
            "次の物件は登録済み、またはPDF内で重複しています。\n\n" +
            duplicateDetails,
        );

        return;
      }

      /*
       * 新規登録する物件の内容
       */
      const newPropertyDetails = newProperties
        .map((property, index) => {
          return (
            `${index + 1}. ${property.inspectionDate}\n` +
            `${property.managementNumber}\n` +
            `${property.propertyName}\n` +
            `${property.inspectionType}`
          );
        })
        .join("\n\n");

      /*
       * 重複している物件の内容
       */
      const duplicateDetails = duplicateProperties
        .map((property, index) => {
          return (
            `${index + 1}. ` +
            `${property.managementNumber} / ` +
            `${property.inspectionType}\n` +
            `理由：${property.duplicateReason}`
          );
        })
        .join("\n\n");

      let confirmMessage =
        `${newProperties.length}件を新規登録します。\n\n` + newPropertyDetails;

      if (duplicateProperties.length > 0) {
        confirmMessage +=
          `\n\n──────────────\n` +
          `登録しない重複物件：${duplicateProperties.length}件\n\n` +
          duplicateDetails;
      }

      confirmMessage += "\n\n重複していない物件だけを登録しますか？";

      const shouldSave = window.confirm(confirmMessage);

      if (!shouldSave) {
        return;
      }

      if (typeof onBulkSave !== "function") {
        throw new Error("PDF一括保存処理が設定されていません。");
      }

      /*
       * 重複していない物件だけを保存する
       */
      const savedCount = await onBulkSave(newProperties);

      let completeMessage = `${savedCount}件を登録しました。`;

      if (duplicateProperties.length > 0) {
        completeMessage +=
          `\n\n${duplicateProperties.length}件は、` +
          "同じ管理番号と検査種別が存在するため登録しませんでした。";
      }

      window.alert(completeMessage);

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
