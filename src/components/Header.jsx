import { useNavigate } from "react-router-dom";

function Header() {
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <h1>地震保険写真管理</h1>

      <button type="button" onClick={() => navigate("/property/new")}>
        調査対象物件追加
      </button>
    </header>
  );
}

export default Header;
