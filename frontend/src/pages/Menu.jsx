import { useNavigate } from "react-router-dom";
import { getLocalUser, logoutUser } from "../services/api";
import AppBottomNav from "../components/AppBottomNav";
import "../App.css";

function Icon({ name }) {
  const paths = {
    camera: (
      <>
        <path d="M14.5 5 13 3H7L5.5 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-6.5Z" />
        <circle cx="10" cy="11" r="4" />
      </>
    ),
    practice: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </>
    ),
    stats: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20V7" />
        <path d="M2 20h22" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    logout: (
      <>
        <path d="M10 17l5-5-5-5M15 12H3" />
        <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      {paths[name]}
    </svg>
  );
}

const secondaryActions = [
  {
    icon: "practice",
    title: "Practicar",
    description: "Aprende las señas paso a paso",
    route: "/tutorial",
  },
  {
    icon: "history",
    title: "Historial",
    description: "Revisa tus traducciones guardadas",
    route: "/history",
  },
  {
    icon: "stats",
    title: "Estadísticas",
    description: "Consulta tu actividad y progreso",
    route: "/stats",
  },
];

function Menu() {
  const navigate = useNavigate();
  const user = getLocalUser();
  const username = user?.username || "Usuario";

  const handleLogout = () => {
    logoutUser();
    navigate("/login");
  };

  return (
    <main className="simple-menu-page">
      <section className="simple-menu-shell">
        <header className="simple-menu-header">
          <div className="simple-brand" aria-label="EnseñaVos">
            <span className="simple-brand-mark" aria-hidden="true">E</span>
            <span>EnseñaVos</span>
          </div>
          <div className="simple-avatar" aria-label={`Perfil de ${username}`}>
            {username.charAt(0).toUpperCase()}
          </div>
        </header>

        <section className="simple-welcome">
          <p>Hola, {username}</p>
          <h1>¿Qué quieres hacer?</h1>
        </section>

        <button
          className="simple-main-action"
          onClick={() => navigate("/translator")}
        >
          <span className="simple-action-copy">
            <small className="simple-main-label">TRADUCTOR EN VIVO</small>
            <strong>Traducir con la cámara</strong>
            <small>Reconoce señas en tiempo real</small>
          </span>
          <span className="simple-hand-visual" aria-hidden="true">🤟</span>
        </button>

        <section className="simple-options" aria-labelledby="options-title">
          <h2 id="options-title">Más opciones</h2>
          <div className="simple-option-list">
            {secondaryActions.map((action) => (
              <button
                key={action.route}
                className="simple-option"
                onClick={() => navigate(action.route)}
              >
                <span className="simple-option-icon"><Icon name={action.icon} /></span>
                <span className="simple-action-copy">
                  <strong>{action.title}</strong>
                  <small>{action.description}</small>
                </span>
                <span className="simple-arrow"><Icon name="arrow" /></span>
              </button>
            ))}
          </div>
        </section>

        <footer className="simple-menu-footer">
          <p><span aria-hidden="true"></span> Servicios disponibles</p>
          <button onClick={handleLogout}>
            <Icon name="logout" />
            Cerrar sesión
          </button>
        </footer>
        <AppBottomNav />
      </section>
    </main>
  );
}

export default Menu;
