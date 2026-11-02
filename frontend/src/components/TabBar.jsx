import { NavLink } from "react-router-dom";
import Icon from "./Icon";

// Las mismas 5 pestañas, en el mismo orden, en todas las pantallas.
const TABS = [
  { route: "/home", label: "Inicio", icon: "home" },
  { route: "/translate", label: "Traducir", icon: "chats" },
  { route: "/learn", label: "Aprender", icon: "book", ariaLabel: "Aprender señas y frases" },
  { route: "/history", label: "Historial", icon: "clock" },
  { route: "/profile", label: "Perfil", icon: "user", ariaLabel: "Perfil y ajustes" },
];

function TabBar() {
  return (
    <nav className="tabbar" aria-label="Secciones">
      <div className="tabbar-inner">
        {TABS.map((tab) => (
          <NavLink
            key={tab.route}
            to={tab.route}
            className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
            aria-label={tab.ariaLabel}
          >
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export default TabBar;
