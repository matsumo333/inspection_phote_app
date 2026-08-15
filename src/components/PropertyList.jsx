import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { db } from "../firebase";

import "../styles/PropertyList.scss";

/**
 * YYYY-MM-DD形式の日付を
 * ローカル時間のDateオブジェクトに変換する
 */
const parseLocalDate = (dateString) => {
  if (!dateString) {
    return null;
  }

  const [year, month, day] = dateString.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
};

/**
 * 今日の日付を取得する
 * 時刻部分は00:00:00にする
 */
const getToday = () => {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return today;
};

/**
 * 検査日から2日後の削除日を取得する
 */
const getDeleteDate = (inspectionDate) => {
  const date = parseLocalDate(inspectionDate);

  if (!date) {
    return null;
  }

  date.setDate(date.getDate() + 2);
  date.setHours(0, 0, 0, 0);

  return date;
};

function PropertyList() {
  const navigate = useNavigate();

  const [properties, setProperties] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const propertiesQuery = query(
      collection(db, "properties"),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      propertiesQuery,
      async (snapshot) => {
        const today = getToday();

        const propertyList = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        /*
         * 今日が「検査日＋2日」以降の物件を削除対象にする
         *
         * 例：
         * 検査日 8月1日
         * 削除日 8月3日
         */
        const expiredProperties = propertyList.filter((property) => {
          const deleteDate = getDeleteDate(property.inspectionDate);

          if (!deleteDate) {
            return false;
          }

          return today >= deleteDate;
        });

        /*
         * 古い物件情報と写真番号をFirestoreから削除する
         */
        if (expiredProperties.length > 0) {
          try {
            await Promise.all(
              expiredProperties.flatMap((property) => [
                deleteDoc(doc(db, "properties", property.id)),
                deleteDoc(doc(db, "propertyPhotos", property.id)),
              ]),
            );
          } catch (error) {
            console.error("期限切れ物件の自動削除エラー:", error);

            setErrorMessage("古い物件を自動削除できませんでした。");
            setIsLoading(false);

            return;
          }
        }

        /*
         * 削除日になっていない物件だけを画面に表示する
         */
        const activeProperties = propertyList.filter((property) => {
          const deleteDate = getDeleteDate(property.inspectionDate);

          /*
           * 検査日が未入力または不正な場合は削除せず表示する
           */
          if (!deleteDate) {
            return true;
          }

          return today < deleteDate;
        });

        setProperties(activeProperties);
        setIsLoading(false);
        setErrorMessage("");
      },
      (error) => {
        console.error("調査対象一覧の読み込みエラー:", error);

        setErrorMessage("調査対象一覧を読み込めませんでした。");
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, []);

  const openPhotoNumberPage = (propertyId) => {
    navigate(`/photo/${propertyId}`);
  };

  const openEditPage = (event, propertyId) => {
    event.stopPropagation();

    navigate(`/property/edit/${propertyId}`);
  };

  /**
   * 手動削除
   *
   * propertiesとpropertyPhotosの
   * 両方を削除する
   */
  const handleDelete = async (event, propertyId) => {
    event.stopPropagation();

    const confirmed = window.confirm("この物件を削除しますか？");

    if (!confirmed) {
      return;
    }

    try {
      await Promise.all([
        deleteDoc(doc(db, "properties", propertyId)),
        deleteDoc(doc(db, "propertyPhotos", propertyId)),
      ]);
    } catch (error) {
      console.error("調査対象削除エラー:", error);

      alert("調査対象を削除できませんでした。");
    }
  };

  if (isLoading) {
    return (
      <main className="property-list">
        <p>読み込み中です...</p>
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main className="property-list">
        <p className="property-list__error">{errorMessage}</p>
      </main>
    );
  }

  return (
    <main className="property-list">
      <div className="property-list__header">
        <h2>調査対象一覧</h2>
      </div>

      {properties.length === 0 ? (
        <p>登録されている調査対象はありません。</p>
      ) : (
        <div className="property-list__table-wrapper">
          <table className="property-list__table">
            <thead>
              <tr>
                {/* <th>管理番号</th> */}
                <th>調査対象名</th>
                <th>住所</th>
                <th>調査日</th>
                <th>調査予定</th>
                <th>構造種別</th>
                <th>操作</th>
              </tr>
            </thead>

            <tbody>
              {properties.map((property) => (
                <tr
                  key={property.id}
                  className="property-list__row"
                  onClick={() => openPhotoNumberPage(property.id)}
                >
                  {/* <td>{property.managementNumber}</td> */}
                  <td>{property.propertyName}</td>
                  <td>{property.address}</td>
                  <td>{property.inspectionDate}</td>
                  <td>{property.inspectionTime || "-"}</td>
                  <td>{property.inspectionType}</td>

                  <td>
                    <div className="property-list__actions">
                      <button
                        type="button"
                        className="property-list__edit-button"
                        onClick={(event) => openEditPage(event, property.id)}
                      >
                        編集
                      </button>

                      <button
                        type="button"
                        className="property-list__delete-button"
                        onClick={(event) => handleDelete(event, property.id)}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

export default PropertyList;
