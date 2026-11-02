import Icon from "./Icon";
import SignWords from "./SignWords";
import { Button } from "./ui";
import { canSpeak } from "../utils/feedback";

function time(iso) {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

const SOURCES = {
  sign: { icon: "hand", label: "Señas" },
  voice: { icon: "mic", label: "Voz" },
  phrase: { icon: "message-dots", label: "Frase en señas" },
};

// Burbuja: señas a la derecha (turquesa); voz y frases de la persona oyente a
// la izquierda (ámbar). Las señas se muestran tal cual salieron, con su
// expresión de la cara.
function Bubble({ message, onShow, onSpeak }) {
  const sign = message.source === "sign";
  const source = SOURCES[message.source] || SOURCES.voice;

  return (
    <div className={`bubble-wrap ${sign ? "bubble-wrap--sign" : ""}`}>
      <div className={`bubble ${sign ? "bubble--sign" : "bubble--voice"}`}>
        <span className="bubble-meta">
          <Icon name={source.icon} />
          {source.label} · {time(message.createdAt)}
        </span>

        {sign ? (
          <SignWords items={message.items} animate={false} className="a-c-blue" />
        ) : (
          <p className="bubble-text">{message.text}</p>
        )}

        <span className="bubble-actions">
          <button type="button" className="bubble-action" onClick={() => onShow(message)}>
            <Icon name="phone" />
            Mostrar
          </button>
          {canSpeak() && (
            <button type="button" className="bubble-action" onClick={() => onSpeak(message)}>
              <Icon name="speaker" />
              Escuchar
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

// Conversación de esta visita, de lo más nuevo a lo más antiguo. El historial
// guarda las señas aparte, en el servidor.
function ChatLog({ messages, onShow, onSpeak, onClear }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <section className="stack" aria-label="Conversación">
      <h2 className="t-h2">Conversación</h2>
      {messages.map((message) => (
        <Bubble key={message.id} message={message} onShow={onShow} onSpeak={onSpeak} />
      ))}
      <Button label="Limpiar conversación" variant="ghost" size="sm" icon="close-circle" onClick={onClear} />
    </section>
  );
}

export default ChatLog;
