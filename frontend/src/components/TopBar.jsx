import { useNavigate } from "react-router-dom";
import Icon from "./Icon";

// Cabecera de las pantallas que se abren encima de otra (Entrar, Crear cuenta).
function TopBar({ title, backTo }) {
  const navigate = useNavigate();

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <button
          type="button"
          className="icon-btn"
          onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
          aria-label="Atrás"
        >
          <Icon name="back" />
        </button>
        <h1 className="topbar-title">{title}</h1>
      </div>
    </header>
  );
}

export default TopBar;
