import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import FaceCheck from "../components/FaceCheck";
import HandCamera from "../components/HandCamera";
import Icon from "../components/Icon";
import {
  deleteDynamicSample,
  getDynamicStatus,
  saveDynamicSample,
} from "../services/api";
import {
  DEFAULT_WINDOW_MS,
  NOTHING_LABEL,
  faceRatio,
  handsRatio,
  toSequenceFrame,
} from "../utils/dynamicSigns";
import { NEUTRAL_LABEL, SUGGESTED_EXPRESSIONS, expressionInfo } from "../utils/expressions";

// Se graba un poco más que la ventana para que quede cubierta completa.
const RECORD_MARGIN_MS = 150;
const MIN_HANDS_RATIO = 0.6;
const MIN_FACE_RATIO = 0.6;
const MIN_FRAMES = 8;
const RECOMMENDED_SAMPLES = 30;
const REPETITION_OPTIONS = [1, 5, 10, 20, 40];

// Qué se graba en cada pestaña.
const KINDS = {
  sign: {
    tab: "Señas",
    icon: "hand",
    required: NOTHING_LABEL,
    placeholder: "Ej: HOLA, GRACIAS o NADA",
    hint:
      "Haz la seña una vez, a la velocidad con que conversas. No hace falta llenar " +
      "la barra; si terminas antes, deja la mano quieta. Que se vea tu cara: así el " +
      "modelo aprende si la seña se hace en la frente, la boca o el pecho.",
    tip:
      `${NOTHING_LABEL} es obligatoria: graba movimientos que no sean señas ` +
      "(deletrear, saludar con el dorso, rascarte, mover las manos al azar).",
  },
  expression: {
    tab: "Expresiones",
    icon: "face",
    required: NEUTRAL_LABEL,
    placeholder: "Ej: PREGUNTA, NEGACION o NEUTRAL",
    hint:
      "Mantén la expresión mientras se llena la barra, mirando a la cámara. Puedes " +
      "hacer señas al mismo tiempo: así se usa al conversar.",
    tip:
      `${NEUTRAL_LABEL} es obligatoria: graba tu cara normal mientras haces distintas ` +
      "señas, hablas o miras a los lados, para que no se marquen expresiones que no hiciste.",
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function modelSummary(model, emptyText) {
  if (!model) {
    return "Consultando...";
  }

  if (!model.ready) {
    return model.detail || emptyText;
  }

  return `Entrenado con: ${model.classes.map((item) => item.replaceAll("_", " ")).join(", ")}`;
}

function DynamicRecorder() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [kind, setKind] = useState("sign");
  const [label, setLabel] = useState("");
  const [repetitions, setRepetitions] = useState(5);
  const [phase, setPhase] = useState("idle"); // idle | countdown | recording | saving
  const [countdown, setCountdown] = useState(0);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [lastSaved, setLastSaved] = useState(null);
  const [handVisible, setHandVisible] = useState(false);
  const [faceVisible, setFaceVisible] = useState(false);
  const [faceMesh, setFaceMesh] = useState(false);
  const [cameraStats, setCameraStats] = useState(null);

  const faceRef = useRef(null);
  const recordingRef = useRef(false);
  const framesRef = useRef([]);
  const aspectRatioRef = useRef(4 / 3);
  const cancelRef = useRef(false);
  const handVisibleRef = useRef(false);
  const faceVisibleRef = useRef(false);

  const config = KINDS[kind];
  const windowMs = status?.window_ms ?? DEFAULT_WINDOW_MS;
  const seconds = (windowMs / 1000).toLocaleString("es-CL", { maximumFractionDigits: 1 });
  const samples = (kind === "sign" ? status?.samples : status?.expressions?.samples) ?? {};
  const isBusy = phase !== "idle";
  const chosenLabel = label.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const chosenExpression = kind === "expression" ? expressionInfo(chosenLabel) : null;

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getDynamicStatus());
    } catch (error) {
      console.error(error);
      setMessage(error.message);
    }
  }, []);

  useEffect(() => {
    getDynamicStatus()
      .then(setStatus)
      .catch((error) => {
        console.error(error);
        setMessage(error.message);
      });

    return () => {
      cancelRef.current = true;
      recordingRef.current = false;
    };
  }, []);

  const handleFrame = useCallback((frame) => {
    const hands = frame.hands.length > 0;
    const face = Boolean(frame.face);
    faceRef.current = frame.face ? { face: frame.face, aspectRatio: frame.aspectRatio } : null;

    if (hands !== handVisibleRef.current) {
      handVisibleRef.current = hands;
      setHandVisible(hands);
    }

    if (face !== faceVisibleRef.current) {
      faceVisibleRef.current = face;
      setFaceVisible(face);
    }

    if (!recordingRef.current) {
      return;
    }

    framesRef.current.push(toSequenceFrame(frame));
    aspectRatioRef.current = frame.aspectRatio || aspectRatioRef.current;
  }, []);

  const changeKind = (next) => {
    if (next !== kind) {
      setKind(next);
      setLabel("");
      setMessage("");
    }
  };

  const recordOnce = async () => {
    framesRef.current = [];
    recordingRef.current = true;
    setPhase("recording");

    const duration = windowMs + RECORD_MARGIN_MS;
    const startedAt = performance.now();

    while (!cancelRef.current && performance.now() - startedAt < duration) {
      setProgress(Math.min(1, (performance.now() - startedAt) / duration));
      await sleep(50);
    }

    recordingRef.current = false;
    return framesRef.current;
  };

  const startRecording = async () => {
    if (!chosenLabel) {
      setMessage(
        kind === "sign"
          ? "Escribe el nombre de la seña que vas a grabar"
          : "Escribe o elige la expresión que vas a grabar"
      );
      return;
    }

    cancelRef.current = false;
    let saved = 0;

    for (let round = 0; round < repetitions && !cancelRef.current; round += 1) {
      setPhase("countdown");

      for (let n = round === 0 ? 3 : 2; n > 0 && !cancelRef.current; n -= 1) {
        setCountdown(n);
        await sleep(1000);
      }

      if (cancelRef.current) {
        break;
      }

      const frames = await recordOnce();

      if (cancelRef.current) {
        break;
      }

      if (frames.length < MIN_FRAMES) {
        setMessage("La cámara va muy lenta. Prueba con más luz o cierra otras pestañas.");
        continue;
      }

      if (kind === "sign" && chosenLabel !== NOTHING_LABEL && handsRatio(frames) < MIN_HANDS_RATIO) {
        setMessage(`Muestra ${round + 1} descartada: no se vio bien la mano`);
        continue;
      }

      if (kind === "expression" && faceRatio(frames) < MIN_FACE_RATIO) {
        setMessage(`Muestra ${round + 1} descartada: no se vio bien tu cara`);
        continue;
      }

      setPhase("saving");

      try {
        const result = await saveDynamicSample(chosenLabel, frames, aspectRatioRef.current, kind);
        saved += 1;
        setLastSaved(result);
        setStatus((prev) => {
          if (!prev) {
            return prev;
          }

          if (kind === "sign") {
            return { ...prev, samples: { ...prev.samples, [result.label]: result.count } };
          }

          const expressions = prev.expressions ?? { samples: {} };
          return {
            ...prev,
            expressions: {
              ...expressions,
              samples: { ...expressions.samples, [result.label]: result.count },
            },
          };
        });
        setMessage(`Guardada ${saved}/${repetitions} de ${result.label.replaceAll("_", " ")}`);
      } catch (error) {
        console.error(error);
        setMessage(error.message);
        break;
      }
    }

    recordingRef.current = false;
    setPhase("idle");
    setCountdown(0);
    setProgress(0);
  };

  const cancelRecording = () => {
    cancelRef.current = true;
    setMessage("Grabación cancelada");
  };

  const undoLastSample = async () => {
    if (!lastSaved) {
      return;
    }

    try {
      await deleteDynamicSample(lastSaved.label, lastSaved.file, lastSaved.kind);
      setMessage(`Se borró la última muestra de ${lastSaved.label.replaceAll("_", " ")}`);
      setLastSaved(null);
      await refreshStatus();
    } catch (error) {
      console.error(error);
      setMessage(error.message);
    }
  };

  const recorded = Object.keys(samples);
  const suggested = kind === "sign" ? [config.required] : SUGGESTED_EXPRESSIONS;
  const chipLabels = [...suggested, ...recorded.filter((item) => !suggested.includes(item))];

  return (
    <main className="a-screen">
      <header className="a-topbar">
        <button className="a-icon-btn" onClick={() => navigate("/menu")} aria-label="Volver al menú">
          <Icon name="back" />
        </button>
        <span className="a-screen-icon a-c-gray">
          <Icon name="video" />
        </span>
        <span style={{ width: 64 }} />
      </header>

      {/* Herramienta del equipo para grabar ejemplos: aquí sí hay texto. */}
      <p className="a-section-title">
        Grabar ejemplos para entrenar ({seconds} s cada uno)
      </p>

      <div className="a-segmented a-c-blue" role="tablist" aria-label="Qué grabar">
        {Object.entries(KINDS).map(([key, item]) => (
          <button
            key={key}
            role="tab"
            aria-selected={kind === key}
            onClick={() => changeKind(key)}
            disabled={isBusy}
          >
            <Icon name={item.icon} />
            {item.tab}
          </button>
        ))}
      </div>

      <p className="a-hint">{config.hint}</p>

      <section className="a-camera" data-phase={phase === "recording" ? "recording" : "nohand"}>
        <HandCamera
          isRunning
          numHands={2}
          withFace
          faceMesh={faceMesh}
          onFrame={handleFrame}
          onStats={setCameraStats}
          showStatus={false}
        />

        {phase === "idle" && (
          <div className="a-camera-badges">
            <span
              className="a-camera-badge"
              data-tone={handVisible ? "green" : ""}
              aria-label={handVisible ? "Mano detectada" : "No se ve la mano"}
            >
              <Icon name={handVisible ? "hand" : "hand-off"} />
            </span>
            <span
              className="a-camera-badge"
              data-tone={faceVisible ? "green" : ""}
              aria-label={faceVisible ? "Cara detectada" : "No se ve la cara"}
            >
              <Icon name={faceVisible ? "face" : "face-off"} />
            </span>
          </div>
        )}

        {phase === "countdown" && (
          <div className="a-countdown">
            <strong>{countdown}</strong>
            Prepárate
          </div>
        )}

        {phase === "recording" && (
          <>
            <span className="a-rec-badge">
              <Icon name="record" />
              {kind === "sign" ? "Haz la seña" : "Haz la expresión"}
            </span>
            <div className="a-progress">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        )}
      </section>

      <FaceCheck
        faceRef={faceRef}
        stats={cameraStats}
        mesh={faceMesh}
        onToggleMesh={() => setFaceMesh((current) => !current)}
      />

      <section className="a-card">
        <label className="a-field">
          {kind === "sign" ? "Seña" : "Expresión"}
          <input
            className="a-input"
            value={label}
            maxLength={30}
            placeholder={config.placeholder}
            onChange={(event) => setLabel(event.target.value)}
            disabled={isBusy}
          />
        </label>

        {chosenExpression && (
          <p className="a-expr-howto">
            <span className="a-expr-emoji" aria-hidden="true">
              {chosenExpression.emoji}
            </span>
            <span>
              <strong>{chosenExpression.name}.</strong> {chosenExpression.hint}
            </span>
          </p>
        )}

        <label className="a-field">
          Repeticiones seguidas
          <select
            className="a-input"
            value={repetitions}
            onChange={(event) => setRepetitions(Number(event.target.value))}
            disabled={isBusy}
          >
            {REPETITION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="a-btn-row">
          {isBusy ? (
            <button className="a-btn a-btn--solid a-c-red" onClick={cancelRecording}>
              <Icon name="stop" />
              Cancelar
            </button>
          ) : (
            <button className="a-btn a-btn--solid a-c-red" onClick={startRecording}>
              <Icon name="record" />
              Grabar
            </button>
          )}

          <button
            className="a-btn a-btn--soft a-c-gray"
            onClick={undoLastSample}
            disabled={!lastSaved || isBusy}
          >
            <Icon name="backspace" />
            Borrar última
          </button>
        </div>

        {message && <p className="a-message">{message}</p>}
      </section>

      <section className="a-card">
        <p className="a-section-title" style={{ margin: 0 }}>
          Muestras guardadas
        </p>
        <p className="a-hint">
          Toca {kind === "sign" ? "una seña" : "una expresión"} para seguir grabándola. Se
          recomiendan al menos {RECOMMENDED_SAMPLES} de cada una, de distintas personas.
        </p>

        <div className="a-chips">
          {chipLabels.map((item) => {
            const count = samples[item] ?? 0;
            const info = kind === "expression" ? expressionInfo(item) : null;

            return (
              <button
                key={item}
                className={`a-sample-chip ${count >= RECOMMENDED_SAMPLES ? "is-done" : ""} ${
                  item === chosenLabel ? "is-selected" : ""
                }`}
                aria-pressed={item === chosenLabel}
                onClick={() => setLabel(item)}
                disabled={isBusy}
              >
                {info ? `${info.emoji} ` : ""}
                {item.replaceAll("_", " ")} · {count}
              </button>
            );
          })}
        </div>

        <p className="a-tip">{config.tip}</p>
      </section>

      <section className="a-card">
        <p className="a-section-title" style={{ margin: 0 }}>
          Modelos
        </p>
        <p className="a-hint">
          <strong>Señas.</strong>{" "}
          {modelSummary(status?.model, "Aún no hay un modelo de señas entrenado")}
          {status?.model?.ready &&
            (status.model.face_location
              ? ". Usa la cara para ubicar cada seña."
              : ". Todavía no usa la cara: graba las señas con tu cara visible y vuelve a entrenar.")}
        </p>
        <p className="a-hint">
          <strong>Expresiones.</strong>{" "}
          {modelSummary(
            status?.expressions?.model,
            "Aún no hay un modelo de expresiones entrenado"
          )}
        </p>
        <p className="a-hint">Para entrenar los dos con las muestras nuevas:</p>
        <code className="a-code">docker compose --profile train run --rm trainer</code>
      </section>

    </main>
  );
}

export default DynamicRecorder;
