import { useLocation, useNavigate } from "react-router-dom";
import "../App.css";

const items = [
  { route: "/menu", label: "Inicio", icon: "home" },
  { route: "/translator", label: "Traducir", icon: "camera" },
  { route: "/tutorial", label: "Practicar", icon: "practice" },
  { route: "/history", label: "Historial", icon: "history" },
  { route: "/stats", label: "Datos", icon: "stats" },
];

function NavIcon({ name }) {
  const paths = {
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    camera: <><path d="M14.5 5 13 3H7L5.5 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-6.5Z" /><circle cx="12" cy="11" r="4" /></>,
    practice: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    stats: <><path d="M5 20V10M12 20V4M19 20v-7" /><path d="M2 20h20" /></>,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">{paths[name]}</svg>;
}

function AppBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="app-bottom-nav" aria-label="Navegación principal">
      {items.map((item) => {
        const active = location.pathname === item.route;
        return (
          <button
            key={item.route}
            className={active ? "active" : ""}
            onClick={() => navigate(item.route)}
            aria-current={active ? "page" : undefined}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default AppBottomNav;
