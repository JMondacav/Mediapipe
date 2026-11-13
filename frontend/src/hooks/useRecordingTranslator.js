import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSession,
  saveFeedback,
  savePendingFeedbackLocally,
  saveTranslation,
  translateRecording,
  translateRecordingPartial,
  updateSession,
} from "../services/api";
import { faceRatio, toSequenceFrame } from "../utils/dynamicSigns";
import { greetingByPosition, toHistoryText } from "../utils/expressions";
import { vibrate } from "../utils/feedback";

// Grabar primero, traducir después:
//   idle -> recording -> analyzing -> result
// Mientras se graba no se muestra nada, pero el backend ya va analizando la
// grabación por trozos (backend/api/recording_decoder.py). Al terminar solo
// falta el último trozo, y llegan las señas reconocidas, tal cual y en el
// orden en que salieron: no se interpreta ni se reformula nada. Así se puede
// señar de corrido, sin pausas, y la respuesta llega casi al instante.
// La cara se lee siempre: sus puntos dicen dónde se hace cada seña (frente,
// boca, mentón). Solo viajan números, nunca la imagen.

const MAX_RECORDING_MS = 30000;
// Si la persona baja las manos 2 s, la grabación termina sola.
const AUTO_STOP_NO_HANDS_MS = 2000;
// Grabaciones más cortas que esto no se analizan.
const MIN_RECORDING_MS = 800;
// Se conserva medio segundo antes de la primera mano y después de la última.
const TRIM_MARGIN_MS = 500;
// Mientras se graba, cada ~1 s se manda lo nuevo al servidor, que lo va
// analizando. Al terminar solo falta el último trozo, así la respuesta no
// depende de cuánto duró la grabación.
const PARTIAL_EVERY_MS = 1000;
// Cada trozo lleva también los 1,8 s anteriores, para que las ventanas de
// 1,5 s de las posiciones nuevas queden completas.
const PARTIAL_OVERLAP_MS = 1800;

// Lo que el servidor ya analizó de la grabación en curso. El análisis empieza
// medio segundo antes de la primera mano, igual que el recorte final.
function newStream() {
  return { startT: null, afterT: null, steps: [], expressionSteps: [], pending: null, nextAt: 0 };
}

// Quita los tramos sin manos del inicio y del final (por ejemplo, los 2 s de
// espera del corte automático). Si nunca hubo manos pero sí cara, se envía
// todo: puede ser una respuesta solo con la cara (negar con la cabeza).
function trimFrames(frames) {
  const withHands = frames.filter((frame) => frame.hands.length > 0);

  if (withHands.length === 0) {
    return frames.some((frame) => frame.face) ? frames : [];
  }

  const start = withHands[0].t - TRIM_MARGIN_MS;
  const end = withHands[withHands.length - 1].t + TRIM_MARGIN_MS;
  return frames.filter((frame) => frame.t >= start && frame.t <= end);
}

// Backend antiguo (sin "items"): una palabra por seña, sin expresión.
function itemsFrom(data) {
  if (Array.isArray(data.items)) {
    return data.items;
  }

  return (data.words || []).map((text) => ({ text, kind: "sign", expression: null }));
}

function useRecordingTranslator() {
  const [phase, setPhase] = useState("idle");
  const [result, setResult] = useState(null);
  const [handVisible, setHandVisible] = useState(false);
  const [faceVisible, setFaceVisible] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const phaseRef = useRef("idle");
  const sessionRef = useRef(null);
  const sessionStartedAtRef = useRef(0);
  const translationsCountRef = useRef(0);
  const framesRef = useRef([]);
  const aspectRatioRef = useRef(4 / 3);
  const startedAtRef = useRef(0);
  const lastHandAtRef = useRef(0);
  const sawHandRef = useRef(false);
  const handVisibleRef = useRef(false);
  const faceVisibleRef = useRef(false);
  const streamRef = useRef(newStream());

  const changePhase = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // Cronómetro mientras graba.
  useEffect(() => {
    if (phase !== "recording") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setSeconds(Math.floor((performance.now() - startedAtRef.current) / 1000));
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [phase]);

  // Manda al servidor lo nuevo de la grabación en curso (sin esperar la respuesta).
  const sendPartial = useCallback((stream) => {
    const frames = framesRef.current;
    const from = stream.afterT === null ? stream.startT : stream.afterT - PARTIAL_OVERLAP_MS;
    const chunk = frames.filter((item) => item.t >= Math.max(from, stream.startT));
    stream.nextAt = frames[frames.length - 1].t + PARTIAL_EVERY_MS;

    stream.pending = translateRecordingPartial(chunk, aspectRatioRef.current, stream.startT, stream.afterT)
      .then((data) => {
        stream.steps.push(...data.steps);
        stream.expressionSteps.push(...data.expression_steps);

        if (data.until !== null && data.until !== undefined) {
          stream.afterT = data.until;
        }
      })
      .catch((error) => {
        // Sin conexión un momento: el próximo trozo incluye lo que faltó.
        console.warn("No se pudo analizar un trozo de la grabación:", error);
      })
      .finally(() => {
        stream.pending = null;
      });
  }, []);

  // Termina la grabación: si se fue analizando por trozos, solo falta el
  // último; si no (nunca hubo manos o falló la conexión), se manda completa.
  const requestTranslation = useCallback(async (frames, stream) => {
    const hands = frames.filter((frame) => frame.hands.length > 0);

    if (stream.startT === null || hands.length === 0) {
      return translateRecording(frames, aspectRatioRef.current);
    }

    await stream.pending;
    const endT = hands[hands.length - 1].t + TRIM_MARGIN_MS;
    const from =
      stream.afterT === null ? stream.startT : Math.min(stream.afterT, endT) - PARTIAL_OVERLAP_MS;
    const chunk = frames.filter((frame) => frame.t >= from);

    try {
      return await translateRecording(chunk.length >= 2 ? chunk : frames.slice(-2), aspectRatioRef.current, {
        startT: stream.startT,
        afterT: stream.afterT,
        endT,
        steps: stream.steps,
        expressionSteps: stream.expressionSteps,
      });
    } catch (error) {
      console.warn("Falló el último trozo; se envía la grabación completa:", error);
      return translateRecording(frames, aspectRatioRef.current);
    }
  }, []);

  const stop = useCallback(async () => {
    if (phaseRef.current !== "recording") {
      return;
    }

    const frames = trimFrames(framesRef.current);
    const stream = streamRef.current;
    framesRef.current = [];
    const duration = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0;

    if (duration < MIN_RECORDING_MS) {
      // No se vio ninguna mano (o fue demasiado corto): nada que traducir.
      vibrate([80, 60, 80]);
      setResult({ items: [], faceRatio: null });
      changePhase("result");
      return;
    }

    changePhase("analyzing");

    try {
      const startedAt = performance.now();
      const data = await requestTranslation(frames, stream);
      // HOLA o ADIÓS según dónde quedó el saludo y si la conversación ya empezó.
      const items = greetingByPosition(itemsFrom(data), translationsCountRef.current > 0);
      console.info(`Traducción lista en ${Math.round(performance.now() - startedAt)} ms`);
      setResult({
        items,
        faceRatio: faceRatio(frames),
        expressionsReady: Boolean(data.expression_model_ready),
      });
      setProblem(false);
      changePhase("result");
      vibrate(items.length ? 120 : [80, 60, 80]);

      // Cada palabra (con su expresión) se guarda en el historial de la sesión.
      const session = sessionRef.current;
      if (session?.id) {
        items.forEach((item) => {
          saveTranslation(session.id, toHistoryText(item), item.confidence ?? 1).catch(
            console.error
          );
        });
      }
      translationsCountRef.current += items.length;
    } catch (error) {
      console.error("Error traduciendo la grabación:", error);
      setProblem(true);
      vibrate([80, 60, 80]);
      changePhase("idle");
    }
  }, [changePhase, requestTranslation]);

  const start = useCallback(async () => {
    if (phaseRef.current === "recording" || phaseRef.current === "analyzing") {
      return;
    }

    if (!sessionRef.current) {
      try {
        sessionRef.current = await createSession();
        sessionStartedAtRef.current = Date.now();
        translationsCountRef.current = 0;
        setHasSession(true);
      } catch (error) {
        console.error(error);
        setProblem(true);
        vibrate([80, 60, 80]);
        return;
      }
    }

    framesRef.current = [];
    streamRef.current = newStream();
    sawHandRef.current = false;
    lastHandAtRef.current = 0;
    startedAtRef.current = performance.now();
    setSeconds(0);
    setProblem(false);
    setResult(null);
    vibrate(60);
    changePhase("recording");
  }, [changePhase]);

  const handleFrame = useCallback(
    (frame) => {
      const visible = frame.hands.length > 0;
      const faceSeen = Boolean(frame.face);

      if (visible !== handVisibleRef.current) {
        handVisibleRef.current = visible;
        setHandVisible(visible);
      }

      if (faceSeen !== faceVisibleRef.current) {
        faceVisibleRef.current = faceSeen;
        setFaceVisible(faceSeen);
      }

      if (phaseRef.current !== "recording") {
        return;
      }

      const sequenceFrame = toSequenceFrame(frame);
      framesRef.current.push(sequenceFrame);
      aspectRatioRef.current = frame.aspectRatio || aspectRatioRef.current;

      if (visible) {
        sawHandRef.current = true;
        lastHandAtRef.current = frame.timestamp;
      }

      const stream = streamRef.current;

      if (stream.startT === null && visible) {
        const from = sequenceFrame.t - TRIM_MARGIN_MS;
        stream.startT = framesRef.current.find((item) => item.t >= from).t;
        stream.nextAt = stream.startT + PARTIAL_EVERY_MS;
      }

      if (stream.startT !== null && !stream.pending && sequenceFrame.t >= stream.nextAt) {
        sendPartial(stream);
      }

      const handsGone =
        sawHandRef.current && frame.timestamp - lastHandAtRef.current > AUTO_STOP_NO_HANDS_MS;
      const tooLong = performance.now() - startedAtRef.current > MAX_RECORDING_MS;

      if (handsGone || tooLong) {
        stop();
      }
    },
    [sendPartial, stop]
  );

  const deleteLastWord = useCallback(() => {
    setResult((prev) => (prev?.items.length ? { ...prev, items: prev.items.slice(0, -1) } : prev));
  }, []);

  const discard = useCallback(() => {
    setResult(null);
    changePhase("idle");
  }, [changePhase]);

  const finish = useCallback(() => {
    if (!sessionRef.current || phaseRef.current === "recording") {
      return;
    }

    setFeedbackOpen(true);
  }, []);

  const cancelFinish = useCallback(() => {
    setFeedbackOpen(false);
  }, []);

  const sendFeedback = useCallback(
    async (rating) => {
      const session = sessionRef.current;
      const data = {
        duration_seconds: Math.round((Date.now() - sessionStartedAtRef.current) / 1000),
        translations_count: translationsCountRef.current,
      };

      try {
        if (session?.id) {
          await updateSession(session.id, data);
          await saveFeedback(session.id, rating);
        }
      } catch (error) {
        console.error(error);
        savePendingFeedbackLocally({ sessionId: session?.id || null, rating, ...data });
      }

      sessionRef.current = null;
      setHasSession(false);
      setFeedbackOpen(false);
      setResult(null);
      changePhase("idle");
    },
    [changePhase]
  );

  return {
    phase,
    result,
    handVisible,
    faceVisible,
    seconds,
    problem,
    hasSession,
    feedbackOpen,
    handleFrame,
    start,
    stop,
    deleteLastWord,
    discard,
    finish,
    cancelFinish,
    sendFeedback,
  };
}

export default useRecordingTranslator;
