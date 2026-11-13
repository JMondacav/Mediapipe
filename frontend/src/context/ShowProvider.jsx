import { useCallback, useEffect, useRef, useState } from "react";
import SignVideo from "../components/SignVideo";
import SignWords from "../components/SignWords";
import { Button, Picto, SpeechBanner } from "../components/ui";
import { speechText } from "../utils/expressions";
import { canSpeak, speak } from "../utils/feedback";
import { ShowContext } from "./show";

// Mensaje en pantalla completa para la otra persona, con texto muy grande.
// Se abre encima de la página (no es otra ruta), así la traducción en curso y
// la cámara siguen igual al cerrarlo. Las señas se muestran tal cual, con su
// expresión de la cara; una frase prehecha (video) muestra el video de su seña.
function ShowOverlay({ message, onClose }) {
  const closeRef = useRef(null);
  const { text = "", icon = "", items = null, video = "" } = message;
  const spoken = items ? speechText(items) : text;

  useEffect(() => {
    // Al cerrar, el foco vuelve al botón que abrió el mensaje.
    const opener = document.activeElement;
    closeRef.current?.querySelector("button")?.focus();

    const onKey = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="show" role="dialog" aria-modal="true" aria-label="Mensaje para la otra persona">
      <div className="show-content" aria-live="polite">
        {video ? (
          <SignVideo key={video} id={video} icon={icon} />
        ) : (
          icon && <Picto name={icon} size={140} />
        )}
        {items?.length ? (
          <SignWords items={items} animate={false} className="a-c-blue" />
        ) : (
          <p className={`show-text ${video ? "show-text--sub" : ""}`}>{text || "Sin mensaje"}</p>
        )}
      </div>

      <div className="show-footer">
        {canSpeak() && spoken && (
          <Button
            label="Escuchar en voz alta"
            icon="speaker"
            variant="secondary"
            size="lg"
            onClick={() => speak(spoken)}
          />
        )}
        <div ref={closeRef}>
          <Button label="Cerrar" icon="close-circle" size="lg" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}

function ShowProvider({ children }) {
  const [message, setMessage] = useState(null);
  const close = useCallback(() => setMessage(null), []);

  return (
    <ShowContext.Provider value={setMessage}>
      {children}
      {message && <ShowOverlay message={message} onClose={close} />}
      <SpeechBanner />
    </ShowContext.Provider>
  );
}

export default ShowProvider;
