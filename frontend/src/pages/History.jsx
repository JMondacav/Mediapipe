import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import SignWords from "../components/SignWords";
import { Picto, Screen } from "../components/ui";
import { useShow } from "../context/show";
import { getSessions, getTranslations } from "../services/api";
import { joinHistoryItems, speechText } from "../utils/expressions";
import { canSpeak, speak } from "../utils/feedback";

// El servidor guarda la hora en UTC; con SQLite llega sin zona horaria y el
// navegador la leería como hora local (3 horas corrida en Chile).
function serverDate(iso) {
  return new Date(/(Z|[+-]\d\d:?\d\d)$/i.test(iso) ? iso : `${iso}Z`);
}

function formatDate(iso) {
  return serverDate(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds) {
  return seconds >= 60 ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : `${seconds} s`;
}

// Cada conversación con las señas que se dijeron, en orden y con la
// expresión de la cara que las acompañó. Las estadísticas están en Perfil.
function History() {
  const show = useShow();
  const [sessions, setSessions] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([getSessions(), getTranslations()])
      .then(([sessionList, translations]) => {
        const textsBySession = {};

        [...translations]
          .sort((a, b) => serverDate(a.created_at) - serverDate(b.created_at))
          .forEach((item) => {
            textsBySession[item.session_id] = [
              ...(textsBySession[item.session_id] || []),
              item.text,
            ];
          });

        setSessions(
          sessionList.map((session) => ({
            ...session,
            items: joinHistoryItems(textsBySession[session.id] || []).map((item) => ({
              ...item,
              text: item.text.replaceAll("_", " "),
            })),
          }))
        );
      })
      .catch((error) => {
        console.error(error);
        setSessions([]);
        setFailed(true);
      });
  }, []);

  const withWords = sessions?.filter((session) => session.items.length > 0) || [];

  return (
    <Screen>
      <h1 className="t-h1">Historial</h1>
      <p className="t-body t-muted">Solo guardamos el texto de tus traducciones, nunca videos ni audios.</p>

      {failed && (
        <p className="form-error" role="alert">
          No pudimos cargar el historial. Revisa tu conexión.
        </p>
      )}

      {sessions === null && (
        <div className="empty" aria-label="Cargando">
          <span className="a-dots">
            <span />
            <span />
            <span />
          </span>
        </div>
      )}

      {sessions !== null && !failed && withWords.length === 0 && (
        <div className="empty">
          <Picto name="clock" size={72} />
          <p className="t-body t-muted">Aún no hay traducciones. Cuando hagas una, aparecerá aquí.</p>
        </div>
      )}

      <div className="stack">
        {withWords.map((session) => (
          <article className="history-row" key={session.id}>
            <Picto name="hand" size={52} />
            <div>
              <SignWords items={session.items} animate={false} className="a-words--history a-c-blue" />
              <p className="t-caption t-muted">
                Señas · {formatDate(session.started_at)}
                {session.duration_seconds > 0 && ` · ${formatDuration(session.duration_seconds)}`}
              </p>
              <div className="bubble-actions">
                <button
                  type="button"
                  className="bubble-action"
                  onClick={() => show({ items: session.items })}
                >
                  <Icon name="phone" />
                  Mostrar
                </button>
                {canSpeak() && (
                  <button
                    type="button"
                    className="bubble-action"
                    onClick={() => speak(speechText(session.items))}
                  >
                    <Icon name="speaker" />
                    Escuchar
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </Screen>
  );
}

export default History;
