import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getStats } from "../services/api";
import "../App.css";

function Stats() {
  const navigate = useNavigate();

  const [stats, setStats] = useState(null);
  const [message, setMessage] = useState("Cargando estadísticas...");

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await getStats();
        setStats(data);
        setMessage("");
      } catch (error) {
        console.error(error);
        setMessage("No se pudieron cargar las estadísticas");
      }
    };

    loadStats();
  }, []);

  return (
    <main className="app-container">
      <section className="phone-frame menu-frame">
        <header className="app-header">
          <h1>EnseñaVos</h1>
          <p>Estadísticas</p>
        </header>

        {message && <p className="message">{message}</p>}

        {stats && (
          <section className="stats-grid">
            <div className="stat-card">
              <h2>{stats.total_sessions}</h2>
              <p>Sesiones</p>
            </div>

            <div className="stat-card">
              <h2>{stats.total_translations}</h2>
              <p>Traducciones</p>
            </div>

            <div className="stat-card">
              <h2>{stats.total_feedbacks}</h2>
              <p>Feedbacks</p>
            </div>

            <div className="stat-card">
              <h2>{stats.average_rating}</h2>
              <p>Promedio satisfacción</p>
            </div>
          </section>
        )}

        <section className="menu-options">
          <button onClick={() => navigate("/menu")}>Volver al menú</button>
        </section>
      </section>
    </main>
  );
}

export default Stats;