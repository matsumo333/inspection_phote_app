import { BrowserRouter, Route, Routes } from "react-router-dom";

import Navbar from "./components/Navbar";
import { PhotoItemSettingsProvider } from "./contexts/PhotoItemSettingsContext";
import PhotoItemSettingsPage from "./pages/PhotoItemSettingsPage";
import PhotoNumberPage from "./pages/PhotoNumberPage";
import PropertyFormPage from "./pages/PropertyFormPage";
import PropertyListPage from "./pages/PropertyListPage";

function App() {
  return (
    <BrowserRouter>
      <PhotoItemSettingsProvider>
        <Navbar />

        <Routes>
          <Route path="/" element={<PropertyListPage />} />

          <Route path="/property/new" element={<PropertyFormPage />} />

          <Route path="/property/edit/:id" element={<PropertyFormPage />} />

          <Route path="/photo/new" element={<PhotoNumberPage />} />

          <Route path="/photo/:id" element={<PhotoNumberPage />} />

          <Route path="/property/photo-number" element={<PhotoNumberPage />} />

          <Route
            path="/settings/photo-items"
            element={<PhotoItemSettingsPage />}
          />
        </Routes>
      </PhotoItemSettingsProvider>
    </BrowserRouter>
  );
}

export default App;
