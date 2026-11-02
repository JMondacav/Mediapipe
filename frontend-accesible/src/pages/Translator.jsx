import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HandCamera from "../components/HandCamera";
import HelpButton from "../components/HelpButton";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import SignMedia from "../components/SignMedia";
import SignWords from "../components/SignWords";
import useRecordingTranslator from "../hooks/useRecordingTranslator";
import { speechText } from "../utils/expressions";
import { canSpeak, getSpeechRecognition, speak, videoIdForWord } from "../utils/feedback";

// Grabar primero, traducir después: ⏺ -> señas de corrido (con la cara) -> ■
// (o bajar las manos 2 s) -> la app analiza todo y muestra las señas, con la
// expresión de la cara que acompañó a cada una.
const HELP_STEPS = [
  { icon: "record", color: "red" },
  { icon: "hand", color: "blue" },
  { icon: "face", color: "amber" },
  { icon: "stop", color: "red" },
  { icon: "speaker", color: "blue" },
];

const RATINGS = ["😞", "😕", "😐", "🙂", "😍"];

function formatSeconds(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Dots() {
  return (
    <span className="a-dots">
      <span />
      <span />
      <span />
    </span>
  );
}

function Translator() {
  const navigate = useNavigate();
  const translator = useRecordingTranslator();
  const { phase, result } = translator;

  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const recognizerRef = useRef(null);
  const SpeechRecognition = getSpeechRecognition();

  useEffect(() => () => recognizerRef.current?.abort(), []);

  // La persona oyente responde hablando: su voz se muestra como texto y, si
  // existe el video de la seña de alguna palabra, también como seña.
  const toggleListening = () => {
    if (listening) {
      recognizerRef.current?.stop();
      return;
    }

    const recognizer = new SpeechRecognition();
    recognizer.lang = "es-CL";
    recognizer.interimResults = true;
    recognizer.onresult = (event) => {
      setHeard(
        Array.from(event.results)
          .map((item) => item[0].transcript)
          .join(" ")
      );
    };
    recognizer.onend = () => setListening(false);
    recognizer.onerror = () => setListening(false);

    recognizerRef.current = recognizer;
    setHeard("");
    setListening(true);
    recognizer.start();
  };

  const recording = phase === "recording";
  const analyzing = phase === "analyzing";
  // Las señas tal cual salieron, en orden: nada se interpreta ni se reformula.
  const items = result?.items || [];
  const heardWords = heard.split(/\s+/).filter(Boolean);
  const faceTone = !translator.faceEnabled ? "" : translator.faceVisible ? "green" : "blue";

  const cameraPhase = translator.problem
    ? "error"
    : recording
      ? "recording"
      : analyzing
        ? "analyzing"
        : translator.handVisible
          ? "hand"
          : "nohand";

  return (
    <main className="a-screen">
      <header className="a-topbar">
        <button
          className="a-icon-btn"
          onClick={() => navigate("/menu")}
          disabled={recording || analyzing}
          aria-label="Volver al menú"
        >
          <Icon name="back" />
        </button>

        <span className="a-screen-icon a-c-blue">
          <Icon name="camera" />
        </span>

        <HelpButton videoId="ayuda-traductor" steps={HELP_STEPS} />
      </header>

      {heard && (
        <section className="a-heard" aria-live="polite">
          <div className="a-heard-head">
            <Icon name="message" />
            <button
              className="a-icon-btn a-icon-btn--sm"
              onClick={() => setHeard("")}
              aria-label="Cerrar respuesta"
            >
              <Icon name="close" />
            </button>
          </div>

          <p className="a-heard-text">{heard}</p>

          <div className="a-chips">
            {heardWords.map((word, index) => (
              <div className="a-word" key={`${word}-${index}`}>
                <SignMedia videoId={videoIdForWord(word)} className="a-media--word" />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="a-camera" data-phase={cameraPhase}>
        <HandCamera
          isRunning={!analyzing}
          numHands={2}
          withFace={translator.faceEnabled}
          onFrame={translator.handleFrame}
          showStatus={false}
        />

        {recording ? (
          <span className="a-rec-badge" aria-label="Grabando">
            <Icon name="record" />
            {formatSeconds(translator.seconds)}
          </span>
        ) : (
          !analyzing && (
            <div className="a-camera-badges">
              <span
                className="a-camera-badge"
                data-tone={translator.handVisible ? "green" : ""}
                aria-hidden="true"
              >
                <Icon name={translator.handVisible ? "hand" : "hand-off"} />
              </span>
              {/* Tocar la cara activa o apaga la lectura de expresiones. */}
              <button
                className="a-camera-badge"
                data-tone={faceTone}
                onClick={translator.toggleFace}
                aria-pressed={translator.faceEnabled}
                aria-label="Leer expresiones de la cara"
              >
                <Icon name={translator.faceEnabled ? "face" : "face-off"} />
              </button>
            </div>
          )
        )}

        {analyzing && (
          <div className="a-analyzing" aria-label="Analizando">
            <Dots />
          </div>
        )}

        {phase === "idle" && (
          <div className="a-camera-cover">
            <button
              className={`a-icon-btn a-icon-btn--lg a-icon-btn--solid ${translator.problem ? "a-c-amber" : "a-c-red"}`}
              onClick={translator.start}
              aria-label="Grabar"
            >
              <Icon name={translator.problem ? "alert" : "record"} />
            </button>
          </div>
        )}
      </section>

      <section className="a-card" aria-live="polite">
        {phase === "result" && items.length > 0 ? (
          <>
            <SignWords items={items} showNames={false} />

            <div className="a-row">
              {canSpeak() && (
                <button
                  className="a-icon-btn a-icon-btn--solid a-c-blue"
                  onClick={() => speak(speechText(items))}
                  aria-label="Leer en voz alta"
                >
                  <Icon name="speaker" />
                </button>
              )}
              <button
                className="a-icon-btn a-icon-btn--soft a-c-gray"
                onClick={translator.deleteLastWord}
                aria-label="Borrar última palabra"
              >
                <Icon name="backspace" />
              </button>
              <button
                className="a-icon-btn a-icon-btn--soft a-c-red"
                onClick={translator.discard}
                aria-label="Descartar"
              >
                <Icon name="trash" />
              </button>
            </div>
          </>
        ) : phase === "result" ? (
          // Se grabó, pero no se reconoció ninguna seña.
          <div className="a-placeholder a-placeholder--warning" aria-label="No se reconoció ninguna seña">
            <Icon name="hand-off" />
            <Icon name="repeat" />
          </div>
        ) : (
          <div className="a-placeholder" aria-label={analyzing ? "Analizando" : "Sin palabras todavía"}>
            <Icon name="hand" />
            <Dots />
          </div>
        )}
      </section>

      <section className="a-controls">
        {SpeechRecognition ? (
          <button
            className={`a-icon-btn a-icon-btn--solid a-c-amber ${listening ? "a-listening" : ""}`}
            onClick={toggleListening}
            disabled={recording}
            aria-label={listening ? "Dejar de escuchar" : "Escuchar a la persona oyente"}
          >
            <Icon name="mic" />
          </button>
        ) : (
          <span />
        )}

        <button
          className={`a-icon-btn a-icon-btn--lg a-icon-btn--solid a-c-red ${recording ? "a-recording-btn" : ""}`}
          onClick={recording ? translator.stop : translator.start}
          disabled={analyzing}
          aria-label={recording ? "Terminar y traducir" : "Grabar"}
        >
          <Icon name={recording ? "stop" : "record"} />
        </button>

        <button
          className="a-icon-btn a-icon-btn--solid a-c-purple"
          onClick={translator.finish}
          disabled={!translator.hasSession || recording || analyzing}
          aria-label="Terminar conversación"
        >
          <Icon name="check" />
        </button>
      </section>

      {translator.feedbackOpen && (
        <Modal onClose={translator.cancelFinish} label="¿Cómo te fue?">
          <div className="a-emoji-row">
            {RATINGS.map((emoji, index) => (
              <button
                key={emoji}
                className="a-emoji"
                onClick={() => translator.sendFeedback(index + 1)}
                aria-label={`${index + 1} de 5`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </main>
  );
}

export default Translator;
