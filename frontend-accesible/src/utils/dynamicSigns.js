// Utilidades para señas dinámicas (con movimiento) y expresiones faciales.
// El frontend solo junta los frames crudos con su tiempo; el backend
// (api/sequence_features.py) los convierte en la secuencia de 30 pasos.

// Solo se usa hasta que responde /api/dynamic/status/, que trae el valor real.
export const DEFAULT_WINDOW_MS = 1500;
export const NOTHING_LABEL = "NADA";

const round2 = (value) => Math.round(value * 100) / 100;
const round4 = (value) => Math.round(value * 10000) / 10000;

export function toSequenceFrame({ timestamp, hands, face }) {
  const frame = {
    t: Math.round(timestamp),
    hands: hands.map(({ handedness, landmarks }) => ({
      handedness,
      landmarks: landmarks.flatMap((point) => [
        round4(point.x),
        round4(point.y),
        round4(point.z),
      ]),
    })),
  };

  // Solo números: las 52 expresiones y 5 puntos de referencia. Nunca la imagen.
  if (face) {
    frame.face = {
      blendshapes: face.blendshapes.map(round2),
      points: face.points.map(round4),
    };
  }

  return frame;
}

export function framesDuration(frames) {
  return frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : 0;
}

export function handsRatio(frames) {
  if (frames.length === 0) {
    return 0;
  }

  return frames.filter((frame) => frame.hands.length > 0).length / frames.length;
}

export function faceRatio(frames) {
  if (frames.length === 0) {
    return 0;
  }

  return frames.filter((frame) => frame.face).length / frames.length;
}
