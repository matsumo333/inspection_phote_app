import { useState } from "react";
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
        <button
          type="button"
          className="navbar__toggle"
          aria-label="メニューを開閉する"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((previous) => !previous)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>

        <div
          className={
            menuOpen ? "navbar__menu navbar__menu--open" : "navbar__menu"
          }
        >
          <NavLink to="/" end className={getLinkClassName} onClick={closeMenu}>
            物件一覧
          </NavLink>

          <NavLink
            to="/property/new"
            className={getLinkClassName}
            onClick={closeMenu}
          >
            新規登録
          </NavLink>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
