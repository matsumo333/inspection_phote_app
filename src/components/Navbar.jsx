import { useState } from "react";
import { MdSettings } from "react-icons/md";
import { NavLink } from "react-router-dom";
import "../styles/Navbar.scss";

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const getLinkClassName = ({ isActive }) =>
    isActive ? "navbar__link navbar__link--active" : "navbar__link";

  return (
    <nav className="navbar">
      <div className="navbar__container">
        {/* 左側に常時表示 */}
        <NavLink
          to="/settings/photo-items"
          className="navbar__settings"
          title="写真項目設定"
        >
          <MdSettings size={28} />
        </NavLink>

        {/* ハンバーガーボタン */}
        <button
          type="button"
          className="navbar__toggle"
          aria-label="メニューを開閉する"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((previous) => !previous)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>

        {/* 右側メニュー */}
        <div
          className={
            menuOpen ? "navbar__menu navbar__menu--open" : "navbar__menu"
          }
        >
          <NavLink to="/" end className={getLinkClassName} onClick={closeMenu}>
            調査対象一覧
          </NavLink>

          <NavLink
            to="/property/new"
            className={getLinkClassName}
            onClick={closeMenu}
          >
            調査対象追加
          </NavLink>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
