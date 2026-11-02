import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Avatar from "../components/Avatar";
import HelpButton from "../components/HelpButton";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import SignMedia from "../components/SignMedia";
import { logoutUser } from "../services/api";
import { clearCurrentProfile, getCurrentAvatar } from "../utils/profiles";

// Tres opciones grandes, cada una con su color, su seña en video y una palabra.
const ACTIONS = [
  { route: "/translator", label: "Traducir", icon: "camera", color: "blue", videoId: "menu-traducir" },
  { route: "/tutorial", label: "Practicar", icon: "hand", color: "green", videoId: "menu-practicar" },
  { route: "/history", label: "Historial", icon: "clock", color: "purple", videoId: "menu-historial" },
];

// Herramientas del equipo, fuera de la portada.
const TEAM_ACTIONS = [
  { route: "/stats", label: "Datos", icon: "stats", color: "gray" },
  { route: "/dynamic-recorder", label: "Grabar", icon: "video", color: "gray" },
];

const HELP_STEPS = ACTIONS.map((action) => ({ icon: action.icon, color: action.color }));

function Menu() {
  const navigate = useNavigate();
  const [avatar] = useState(() => getCurrentAvatar());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const logout = () => {
    logoutUser();
    clearCurrentProfile();
    navigate("/login");
  };

  return (
    <main className="a-screen">
      <header className="a-topbar">
        <Avatar avatar={avatar} size="sm" />

        <div className="a-topbar-group">
          <HelpButton videoId="ayuda-menu" steps={HELP_STEPS} />
          <button
            className="a-icon-btn"
            onClick={() => setSettingsOpen(true)}
            aria-label="Más opciones"
          >
            <Icon name="settings" />
          </button>
          <button className="a-icon-btn" onClick={logout} aria-label="Salir">
            <Icon name="logout" />
          </button>
        </div>
      </header>

      <nav className="a-tiles" aria-label="Menú principal">
        {ACTIONS.map((action) => (
          <button
            key={action.route}
            className={`a-tile a-c-${action.color}`}
            onClick={() => navigate(action.route)}
          >
            <SignMedia videoId={action.videoId} icon={action.icon} />
            <span className="a-tile-label">{action.label}</span>
          </button>
        ))}
      </nav>

      {settingsOpen && (
        <Modal onClose={() => setSettingsOpen(false)} label="Más opciones">
          <div className="a-tiles" style={{ width: "100%", paddingTop: 40 }}>
            {TEAM_ACTIONS.map((action) => (
              <button
                key={action.route}
                className={`a-tile a-tile--small a-c-${action.color}`}
                onClick={() => navigate(action.route)}
              >
                <SignMedia icon={action.icon} />
                <span className="a-tile-label">{action.label}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </main>
  );
}

export default Menu;
