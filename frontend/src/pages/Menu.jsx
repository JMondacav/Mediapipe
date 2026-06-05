import { useNavigate } from "react-router-dom";
import { getLocalUser, logoutUser } from "../services/api";
import "../App.css";

function Menu() {
  const navigate = useNavigate();
  const user = getLocalUser();

  const handleLogout = () => {
    logoutUser();
    navigate("/login");
  };

  return (
    <main className="retro-menu-page">
      <section className="retro-phone">
        <header className="retro-topbar">
          <div className="retro-brand">
            <div className="retro-camera-mark">
              <span className="camera-lens"></span>
              <span className="camera-flash"></span>
            </div>

            <div>
              <p>EnseñaVos</p>
              <h1>Inicio</h1>
            </div>
          </div>

          <button className="retro-profile" onClick={handleLogout}>
            {user?.username?.charAt(0)?.toUpperCase() || "U"}
          </button>
        </header>

        <section className="retro-welcome-card">
          <p className="retro-small-label">Bienvenido</p>
          <h2>{user?.username || "Usuario"}</h2>
          <p>
            Traduce señas en tiempo real usando la cámara del celular y
            reconocimiento de mano con MediaPipe.
          </p>
        </section>

        <section className="retro-main-action">
          <button
            className="translate-big-button"
            onClick={() => navigate("/translator")}
          >
            <div className="translate-icon-wrap">
              <span className="translate-hand">✋</span>
            </div>

            <div className="translate-text">
              <span>Comenzar</span>
              <h2>Traducir ahora</h2>
              <p>Reconocimiento en vivo</p>
            </div>

            <span className="translate-arrow">›</span>
          </button>
        </section>

        <section className="retro-cards-grid">
          <button
            className="retro-mini-card"
            onClick={() => navigate("/history")}
          >
            <div className="retro-mini-icon blue">⌚</div>
            <h3>Historial</h3>
            <p>Revisa tus sesiones guardadas.</p>
          </button>

          <button
            className="retro-mini-card"
            onClick={() => navigate("/stats")}
          >
            <div className="retro-mini-icon peach">📊</div>
            <h3>Estadísticas</h3>
            <p>Uso, traducciones y feedback.</p>
          </button>
        </section>

        <section className="retro-system-card">
          <div className="retro-status-row">
            <span className="retro-status-dot green"></span>
            <div>
              <h4>MediaPipe Hands</h4>
              <p>Detección de mano disponible</p>
            </div>
          </div>

          <div className="retro-status-row">
            <span className="retro-status-dot amber"></span>
            <div>
              <h4>Base de datos</h4>
              <p>Sesiones y feedback guardados en Django</p>
            </div>
          </div>
        </section>

        <footer className="retro-bottom-nav">
          <button className="retro-nav-item active">
            <span>⌂</span>
            Inicio
          </button>

          <button
            className="retro-nav-item"
            onClick={() => navigate("/translator")}
          >
            <span>✋</span>
            Traducir
          </button>

          <button className="retro-nav-item" onClick={() => navigate("/stats")}>
            <span>◌</span>
            Datos
          </button>
        </footer>
      </section>
    </main>
  );
}

export default Menu;
