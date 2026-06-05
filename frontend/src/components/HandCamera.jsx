import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  DrawingUtils,
} from "@mediapipe/tasks-vision";

function HandCamera({ isRunning, onLandmarksDetected }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const landmarkerRef = useRef(null);
  const animationRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const isRunningRef = useRef(isRunning);
  const onLandmarksDetectedRef = useRef(onLandmarksDetected);

  const [status, setStatus] = useState("Preparando cámara...");

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    onLandmarksDetectedRef.current = onLandmarksDetected;
  }, [onLandmarksDetected]);

  useEffect(() => {
    let stream = null;
    let cancelled = false;

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

            // CPU es más estable en Safari/iPhone que GPU
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });

        landmarkerRef.current = handLandmarker;

        setStatus("Solicitando cámara...");

        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (cancelled) return;

        const video = videoRef.current;
        video.srcObject = stream;

        await video.play();

        setStatus("Cámara lista. Presiona Iniciar y muestra tu mano.");

        startDetectionLoop();
      } catch (error) {
        console.error("Error iniciando MediaPipe o cámara:", error);
        setStatus("Error: no se pudo iniciar cámara o MediaPipe");
      }
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

        const shouldDetect = isRunningRef.current;

        if (shouldDetect) {
          const nowInMs = performance.now();

          if (video.currentTime !== lastVideoTimeRef.current) {
            lastVideoTimeRef.current = video.currentTime;

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
        }

        animationRef.current = requestAnimationFrame(detect);
      };

      detect();
    }

    init();

    return () => {
      cancelled = true;

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

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

      <div className="camera-status">
        {isRunning ? status : `${status} | Reconocimiento pausado`}
      </div>
    </div>
  );
}

export default HandCamera;
