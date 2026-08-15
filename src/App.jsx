import { BrowserRouter, Route, Routes } from "react-router-dom";

import AuthGate from "./components/AuthGate";
import Navbar from "./components/Navbar";
import { PhotoItemSettingsProvider } from "./contexts/PhotoItemSettingsContext";
import PhotoItemSettingsPage from "./pages/PhotoItemSettingsPage";
import PhotoNumberPage from "./pages/PhotoNumberPage";
import PropertyFormPage from "./pages/PropertyFormPage";
import PropertyListPage from "./pages/PropertyListPage";

function App() {
  return (
    <AuthGate>
      <BrowserRouter>
        <PhotoItemSettingsProvider>
          <Navbar />

          <Routes>
            {/* 調査対象一覧 */}
            <Route path="/" element={<PropertyListPage />} />

            {/* 新規物件登録 */}
            <Route path="/property/new" element={<PropertyFormPage />} />

            {/* 物件編集 */}
            <Route path="/property/edit/:id" element={<PropertyFormPage />} />

            {/* 写真番号新規入力 */}
            <Route path="/photo/new" element={<PhotoNumberPage />} />

            {/* 物件ごとの写真番号入力・編集 */}
            <Route path="/photo/:id" element={<PhotoNumberPage />} />

            {/* 旧ルート互換用 */}
            <Route
              path="/property/photo-number"
              element={<PhotoNumberPage />}
            />

            {/* 写真項目設定 */}
            <Route
              path="/settings/photo-items"
              element={<PhotoItemSettingsPage />}
            />
          </Routes>
        </PhotoItemSettingsProvider>
      </BrowserRouter>
    </AuthGate>
  );
}

export default App;
