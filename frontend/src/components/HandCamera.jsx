import { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  HandLandmarker,
} from "@mediapipe/tasks-vision";

function HandCamera({
  isRunning,
  onLandmarksDetected,
  readyMessage = "Camara lista. Presiona Iniciar y muestra tu mano.",
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animationRef = useRef(null);
  const streamRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const isRunningRef = useRef(isRunning);
  const onLandmarksDetectedRef = useRef(onLandmarksDetected);

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
      setStatus("Solicitando camara...");
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
      setStatus(readyMessage);
    }

    function startDetectionLoop() {
      const detect = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const landmarker = landmarkerRef.current;

        if (!video || !canvas || !landmarker) {
          animationRef.current = requestAnimationFrame(detect);
          return;
        }

        if (video.videoWidth === 0 || video.videoHeight === 0) {
          animationRef.current = requestAnimationFrame(detect);
          return;
        }

        const ctx = canvas.getContext("2d");

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (isRunningRef.current && video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;

          const nowInMs = performance.now();
          const results = landmarker.detectForVideo(video, nowInMs);

          if (results.landmarks && results.landmarks.length > 0) {
            const drawingUtils = new DrawingUtils(ctx);

            for (const landmarks of results.landmarks) {
              drawingUtils.drawConnectors(
                landmarks,
                HandLandmarker.HAND_CONNECTIONS,
                {
                  color: "#00FFAA",
                  lineWidth: 4,
                }
              );

              drawingUtils.drawLandmarks(landmarks, {
                color: "#FF0055",
                lineWidth: 2,
                radius: 4,
              });

              onLandmarksDetectedRef.current?.(landmarks);
            }

            setStatus("Mano detectada");
          } else {
            setStatus("No se detecta mano");
          }
        }

        animationRef.current = requestAnimationFrame(detect);
      };

      detect();
    }

    async function init() {
      try {
        setStatus("Cargando modelo de MediaPipe...");

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });

        landmarkerRef.current = handLandmarker;

        await startCamera(selectedDeviceId);
        startDetectionLoop();
      } catch (error) {
        console.error("Error iniciando MediaPipe o camara:", error);
        setCameraError(error.message || error.name || "Error desconocido");
        setStatus("Error: no se pudo iniciar camara o MediaPipe");
      }
    }

    init();

    return () => {
      cancelled = true;

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      stopCurrentStream();
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

      <div className="camera-status">
        {isRunning ? status : `${status} | Reconocimiento pausado`}
        {cameraError ? ` (${cameraError})` : ""}
      </div>
    </div>
  );
}

export default HandCamera;
