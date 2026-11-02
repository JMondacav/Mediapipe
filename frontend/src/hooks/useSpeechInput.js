import { useCallback, useEffect, useRef, useState } from "react";
import { getSpeechRecognition, vibrate } from "../utils/feedback";

// Voz -> texto con el reconocimiento de voz del navegador (Chrome y Edge, con
// internet). Mismos estados que el traductor de señas:
//   idle -> capturing -> processing -> result | error
// error: "unsupported" | "permission" | "network" | "no_input" | "unknown".

const IDLE = { status: "idle", text: "", error: null };

function errorKind(code) {
  if (code === "not-allowed" || code === "service-not-allowed") return "permission";
  if (code === "network") return "network";
  if (code === "no-speech" || code === "aborted") return "no_input";
  return "unknown";
}

// onResult(text) se llama una vez por cada frase escuchada.
function useSpeechInput(onResult) {
  const Recognition = getSpeechRecognition();
  const [state, setState] = useState(IDLE);
  const recognizerRef = useRef(null);
  const textRef = useRef("");
  const cancelledRef = useRef(false);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => () => recognizerRef.current?.abort(), []);

  const start = useCallback(() => {
    if (!Recognition) {
      setState({ status: "error", text: "", error: "unsupported" });
      return;
    }

    recognizerRef.current?.abort();

    const recognizer = new Recognition();
    let failure = null;
    recognizer.lang = "es-CL";
    recognizer.interimResults = true;
    recognizer.continuous = true;

    // El texto se ve mientras la persona habla.
    recognizer.onresult = (event) => {
      const text = Array.from(event.results)
        .map((item) => item[0].transcript)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      textRef.current = text;
      setState((current) => ({ ...current, text }));
    };
    recognizer.onerror = (event) => {
      failure = errorKind(event.error);
    };
    recognizer.onend = () => {
      if (recognizerRef.current !== recognizer) {
        return;
      }

      recognizerRef.current = null;

      if (cancelledRef.current) {
        setState(IDLE);
      } else if (textRef.current) {
        vibrate(120);
        setState({ status: "result", text: textRef.current, error: null });
        onResultRef.current?.(textRef.current);
      } else {
        vibrate([80, 60, 80]);
        setState({ status: "error", text: "", error: failure || "no_input" });
      }
    };

    recognizerRef.current = recognizer;
    textRef.current = "";
    cancelledRef.current = false;
    setState({ status: "capturing", text: "", error: null });

    try {
      recognizer.start();
      vibrate(60);
    } catch {
      recognizerRef.current = null;
      setState({ status: "error", text: "", error: "unknown" });
    }
  }, [Recognition]);

  // Termina de escuchar: el resultado llega cuando el navegador cierra el audio.
  const stop = useCallback(() => {
    if (recognizerRef.current) {
      setState((current) => ({ ...current, status: "processing" }));
      recognizerRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;

    if (recognizerRef.current) {
      recognizerRef.current.abort();
    } else {
      setState(IDLE);
    }
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { ...state, supported: Boolean(Recognition), start, stop, cancel, reset };
}

export default useSpeechInput;
