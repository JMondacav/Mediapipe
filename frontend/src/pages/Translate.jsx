import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CameraGuide from "../components/CameraGuide";
import ChatLog from "../components/ChatLog";
import HandCamera from "../components/HandCamera";
import Icon from "../components/Icon";
import Modal from "../components/Modal";
import PhraseBoard from "../components/PhraseBoard";
import RatingRow from "../components/RatingRow";
import SignWords from "../components/SignWords";
import StateBanner from "../components/StateBanner";
import { Button, Notice, Screen, Segmented } from "../components/ui";
import { useAuth } from "../context/auth";
import { useSettings } from "../context/settings";
import { useShow } from "../context/show";
import useRecordingTranslator from "../hooks/useRecordingTranslator";
import useSpeechInput from "../hooks/useSpeechInput";
import { speechText } from "../utils/expressions";
import { canSpeak, speak } from "../utils/feedback";
import { newId } from "../utils/ids";

// Señas -> texto: grabar primero, traducir después (useRecordingTranslator y
// HandCamera). Se hacen todas las señas de corrido y al terminar aparecen tal
// cual, en el orden en que salieron. La cara se lee siempre, para saber dónde
// se hace cada seña. Voz -> texto: la persona oyente habla y su voz
// aparece escrita, o elige una frase prehecha y se le muestra a la persona
// sorda el video de su seña. Todo va a la misma conversación en burbujas.

// Si la cara se vio en menos de esta parte de la grabación, se avisa.
const LOW_FACE_RATIO = 0.3;

const SIGN_COPY = {
  idle: {
    label: "Listo para traducir señas",
    hint: "Toca Empezar y haz tus señas de corrido, sin pausas.",
  },
  capturing: {
    label: "Cámara grabando",
    hint: "Haz tus señas. Toca Terminar o baja las manos 2 segundos.",
  },
  processing: { label: "Traduciendo…", hint: "Estamos convirtiendo tus señas en texto." },
  result: { label: "Traducción lista", hint: "Puedes mostrar el texto a la otra persona." },
  noSigns: {
    label: "No reconocimos señas",
    hint: "Inténtalo de nuevo, con buena luz y las manos dentro del cuadro.",
  },
  network: {
    label: "Algo salió mal",
    hint: "No pudimos conectar con el servidor. Revisa tu internet e inténtalo de nuevo.",
  },
};

const VOICE_COPY = {
  idle: { label: "Listo para escuchar", hint: "Toca el botón grande para activar el micrófono." },
  capturing: { label: "Micrófono activo", hint: "Habla con claridad. Toca Terminar cuando acabes." },
  processing: { label: "Escribiendo lo que dijiste…", hint: "Un momento, por favor." },
  result: { label: "Texto listo", hint: "La otra persona puede leerlo en la pantalla." },
};

const VOICE_ERRORS = {
  unsupported: "Este navegador no reconoce voz. Usa Chrome o Edge.",
  permission: "No tenemos permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones.",
  network: "El reconocimiento de voz necesita internet. Revisa tu conexión.",
  no_input: "No escuchamos nada. Inténtalo de nuevo, más cerca del micrófono.",
  unknown: "Ocurrió un problema inesperado. Inténtalo otra vez.",
};

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

// Segundos desde que se activó el micrófono.
function useElapsed(active) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);

    return () => {
      window.clearInterval(intervalId);
      setSeconds(0);
    };
  }, [active]);

  return seconds;
}

function Translate() {
  const [params] = useSearchParams();
  const { role } = useAuth();
  const { settings } = useSettings();
  const show = useShow();
  const translator = useRecordingTranslator();
  const { phase, result } = translator;

  const requested = params.get("modo");
  const [mode, setMode] = useState(
    requested === "voz" || (requested !== "senas" && role === "hearing") ? "voice" : "sign"
  );
  // De lo más reciente a lo más antiguo.
  const [messages, setMessages] = useState([]);
  const [voiceMessageId, setVoiceMessageId] = useState(null);
  const [thanks, setThanks] = useState(false);

  const items = result?.items || [];
  const recording = phase === "recording";
  const analyzing = phase === "analyzing";
  const showingResult = phase === "result" && items.length > 0;

  const addMessage = useCallback((message) => {
    setMessages((current) => [
      { id: newId(), createdAt: new Date().toISOString(), ...message },
      ...current,
    ]);
  }, []);

  // La traducción que está en pantalla pasa a la conversación cuando se sigue
  // conversando (señar otra vez, la otra persona responde, cambiar de modo).
  const moveResultToChat = () => {
    if (showingResult) {
      addMessage({ source: "sign", items });
      translator.discard();
    }
  };

  const voice = useSpeechInput((text) => {
    moveResultToChat();
    const id = newId();
    setVoiceMessageId(id);
    addMessage({ id, source: "voice", text });
  });
  const listening = voice.status === "capturing";
  const voiceBusy = listening || voice.status === "processing";
  const elapsed = useElapsed(listening);

  // "Leer en voz alta mis señas" (Perfil): solo al llegar una traducción nueva.
  const lastPhaseRef = useRef(phase);
  useEffect(() => {
    const arrived = phase === "result" && lastPhaseRef.current !== "result";
    lastPhaseRef.current = phase;

    if (arrived && settings.autoSpeak && result?.items.length) {
      speak(speechText(result.items));
    }
  }, [phase, result, settings.autoSpeak]);

  const startSigning = () => {
    if (showingResult) {
      addMessage({ source: "sign", items });
    }

    setThanks(false);
    translator.start();
  };

  const changeMode = (next) => {
    moveResultToChat();

    if (!voiceBusy) {
      voice.reset();
    }

    setMode(next);
  };

  const rate = (rating) => {
    if (showingResult) {
      addMessage({ source: "sign", items });
    }

    translator.sendFeedback(rating);
    setThanks(true);
  };

  // Frase prehecha: se muestra el video de su seña y queda en la conversación.
  const sayPhrase = (phrase) => {
    const message = { text: phrase.text, icon: phrase.icon, video: phrase.id };
    addMessage({ source: "phrase", ...message });
    show(message);
  };

  const showMessage = (message) => {
    if (message.source === "sign") {
      show({ items: message.items });
    } else if (message.source === "phrase") {
      show({ text: message.text, icon: message.icon, video: message.video });
    } else {
      show({ text: message.text, icon: "mic" });
    }
  };
  const speakMessage = (message) =>
    speak(message.source === "sign" ? speechText(message.items) : message.text);

  // Estado del panel de señas.
  let signStatus = "idle";
  let signCopy = SIGN_COPY.idle;

  if (translator.problem) {
    signStatus = "error";
    signCopy = SIGN_COPY.network;
  } else if (recording) {
    signStatus = "capturing";
    signCopy = SIGN_COPY.capturing;
  } else if (analyzing) {
    signStatus = "processing";
    signCopy = SIGN_COPY.processing;
  } else if (phase === "result") {
    signStatus = items.length ? "result" : "error";
    signCopy = items.length ? SIGN_COPY.result : SIGN_COPY.noSigns;
  }

  const cameraPhase = translator.problem
    ? "error"
    : recording
      ? "recording"
      : analyzing
        ? "analyzing"
        : translator.handVisible
          ? "hand"
          : "nohand";

  const faceHardlySeen = typeof result?.faceRatio === "number" && result.faceRatio < LOW_FACE_RATIO;

  // Estado del panel de voz.
  const voiceStatus = voice.status;
  const voiceCopy =
    voice.status === "error"
      ? { label: "Algo salió mal", hint: VOICE_ERRORS[voice.error] || VOICE_ERRORS.unknown }
      : VOICE_COPY[voice.status];

  // Mientras se ve el resultado de voz en grande, su burbuja no se repite abajo.
  const logged =
    mode === "voice" && voice.status === "result"
      ? messages.filter((message) => message.id !== voiceMessageId)
      : messages;

  const busy = recording || analyzing || voiceBusy;

  return (
    <Screen>
      <h1 className="t-h1">Traducir</h1>
      <Segmented
        label="Tipo de traducción"
        value={mode}
        onChange={changeMode}
        disabled={busy}
        options={[
          { value: "sign", label: "Señas → texto" },
          { value: "voice", label: "Voz → texto" },
        ]}
      />

      {mode === "sign" ? (
        <>
          <StateBanner status={signStatus} label={signCopy.label} hint={signCopy.hint} />

          <section
            className="a-camera"
            data-phase={cameraPhase}
            hidden={showingResult}
            aria-label="Vista de la cámara frontal"
          >
            <HandCamera
              isRunning={!analyzing && !showingResult}
              numHands={2}
              withFace
              showLandmarks={false}
              onFrame={translator.handleFrame}
              showStatus={false}
            />

            {phase === "idle" && !translator.handVisible && <CameraGuide />}

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
                    aria-label={translator.handVisible ? "Mano detectada" : "No se ve la mano"}
                  >
                    <Icon name={translator.handVisible ? "hand" : "hand-off"} />
                  </span>
                  <span
                    className="a-camera-badge"
                    data-tone={translator.faceVisible ? "green" : ""}
                    aria-label={translator.faceVisible ? "Cara detectada" : "No se ve la cara"}
                  >
                    <Icon name={translator.faceVisible ? "face" : "face-off"} />
                  </span>
                </div>
              )
            )}

            {analyzing && (
              <div className="a-analyzing" aria-label="Analizando">
                <Dots />
              </div>
            )}
          </section>

          {recording && (
            <div className="stack">
              <Button
                label="Terminar y traducir"
                icon="check-circle"
                size="lg"
                onClick={translator.stop}
              />
              <Button label="Cancelar" variant="secondary" onClick={translator.discard} />
            </div>
          )}

          {analyzing && <Button label="Traduciendo…" size="lg" loading />}

          {showingResult && (
            <div className="stack">
              <section className="result-card fade-in" aria-label="Señas reconocidas">
                <SignWords items={items} />
                {faceHardlySeen && (
                  <p className="a-tip">
                    Casi no se vio tu cara. Para saber dónde haces cada seña (frente, boca, mentón),
                    mantenla dentro del cuadro.
                  </p>
                )}
              </section>
              <Button
                label="Mostrar a la otra persona"
                icon="phone"
                size="lg"
                hint="Abre el texto en pantalla completa"
                onClick={() => show({ items })}
              />
              {canSpeak() && (
                <Button
                  label="Escuchar en voz alta"
                  icon="speaker"
                  variant="secondary"
                  onClick={() => speak(speechText(items))}
                />
              )}
              <Button label="Señar otra vez" icon="refresh" variant="secondary" onClick={startSigning} />
              <div className="btn-row">
                <Button
                  label="Borrar la última"
                  icon="backspace"
                  variant="secondary"
                  size="sm"
                  onClick={translator.deleteLastWord}
                />
                <Button
                  label="Descartar"
                  icon="trash"
                  variant="secondary"
                  size="sm"
                  onClick={translator.discard}
                />
              </div>
            </div>
          )}

          {!busy && !showingResult && (
            <Button
              label={signStatus === "error" ? "Intentar de nuevo" : "Empezar a señar"}
              icon={signStatus === "error" ? "refresh" : "record"}
              size="hero"
              onClick={startSigning}
            />
          )}

          {!recording && !analyzing && voice.supported && (
            <div className="stack">
              {voiceBusy ? (
                <>
                  <div className="mic-stage is-listening" aria-live="polite">
                    <Icon name="mic" />
                    <p className="t-h3">● Escuchando {formatSeconds(elapsed)}</p>
                    {voice.text && <p className="live-text">{voice.text}</p>}
                  </div>
                  <Button
                    label="Listo"
                    icon="check-circle"
                    variant="accent"
                    loading={voice.status === "processing"}
                    onClick={voice.stop}
                  />
                  <Button label="Cancelar" variant="secondary" size="sm" onClick={voice.cancel} />
                </>
              ) : (
                <Button
                  label="Oír a la otra persona"
                  icon="mic"
                  variant="accent"
                  hint="Su voz aparece escrita en la conversación"
                  onClick={voice.start}
                />
              )}
            </div>
          )}

          <Notice icon="face">
            La cámara lee tus manos y los puntos de tu cara, para saber dónde haces cada seña. Solo
            se envían números, nunca tu imagen.
          </Notice>
        </>
      ) : (
        <>
          <StateBanner status={voiceStatus} label={voiceCopy.label} hint={voiceCopy.hint} />

          {!voice.supported && <Notice icon="alert-circle">{VOICE_ERRORS.unsupported}</Notice>}

          {voice.status !== "result" && (
            <div className={`mic-stage ${listening ? "is-listening" : ""}`} aria-live="polite">
              <Icon name={listening ? "mic" : "mic-off"} />
              <p className="t-h2">{listening ? `● Grabando ${formatSeconds(elapsed)}` : "Micrófono apagado"}</p>
              {voice.text && <p className="live-text">{voice.text}</p>}
            </div>
          )}

          {(voice.status === "idle" || voice.status === "error") && (
            <Button
              label={voice.status === "error" ? "Intentar de nuevo" : "Empezar a hablar"}
              icon={voice.status === "error" ? "refresh" : "mic"}
              size="hero"
              variant="accent"
              disabled={!voice.supported}
              onClick={voice.start}
            />
          )}

          {listening && (
            <div className="stack">
              <Button label="Terminar y escribir" icon="check-circle" size="lg" onClick={voice.stop} />
              <Button label="Cancelar" variant="secondary" onClick={voice.cancel} />
            </div>
          )}

          {voice.status === "processing" && <Button label="Escribiendo…" size="lg" loading />}

          {voice.status === "result" && (
            <div className="stack">
              <section className="result-card fade-in" aria-label="Lo que dijo">
                <p className="t-h1 t-center">{voice.text}</p>
              </section>
              <Button
                label="Mostrar a la otra persona"
                icon="phone"
                size="lg"
                hint="Abre el texto en pantalla completa"
                onClick={() => show({ text: voice.text, icon: "mic" })}
              />
              {canSpeak() && (
                <Button
                  label="Escuchar en voz alta"
                  icon="speaker"
                  variant="secondary"
                  onClick={() => speak(voice.text)}
                />
              )}
              <Button label="Hablar otra vez" icon="refresh" variant="secondary" onClick={voice.start} />
            </div>
          )}

          {!voiceBusy && <PhraseBoard onPick={sayPhrase} />}
        </>
      )}

      {thanks && (
        <p className="t-body t-center t-muted" role="status">
          ¡Gracias por tu opinión! 🙂
        </p>
      )}

      {translator.hasSession && !busy && (
        <Button
          label="Terminar conversación"
          icon="check"
          variant="secondary"
          hint="Cierra la conversación y la valoras con una carita"
          onClick={translator.finish}
        />
      )}

      <ChatLog
        messages={logged}
        onShow={showMessage}
        onSpeak={speakMessage}
        onClear={() => setMessages([])}
      />

      {translator.feedbackOpen && (
        <Modal onClose={translator.cancelFinish} label="¿Te sirvió esta conversación?">
          <p className="dialog-title">¿Te sirvió esta conversación?</p>
          <RatingRow onRate={rate} />
        </Modal>
      )}
    </Screen>
  );
}

export default Translate;
