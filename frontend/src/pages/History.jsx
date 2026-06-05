import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSessions } from "../services/api";
import "../App.css";

function History() {
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [message, setMessage] = useState("Cargando historial...");

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const data = await getSessions();
        setSessions(data);
        setMessage("");
      } catch (error) {
        console.error(error);
        setMessage("No se pudo cargar el historial");
      }
    };

    loadHistory();
  }, []);

  return (
    <main className="app-container">
      <section className="phone-frame menu-frame">
        <header className="app-header">
          <h1>EnseñaVos</h1>
          <p>Historial de sesiones</p>
        </header>

        {message && <p className="message">{message}</p>}

        <section className="history-list">
          {sessions.length === 0 && !message && (
            <p className="message">Todavía no hay sesiones guardadas.</p>
          )}

          {sessions.map((session) => (
            <div className="history-card" key={session.id}>
              <h3>Sesión #{session.id}</h3>
              <p>
                Fecha:{" "}
                {new Date(session.started_at).toLocaleString("es-CL")}
              </p>
              <p>Traducciones: {session.translations_count}</p>
              <p>Duración: {session.duration_seconds} segundos</p>
            </div>
          ))}
        </section>

        <section className="menu-options">
          <button onClick={() => navigate("/menu")}>Volver al menú</button>
        </section>
      </section>
    </main>
  );
}

export default History;