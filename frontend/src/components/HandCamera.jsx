import { useEffect, useRef, useState } from "react";
import { DrawingUtils, FaceLandmarker, HandLandmarker } from "@mediapipe/tasks-vision";
import { FACE_MODEL_URL, HAND_MODEL_URL, createTask, readFace } from "../utils/mediapipeTasks";
import { createHandTracker } from "./handTracking";

// requestVideoFrameCallback avisa justo cuando la cámara entrega un cuadro
// nuevo (ni antes ni después). Sin él (navegadores antiguos) se revisa en
// cada refresco de pantalla si cambió el cuadro.
const HAS_VIDEO_FRAME_CALLBACK =
  typeof HTMLVideoElement !== "undefined" &&
  "requestVideoFrameCallback" in HTMLVideoElement.prototype;

// La cara cambia más lento que las manos: se lee en uno de cada 2 cuadros y,
// si el dispositivo va justo, en uno de cada 3 o 4 (las manos siempre en
// todos). Entre lecturas se reutiliza la última, si tiene menos de 350 ms.
const FACE_EVERY_MIN = 2;
const FACE_EVERY_MAX = 4;
const FACE_MAX_AGE_MS = 350;
// Costo promedio por cuadro (ms) sobre el que se lee menos la cara, y bajo
// el que se vuelve a leer más seguido.
const SLOW_FRAME_MS = 22;
const FAST_FRAME_MS = 12;
const STATS_EVERY_MS = 1000;

// Dibujo de la cara: solo lo que importa para las expresiones, sin tapar la imagen.
const FACE_STYLE = [
  [FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, "rgba(255, 255, 255, 0.28)", 1.5],
  [FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, "rgba(255, 255, 255, 0.7)", 1.5],
  [FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, "rgba(255, 255, 255, 0.7)", 1.5],
  [FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW, "#fbbf24", 3],
  [FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW, "#fbbf24", 3],
  [FaceLandmarker.FACE_LANDMARKS_LIPS, "#fb7185", 2.5],
];

// Malla completa (para revisar la lectura): los 478 puntos y sus triángulos.
const FACE_MESH_STYLE = [
  [FaceLandmarker.FACE_LANDMARKS_TESSELATION, "rgba(255, 255, 255, 0.22)", 0.6],
  ...FACE_STYLE,
  [FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, "#38bdf8", 1.5],
  [FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS, "#38bdf8", 1.5],
];

function HandCamera({
  isRunning,
  onLandmarksDetected,
  // Recibe cada frame procesado (con o sin manos):
  // { timestamp, aspectRatio, hands, face } (face es null si no se lee o no se ve).
  onFrame,
  numHands = 1,
  // Lee también la cara (expresiones y posición de la cabeza).
  withFace = false,
  // Dibuja la malla completa de la cara (478 puntos) en vez del dibujo sutil.
  faceMesh = false,
  // Dibuja los puntos de las manos y de la cara sobre el video. En Traducir
  // no se dibujan (se detectan igual).
  showLandmarks = true,
  // Recibe cada ~1 s: { fps, handMs, faceMs, faceEvery, facePoints }.
  onStats,
  // En la versión accesible el estado se muestra con colores, no con texto.
  showStatus = true,
  readyMessage = "Camara lista. Presiona Iniciar y muestra tu mano.",
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const lastFaceRef = useRef(null);
  const frameCountRef = useRef(0);
  const faceEveryRef = useRef(FACE_EVERY_MIN);
  const faceMeshRef = useRef(faceMesh);
  const showLandmarksRef = useRef(showLandmarks);
  const onStatsRef = useRef(onStats);
  const statsRef = useRef({ since: 0, frames: 0, handMs: 0, faceMs: 0, faceRuns: 0 });
  const animationRef = useRef(null);
  const handTrackerRef = useRef(createHandTracker());
  const statusRef = useRef("");
  const streamRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const lastTimestampRef = useRef(0);
  const frameCallbackRef = useRef(null);
  const isRunningRef = useRef(isRunning);
  const onLandmarksDetectedRef = useRef(onLandmarksDetected);
  const onFrameRef = useRef(onFrame);
  const numHandsRef = useRef(numHands);
  const hasDrawingRef = useRef(false);

  const [status, setStatus] = useState("Preparando camara...");
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [cameraError, setCameraError] = useState("");

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    onLandmarksDetectedRef.current = onLandmarksDetected;
  }, [onLandmarksDetected]);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    faceMeshRef.current = faceMesh;
    showLandmarksRef.current = showLandmarks;
    onStatsRef.current = onStats;
  }, [faceMesh, showLandmarks, onStats]);

  useEffect(() => {
    numHandsRef.current = numHands;

    // Cambia la cantidad de manos sin reiniciar la camara.
    if (landmarkerRef.current) {
      landmarkerRef.current
        .setOptions({ numHands })
        .catch((error) => console.error("Error cambiando numHands:", error));
    }
  }, [numHands]);

  // La lectura de cara se activa o apaga sin reiniciar la cámara. Si su
  // modelo no carga, las manos siguen funcionando igual.
  useEffect(() => {
    if (!withFace) {
      return undefined;
    }

    let cancelled = false;

    createTask(FaceLandmarker, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
      .then((faceLandmarker) => {
        if (cancelled) {
          faceLandmarker.close();
          return;
        }

        faceLandmarkerRef.current = faceLandmarker;
      })
      .catch((error) => console.error("No se pudo cargar la lectura de cara:", error));

    return () => {
      cancelled = true;
      faceLandmarkerRef.current?.close();
      faceLandmarkerRef.current = null;
      lastFaceRef.current = null;
    };
  }, [withFace]);

  useEffect(() => {
    let cancelled = false;

    function stopCurrentStream() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }

    async function loadDevices() {
      if (!navigator.mediaDevices?.enumerateDevices) {
        return;
      }

      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = mediaDevices.filter(
        (device) => device.kind === "videoinput"
      );

      setDevices(videoDevices);

      if (!selectedDeviceId && videoDevices[0]?.deviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    }

    async function requestCamera(deviceId = "") {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Este navegador no permite acceder a la camara");
      }

      const preferredConstraints = {
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          width: { ideal: 640 },
          height: { ideal: 480 },
          // Sin pedirlo, varias cámaras de notebook entregan 15 cuadros por
          // segundo (o menos con poca luz): el movimiento se ve a saltos y
          // la seña llega con la mitad de los cuadros.
          frameRate: { ideal: 30 },
        },
        audio: false,
      };

      try {
        return await navigator.mediaDevices.getUserMedia(preferredConstraints);
      } catch (error) {
        if (deviceId) {
          throw error;
        }

        return await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
    }

    async function startCamera(deviceId = "") {
      setCameraError("");
      showStatusText("Solicitando camara...");
      stopCurrentStream();

      const stream = await requestCamera(deviceId);

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      await loadDevices();
      showStatusText(readyMessage);
    }

    // La cara, si se lee: en algunos cuadros se detecta y en el resto se
    // reutiliza la última lectura reciente.
    function detectFace(video, nowInMs) {
      const faceLandmarker = faceLandmarkerRef.current;

      if (!faceLandmarker) {
        lastFaceRef.current = null;
        return null;
      }

      frameCountRef.current += 1;

      if (frameCountRef.current % faceEveryRef.current === 0 || !lastFaceRef.current) {
        const started = performance.now();
        const face = readFace(faceLandmarker.detectForVideo(video, nowInMs));
        statsRef.current.faceMs += performance.now() - started;
        statsRef.current.faceRuns += 1;
        lastFaceRef.current = face ? { ...face, at: nowInMs } : null;
      }

      const last = lastFaceRef.current;
      return last && nowInMs - last.at <= FACE_MAX_AGE_MS ? last : null;
    }

    // Cada segundo: cuadros por segundo y cuánto tarda cada detección. Si el
    // dispositivo va justo, la cara se lee menos seguido (las manos no).
    function updateStats(nowInMs) {
      const stats = statsRef.current;

      if (!stats.since) {
        stats.since = nowInMs;
        return;
      }

      const elapsed = nowInMs - stats.since;

      if (elapsed < STATS_EVERY_MS || stats.frames === 0) {
        return;
      }

      const handMs = stats.handMs / stats.frames;
      const faceMs = stats.faceRuns ? stats.faceMs / stats.faceRuns : 0;
      const frameMs = handMs + (stats.faceRuns ? faceMs / faceEveryRef.current : 0);

      if (frameMs > SLOW_FRAME_MS && faceEveryRef.current < FACE_EVERY_MAX) {
        faceEveryRef.current += 1;
      } else if (frameMs < FAST_FRAME_MS && faceEveryRef.current > FACE_EVERY_MIN) {
        faceEveryRef.current -= 1;
      }

      const fps = (stats.frames * 1000) / elapsed;

      onStatsRef.current?.({
        fps: Math.round(fps),
        handMs: Math.round(handMs * 10) / 10,
        faceMs: Math.round(faceMs * 10) / 10,
        faceEvery: faceEveryRef.current,
        facePoints: lastFaceRef.current?.landmarks.length ?? 0,
      });
      statsRef.current = { since: nowInMs, frames: 0, handMs: 0, faceMs: 0, faceRuns: 0 };
    }

    // El estado solo se actualiza cuando cambia (antes, 30 veces por segundo).
    function showStatusText(text) {
      if (statusRef.current !== text) {
        statusRef.current = text;
        setStatus(text);
      }
    }

    // Procesa un cuadro nuevo de la cámara: manos, cara, envío y dibujo.
    function processFrame(video, ctx, canvas, landmarker, drawingUtils) {
      // MediaPipe exige tiempos siempre crecientes.
      const nowInMs = Math.max(performance.now(), lastTimestampRef.current + 1);
      lastTimestampRef.current = nowInMs;

      const results = landmarker.detectForVideo(video, nowInMs);
      statsRef.current.handMs += performance.now() - nowInMs;
      statsRef.current.frames += 1;
      const face = detectFace(video, nowInMs);
      updateStats(nowInMs);

      // Cada mano con su etiqueta estable y su versión suavizada (para dibujar).
      const rawHandedness = results.handedness ?? results.handednesses ?? [];
      const hands = handTrackerRef.current(
        (results.landmarks ?? []).map((landmarks, index) => ({
          landmarks,
          category: rawHandedness[index]?.[0],
        })),
        nowInMs
      );

      onFrameRef.current?.({
        timestamp: nowInMs,
        aspectRatio: video.videoWidth / video.videoHeight,
        // Los puntos van tal cual los entrega MediaPipe (sin suavizar).
        hands: hands.map(({ handedness, landmarks }) => ({ handedness, landmarks })),
        face: face ? { blendshapes: face.blendshapes, points: face.points } : null,
      });

      for (const { landmarks } of hands) {
        onLandmarksDetectedRef.current?.(landmarks);
      }

      // Solo se borra y redibuja cuando llega un cuadro nuevo de la cámara.
      // Antes se borraba en cada refresco de pantalla (60 por segundo) y
      // se dibujaba con cada cuadro (30 por segundo): la mano parpadeaba.
      if (hasDrawingRef.current) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasDrawingRef.current = false;
      }

      if (showLandmarksRef.current && (face || hands.length > 0)) {
        hasDrawingRef.current = true;

        if (face) {
          const style = faceMeshRef.current ? FACE_MESH_STYLE : FACE_STYLE;

          for (const [connections, color, lineWidth] of style) {
            drawingUtils.drawConnectors(face.landmarks, connections, { color, lineWidth });
          }

          if (faceMeshRef.current) {
            drawingUtils.drawLandmarks(face.landmarks, {
              color: "#38bdf8",
              fillColor: "#38bdf8",
              lineWidth: 0,
              radius: 1,
            });
          }
        }

        for (const { smoothed } of hands) {
          drawingUtils.drawConnectors(smoothed, HandLandmarker.HAND_CONNECTIONS, {
            color: "#00FFAA",
            lineWidth: 4,
          });

          drawingUtils.drawLandmarks(smoothed, {
            color: "#FF0055",
            lineWidth: 2,
            radius: 4,
          });
        }
      }

      showStatusText(hands.length > 0 ? "Mano detectada" : "No se detecta mano");
    }

    function startDetectionLoop() {
      let drawingUtils = null;
      let drawingCtx = null;

      const scheduleNext = () => {
        const video = videoRef.current;

        if (cancelled) {
          return;
        }

        if (HAS_VIDEO_FRAME_CALLBACK && video) {
          const id = video.requestVideoFrameCallback(detect);
          frameCallbackRef.current = { video, id };
        } else {
          animationRef.current = requestAnimationFrame(detect);
        }
      };

      const detect = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const landmarker = landmarkerRef.current;

        if (!video || !canvas || !landmarker || video.videoWidth === 0 || video.videoHeight === 0) {
          scheduleNext();
          return;
        }

        const ctx = canvas.getContext("2d");

        if (ctx !== drawingCtx) {
          drawingCtx = ctx;
          drawingUtils = new DrawingUtils(ctx);
        }

        // Asignar width/height borra el lienzo: solo se hace si cambia el tamaño.
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        if (!isRunningRef.current) {
          if (hasDrawingRef.current) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            hasDrawingRef.current = false;
          }
        } else if (HAS_VIDEO_FRAME_CALLBACK || video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;
          processFrame(video, ctx, canvas, landmarker, drawingUtils);
        }

        scheduleNext();
      };

      detect();
    }

    async function init() {
      try {
        showStatusText("Cargando modelo de MediaPipe...");

        // La cámara se enciende mientras se descarga el modelo. Antes recién
        // se encendía al terminar la descarga y se veía negro unos segundos.
        const [handLandmarker] = await Promise.all([
          createTask(HandLandmarker, {
            baseOptions: { modelAssetPath: HAND_MODEL_URL },
            runningMode: "VIDEO",
            numHands: numHandsRef.current,
            minHandDetectionConfidence: 0.3,
            minHandPresenceConfidence: 0.3,
            minTrackingConfidence: 0.3,
          }),
          startCamera(selectedDeviceId),
        ]);

        if (cancelled) {
          handLandmarker.close();
          return;
        }

        landmarkerRef.current = handLandmarker;
        startDetectionLoop();
      } catch (error) {
        console.error("Error iniciando MediaPipe o camara:", error);
        setCameraError(error.message || error.name || "Error desconocido");
        showStatusText("Error: no se pudo iniciar camara o MediaPipe");
      }
    }

    init();

    return () => {
      cancelled = true;

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      if (frameCallbackRef.current) {
        const { video, id } = frameCallbackRef.current;
        video.cancelVideoFrameCallback?.(id);
        frameCallbackRef.current = null;
      }

      stopCurrentStream();
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [readyMessage, selectedDeviceId]);

  return (
    <div className="hand-camera">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="camera-video"
      />

      <canvas ref={canvasRef} className="camera-canvas" />

      {devices.length > 1 && (
        <select
          className="camera-device-select"
          value={selectedDeviceId}
          onChange={(event) => setSelectedDeviceId(event.target.value)}
        >
          {devices.map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Camara ${index + 1}`}
            </option>
          ))}
        </select>
      )}

      {(showStatus || cameraError) && (
        <div className="camera-status">
          {isRunning ? status : `${status} | Reconocimiento pausado`}
          {cameraError ? ` (${cameraError})` : ""}
        </div>
      )}
    </div>
  );
}

export default HandCamera;
