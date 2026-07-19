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
      (snapshot) => {
        const propertyList = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        setProperties(propertyList);
        setIsLoading(false);
        setErrorMessage("");
      },
      (error) => {
        console.error("物件一覧の読込エラー:", error);

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

  const handleDelete = async (event, propertyId) => {
    event.stopPropagation();

    const confirmed = window.confirm("この物件を削除しますか？");

    if (!confirmed) {
      return;
    }

    try {
      await deleteDoc(doc(db, "properties", propertyId));
    } catch (error) {
      console.error("物件削除エラー:", error);
      alert("物件を削除できませんでした。");
    }
  };

  if (isLoading) {
    return <p>読み込み中です...</p>;
  }

  if (errorMessage) {
    return <p>{errorMessage}</p>;
  }

  return (
    <div className="property-list">
      <h2>物件一覧</h2>

      {properties.length === 0 ? (
        <p>登録されている物件はありません。</p>
      ) : (
        <table>
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
                onClick={() => openPhotoNumberPage(property.id)}
                style={{ cursor: "pointer" }}
              >
                <td>{property.managementNumber}</td>

                <td>
                  <button
                    type="button"
                    className="property-name-button"
                    onClick={() => openPhotoNumberPage(property.id)}
                  >
                    {property.propertyName}
                  </button>
                </td>

                <td>{property.inspectionDate}</td>
                <td>{property.inspectionType}</td>

                <td>
                  <button
                    type="button"
                    onClick={(event) => openEditPage(event, property.id)}
                  >
                    編集
                  </button>

                  <button
                    type="button"
                    onClick={(event) => handleDelete(event, property.id)}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default PropertyList;
