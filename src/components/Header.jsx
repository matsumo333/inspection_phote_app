import { useNavigate } from "react-router-dom";

function Header() {
  const navigate = useNavigate();

  return (
    <header className="app-header">
      <h1>現場写真管理</h1>

      <button type="button" onClick={() => navigate("/property/new")}>
        新規物件
      </button>
    </header>
  );
}

export default Header;
