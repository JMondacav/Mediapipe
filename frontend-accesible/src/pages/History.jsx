import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import SignWords from "../components/SignWords";
import { getSessions, getTranslations } from "../services/api";
import { joinHistoryItems, speechText } from "../utils/expressions";
import { canSpeak, speak } from "../utils/feedback";

// Cada conversación como tarjeta: fecha, hora y las palabras dichas en señas
// (con la expresión de la cara), con un botón para volver a escucharlas.
function History() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([getSessions(), getTranslations()])
      .then(([sessionList, translations]) => {
        const textsBySession = {};

        [...translations]
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
          .forEach((item) => {
            textsBySession[item.session_id] = [
              ...(textsBySession[item.session_id] || []),
              item.text,
            ];
          });

        setSessions(
          sessionList
            .map((session) => ({
              ...session,
              items: joinHistoryItems(textsBySession[session.id] || []).map((item) => ({
                ...item,
                text: item.text.replaceAll("_", " "),
              })),
            }))
            .filter((session) => session.items.length > 0)
        );
      })
      .catch((error) => {
        console.error(error);
        setFailed(true);
      });
  }, []);

  return (
    <main className="a-screen">
      <header className="a-topbar">
        <button className="a-icon-btn" onClick={() => navigate("/menu")} aria-label="Volver al menú">
          <Icon name="back" />
        </button>
        <span className="a-screen-icon a-c-purple">
          <Icon name="clock" />
        </span>
        <span style={{ width: 64 }} />
      </header>

      {failed && (
        <div className="a-empty" style={{ color: "var(--a-red)" }} aria-label="Error">
          <Icon name="alert" />
        </div>
      )}

      {!failed && sessions === null && (
        <div className="a-empty" aria-label="Cargando">
          <span className="a-dots">
            <span />
            <span />
            <span />
          </span>
        </div>
      )}

      {sessions?.length === 0 && (
        <div className="a-empty" aria-label="Sin conversaciones">
          <Icon name="clock" />
        </div>
      )}

      {sessions?.map((session) => {
        const date = new Date(session.started_at);

        return (
          <article className="a-card" key={session.id}>
            <div className="a-session-meta">
              <span className="a-meta">
                <Icon name="calendar" />
                {date.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })}
              </span>
              <span className="a-meta">
                <Icon name="clock" />
                {date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            <SignWords
              items={session.items}
              showNames={false}
              animate={false}
              className="a-words--history a-c-purple"
            />

            {canSpeak() && (
              <div className="a-row" style={{ justifyContent: "flex-start" }}>
                <button
                  className="a-icon-btn a-icon-btn--soft a-c-purple"
                  onClick={() => speak(speechText(session.items))}
                  aria-label="Escuchar"
                >
                  <Icon name="speaker" />
                </button>
              </div>
            )}
          </article>
        );
      })}
    </main>
  );
}

export default History;
