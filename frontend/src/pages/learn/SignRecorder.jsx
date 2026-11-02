import { useCallback, useEffect, useRef, useState } from "react";
import FaceCheck from "../../components/FaceCheck";
import HandCamera from "../../components/HandCamera";
import Icon from "../../components/Icon";
import { Button, Notice } from "../../components/ui";
import {
  deleteDynamicSample,
  getDynamicStatus,
  saveDynamicSample,
} from "../../services/api";
import {
  DEFAULT_WINDOW_MS,
  NOTHING_LABEL,
  faceRatio,
  handsRatio,
  toSequenceFrame,
} from "../../utils/dynamicSigns";

// Grabar señas (herramienta del equipo): se escribe la palabra, se graba su
// seña varias veces y el backend guarda cada ejemplo para entrenar el modelo.
// La cara debe verse en cada ejemplo: con sus puntos el modelo aprende dónde
// se hace la seña (frente, boca, mentón, pecho).

// Se graba un poco más que la ventana para que quede cubierta completa.
const RECORD_MARGIN_MS = 150;
const MIN_HANDS_RATIO = 0.6;
const MIN_FACE_RATIO = 0.6;
const MIN_FRAMES = 8;
const RECOMMENDED_SAMPLES = 30;
const REPETITION_OPTIONS = [1, 5, 10, 20];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function modelSummary(model) {
  if (!model) {
    return "Consultando...";
  }

  if (!model.ready) {
    return model.detail || "Aún no hay un modelo de señas entrenado";
  }

  return `Entrenado con: ${model.classes.map((item) => item.replaceAll("_", " ")).join(", ")}`;
}

function percent(value) {
  return `${Math.round((value ?? 0) * 100)} %`;
}

function SignRecorder() {
  const [status, setStatus] = useState(null);
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

  const frameRef = useRef(null);
  const recordingRef = useRef(false);
  const framesRef = useRef([]);
  const aspectRatioRef = useRef(4 / 3);
  const cancelRef = useRef(false);
  const handVisibleRef = useRef(false);
  const faceVisibleRef = useRef(false);

  const windowMs = status?.window_ms ?? DEFAULT_WINDOW_MS;
  const seconds = (windowMs / 1000).toLocaleString("es-CL", { maximumFractionDigits: 1 });
  const samples = status?.samples ?? {};
  const withFace = status?.samples_with_face ?? {};
  const isBusy = phase !== "idle";
  const chosenLabel = label.trim().toUpperCase().replace(/[\s-]+/g, "_");

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
    frameRef.current = { face: frame.face, hands: frame.hands, aspectRatio: frame.aspectRatio };

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
      setMessage("Escribe la palabra de la seña que vas a grabar");
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

      if (chosenLabel !== NOTHING_LABEL && handsRatio(frames) < MIN_HANDS_RATIO) {
        setMessage(`Muestra ${round + 1} descartada: no se vio bien la mano`);
        continue;
      }

      if (faceRatio(frames) < MIN_FACE_RATIO) {
        setMessage(`Muestra ${round + 1} descartada: no se vio bien tu cara`);
        continue;
      }

      setPhase("saving");

      try {
        const result = await saveDynamicSample(chosenLabel, frames, aspectRatioRef.current, "sign");
        saved += 1;
        setLastSaved(result);
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                samples: { ...prev.samples, [result.label]: result.count },
                samples_with_face: {
                  ...prev.samples_with_face,
                  [result.label]: (prev.samples_with_face?.[result.label] ?? 0) + 1,
                },
              }
            : prev
        );
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
    refreshStatus();
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

  const chipLabels = [NOTHING_LABEL, ...Object.keys(samples).filter((item) => item !== NOTHING_LABEL)];
  const locationOn = Boolean(status?.model?.face_location);

  return (
    <>
      <Notice icon="users">Herramienta del equipo de desarrollo.</Notice>
      <p className="t-body t-muted">
        Escribe la palabra, haz su seña frente a la cámara y se guarda como ejemplo. Con al menos{" "}
        {RECOMMENDED_SAMPLES} ejemplos por palabra, de distintas personas, el modelo aprende a
        reconocerla ({seconds} s cada ejemplo).
      </p>

      <Notice icon="help">
        Haz la seña una vez, a la velocidad con que conversas. No hace falta llenar la barra; si
        terminas antes, deja la mano quieta. Tu cara debe verse completa: con sus puntos el modelo
        aprende si la seña se hace en la frente, la boca, el mentón o el pecho.
      </Notice>

      <section
        className="a-camera"
        data-phase={phase === "recording" ? "recording" : handVisible && faceVisible ? "hand" : "nohand"}
        aria-label="Vista de la cámara frontal"
      >
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
              Haz la seña
            </span>
            <div className="a-progress">
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        )}
      </section>

      <FaceCheck
        frameRef={frameRef}
        stats={cameraStats}
        mesh={faceMesh}
        onToggleMesh={() => setFaceMesh((current) => !current)}
      />

      <section className="card">
        <label className="field">
          <span className="field-label">Palabra de la seña</span>
          <input
            className="input"
            value={label}
            maxLength={30}
            placeholder="Ej: HOLA, GRACIAS o NADA"
            onChange={(event) => setLabel(event.target.value)}
            disabled={isBusy}
          />
        </label>

        <label className="field">
          <span className="field-label">Repeticiones seguidas</span>
          <select
            className="input"
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

        <div className="btn-row">
          {isBusy ? (
            <Button label="Cancelar" icon="stop" variant="danger" onClick={cancelRecording} />
          ) : (
            <Button label="Grabar" icon="record" variant="danger" onClick={startRecording} />
          )}

          <Button
            label="Borrar última"
            icon="backspace"
            variant="secondary"
            onClick={undoLastSample}
            disabled={!lastSaved || isBusy}
          />
        </div>

        {message && (
          <p className="a-message" role="status">
            {message}
          </p>
        )}
      </section>

      <section className="card">
        <h3 className="t-h3">Muestras guardadas</h3>
        <p className="a-hint">
          Toca una seña para seguir grabándola. Se recomiendan al menos {RECOMMENDED_SAMPLES} de cada
          una con la cara a la vista, de distintas personas.
        </p>

        <div className="a-chips">
          {chipLabels.map((item) => {
            const count = samples[item] ?? 0;
            const faces = withFace[item] ?? 0;

            return (
              <button
                key={item}
                type="button"
                className={`a-sample-chip ${faces >= RECOMMENDED_SAMPLES ? "is-done" : ""} ${
                  item === chosenLabel ? "is-selected" : ""
                }`}
                aria-pressed={item === chosenLabel}
                onClick={() => setLabel(item)}
                disabled={isBusy}
              >
                {item.replaceAll("_", " ")} · {faces} de {count} con cara
              </button>
            );
          })}
        </div>

        <p className="a-tip">
          {NOTHING_LABEL} es obligatoria: graba movimientos que no sean señas (deletrear, saludar con
          el dorso, rascarte, mover las manos al azar).
        </p>
      </section>

      <section className="card">
        <h3 className="t-h3">Modelo</h3>
        <p className="a-hint">{modelSummary(status?.model)}.</p>
        <p className="a-hint">
          <strong>Ubicación de la mano en la cara: {locationOn ? "activa" : "inactiva"}.</strong>{" "}
          {locationOn
            ? "El modelo distingue si la seña se hace en la frente, la boca, el mentón o el pecho."
            : `Se activa al reentrenar cuando al menos el ${percent(
                status?.face_location_min_share ?? 0.8
              )} de las muestras tiene la cara a la vista. Hoy: ${percent(
                status?.face_location_share
              )}.`}
        </p>
        <p className="a-hint">Para entrenar con las muestras nuevas:</p>
        <code className="a-code">docker compose --profile train run --rm trainer python3 api/train_dynamic.py --senas</code>
      </section>
    </>
  );
}

export default SignRecorder;
