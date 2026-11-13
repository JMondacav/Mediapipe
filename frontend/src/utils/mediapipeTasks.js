// MediaPipe compartido por la cámara (components/HandCamera.jsx).

import { FilesetResolver } from "@mediapipe/tasks-vision";

// Misma versión que el paquete instalado (package-lock): con "@latest" una
// actualización del CDN podía romper la app sin tocar el código.
export const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
export const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";
export const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

// Puntos de la cara que se envían al backend: punta de la nariz, frente,
// mentón y los dos costados (FACE_POINT_IDS en backend/api/sequence_features.py).
export const FACE_POINT_IDS = [1, 10, 152, 234, 454];
const BLENDSHAPE_COUNT = 52;

// Los archivos de MediaPipe se descargan una sola vez.
let visionPromise = null;

export function loadVision() {
  visionPromise ??= FilesetResolver.forVisionTasks(WASM_URL).catch((error) => {
    visionPromise = null;
    throw error;
  });
  return visionPromise;
}

// La tarjeta gráfica detecta más rápido; si el dispositivo no la permite, se
// usa la CPU. Devuelve la tarea con `delegate` ("GPU" o "CPU") anotado.
export async function createTask(TaskClass, options) {
  const vision = await loadVision();
  const create = async (delegate) => {
    const task = await TaskClass.createFromOptions(vision, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate },
    });
    task.delegate = delegate;
    return task;
  };

  try {
    return await create("GPU");
  } catch (gpuError) {
    console.warn("GPU no disponible para MediaPipe, se usa CPU:", gpuError);
    return create("CPU");
  }
}

// Las 52 expresiones en el orden de su índice y los puntos de referencia.
export function readFace(result) {
  const landmarks = result.faceLandmarks?.[0];
  const categories = result.faceBlendshapes?.[0]?.categories;

  if (!landmarks?.length || !categories?.length) {
    return null;
  }

  const blendshapes = new Array(BLENDSHAPE_COUNT).fill(0);
  categories.forEach(({ index, score }) => {
    if (index >= 0 && index < BLENDSHAPE_COUNT) {
      blendshapes[index] = score;
    }
  });

  return {
    blendshapes,
    points: FACE_POINT_IDS.flatMap((id) => [landmarks[id].x, landmarks[id].y, landmarks[id].z]),
    landmarks,
  };
}
