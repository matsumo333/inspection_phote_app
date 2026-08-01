import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import PhotoNumberForm from "../components/PhotoNumberForm";
import { db } from "../firebase";

function PhotoNumberPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();

  const passedPropertyData = location.state?.propertyData || null;

  const [propertyData, setPropertyData] = useState(passedPropertyData);

  const [isLoading, setIsLoading] = useState(
    Boolean(id && !passedPropertyData),
  );

  const [error, setError] = useState("");

  useEffect(() => {
    if (!id || passedPropertyData) {
      return;
    }

    const loadProperty = async () => {
      try {
        setIsLoading(true);
        setError("");

        const propertyReference = doc(db, "properties", id);

        const propertySnapshot = await getDoc(propertyReference);

        if (!propertySnapshot.exists()) {
          setError("物件データが見つかりません。");
          return;
        }

        setPropertyData({
          id: propertySnapshot.id,
          ...propertySnapshot.data(),
        });
      } catch (loadError) {
        console.error("物件読み込みエラー:", loadError);

        setError(
          `物件を読み込めませんでした：${loadError.code || loadError.message}`,
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadProperty();
  }, [id, passedPropertyData]);

  const handleBack = () => {
    if (propertyData?.id) {
      navigate(`/property/edit/${propertyData.id}`, {
        state: {
          propertyData,
        },
      });

      return (
        <PhotoNumberForm
          key={propertyData.id || "new"}
          propertyData={propertyData}
          onSaved={handleSaved}
        />
      );
    }

    navigate("/property/new", {
      state: {
        propertyData,
      },
    });
  };

  const handleSaved = () => {
    navigate("/");
  };

  if (isLoading) {
    return <p>読み込み中...</p>;
  }

  if (error) {
    return (
      <section>
        <p>{error}</p>

        <button type="button" onClick={() => navigate("/")}>
          一覧へ戻る
        </button>
      </section>
    );
  }

  if (!propertyData) {
    return (
      <section>
        <p>物件情報がありません。 物件入力画面から開いてください。</p>

        <button type="button" onClick={() => navigate("/")}>
          一覧へ戻る
        </button>
      </section>
    );
  }

  return (
    <PhotoNumberForm
      key={propertyData.id || "new"}
      propertyData={propertyData}
      onBack={handleBack}
      onSaved={handleSaved}
    />
  );
}

export default PhotoNumberPage;
