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
 * 今日から2日前の日付を
 * YYYY-MM-DD形式で取得する
 */
const getTwoDaysAgo = () => {
  const date = new Date();

  // 端末のローカル時間を基準に2日前にする
  date.setDate(date.getDate() - 2);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
        const twoDaysAgo = getTwoDaysAgo();

        const propertyList = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        /*
         * 検査日が2日前以前の物件を抽出する
         */
        const expiredProperties = propertyList.filter((property) => {
          if (!property.inspectionDate) {
            return false;
          }

          return property.inspectionDate <= twoDaysAgo;
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
         * 画面には削除対象以外を表示する
         */
        const activeProperties = propertyList.filter((property) => {
          if (!property.inspectionDate) {
            return true;
          }

          return property.inspectionDate > twoDaysAgo;
        });

        setProperties(activeProperties);
        setIsLoading(false);
        setErrorMessage("");
      },
      (error) => {
        console.error("物件一覧の読み込みエラー:", error);

        setErrorMessage("物件一覧を読み込めませんでした。");

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
      console.error("物件削除エラー:", error);

      alert("物件を削除できませんでした。");
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
        <h2>物件一覧</h2>
      </div>

      {properties.length === 0 ? (
        <p>登録されている物件はありません。</p>
      ) : (
        <div className="property-list__table-wrapper">
          <table className="property-list__table">
            <thead>
              <tr>
                <th>管理番号</th>
                <th>物件名</th>
                <th>検査日</th>
                <th>検査種別</th>
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
                  <td>{property.managementNumber}</td>

                  <td>{property.propertyName}</td>

                  <td>{property.inspectionDate}</td>

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
