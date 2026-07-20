import { BrowserRouter, Route, Routes } from "react-router-dom";

import Navbar from "./components/Navbar";
import PhotoItemSettingsPage from "./pages/PhotoItemSettingsPage";
import PhotoNumberPage from "./pages/PhotoNumberPage";
import PropertyFormPage from "./pages/PropertyFormPage";
import PropertyListPage from "./pages/PropertyListPage";

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <Navbar />

        <Routes>
          <Route path="/" element={<PropertyListPage />} />

          <Route path="/property/new" element={<PropertyFormPage />} />

          <Route path="/property/edit/:id" element={<PropertyFormPage />} />

          <Route path="/photo/:id" element={<PhotoNumberPage />} />

          <Route
            path="/settings/photo-items"
            element={<PhotoItemSettingsPage />}
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
