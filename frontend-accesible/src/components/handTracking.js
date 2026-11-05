// Seguimiento de cada mano entre cuadros, para dos cosas:
//
// 1. Que la etiqueta izquierda / derecha no "salte". MediaPipe decide en cada
//    cuadro si una mano es Left o Right, y a veces se equivoca 1 a 3 cuadros
//    seguidos (sobre todo de perfil, con el puño cerrado o al entrar en la
//    imagen). El backend usa esa etiqueta para elegir la casilla de la mano
//    (sequence_features.assign_hand_slots): con un salto, la mano aparece
//    de golpe en la otra casilla y la ventana de 1,5 s queda cortada en dos.
//    Aquí cada mano se sigue por su posición y su etiqueta es un promedio de
//    los últimos cuadros: solo cambia si MediaPipe insiste ~6 cuadros (0,2 s).
//
// 2. Dibujar la mano sin temblor, con un filtro "One Euro": suaviza mucho
//    cuando la mano está quieta (el temblor de los puntos) y casi nada cuando
//    se mueve rápido (sin retraso). El filtro es SOLO para el dibujo: los
//    puntos que van al servidor son los de MediaPipe tal cual, iguales a los
//    de las muestras con que se entrenaron los modelos.

// Una mano que desaparece más de esto empieza un seguimiento nuevo.
const TRACK_MAX_GAP_MS = 400;
// Distancia máxima (en fracción de la imagen) que puede moverse el centro de
// la mano entre dos cuadros para seguir siendo la misma.
const TRACK_MAX_JUMP = 0.25;
// Peso de cada cuadro nuevo en el promedio de la etiqueta (+1 = Right, -1 = Left).
const HANDEDNESS_ALPHA = 0.2;
// La etiqueta cambia solo si el promedio cruza este margen hacia el otro lado.
const HANDEDNESS_SWITCH = 0.4;

// Filtro One Euro para el dibujo (coordenadas de 0 a 1 de la imagen).
const SMOOTH_MIN_CUTOFF = 1.2; // Hz con la mano quieta: menos = más suave
const SMOOTH_BETA = 20; // cuánto se abre el filtro con la velocidad
const SMOOTH_D_CUTOFF = 1.0;

const LABELS = ["Left", "Right"];

function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

// Filtro One Euro sobre los 21 puntos (x, y, z) de una mano.
function createSmoother() {
  let previous = null;
  let derivative = null;
  let lastMs = 0;

  return (landmarks, nowMs) => {
    const values = landmarks.flatMap((point) => [point.x, point.y, point.z ?? 0]);

    if (!previous) {
      previous = values;
      derivative = new Array(values.length).fill(0);
      lastMs = nowMs;
      return landmarks;
    }

    const dt = Math.max((nowMs - lastMs) / 1000, 1 / 240);
    lastMs = nowMs;
    const aD = alpha(SMOOTH_D_CUTOFF, dt);

    for (let index = 0; index < values.length; index += 1) {
      const rawDerivative = (values[index] - previous[index]) / dt;
      derivative[index] += aD * (rawDerivative - derivative[index]);
      const cutoff = SMOOTH_MIN_CUTOFF + SMOOTH_BETA * Math.abs(derivative[index]);
      previous[index] += alpha(cutoff, dt) * (values[index] - previous[index]);
    }

    return landmarks.map((point, index) => ({
      ...point,
      x: previous[index * 3],
      y: previous[index * 3 + 1],
      z: previous[index * 3 + 2],
    }));
  };
}

// Centro de la mano: entre la muñeca (0) y el nudillo del dedo medio (9).
function handCenter(landmarks) {
  return {
    x: (landmarks[0].x + landmarks[9].x) / 2,
    y: (landmarks[0].y + landmarks[9].y) / 2,
  };
}

// +score si MediaPipe dice Right, -score si dice Left, 0 si no sabe.
function rawVote(category) {
  const name = String(category?.categoryName ?? "").trim().toLowerCase();
  const score = Number.isFinite(category?.score) ? category.score : 0.5;

  if (name === "right") {
    return score;
  }

  if (name === "left") {
    return -score;
  }

  return 0;
}

export function createHandTracker() {
  let tracks = [];

  // hands: [{ landmarks, category }] del cuadro actual.
  // Devuelve, en el mismo orden: [{ landmarks, handedness, smoothed }].
  return function update(hands, nowMs) {
    const alive = tracks.filter((track) => nowMs - track.at <= TRACK_MAX_GAP_MS);
    const centers = hands.map(({ landmarks }) => handCenter(landmarks));

    // Une cada mano con el seguimiento más cercano (el par más cercano primero).
    const pairs = [];
    centers.forEach((center, handIndex) => {
      alive.forEach((track, trackIndex) => {
        const distance = Math.hypot(center.x - track.center.x, center.y - track.center.y);

        if (distance <= TRACK_MAX_JUMP) {
          pairs.push({ handIndex, trackIndex, distance });
        }
      });
    });
    pairs.sort((a, b) => a.distance - b.distance);

    const trackOf = new Array(hands.length).fill(null);
    const usedTracks = new Set();

    for (const { handIndex, trackIndex } of pairs) {
      if (trackOf[handIndex] === null && !usedTracks.has(trackIndex)) {
        trackOf[handIndex] = alive[trackIndex];
        usedTracks.add(trackIndex);
      }
    }

    const current = hands.map(({ category }, handIndex) => {
      const vote = rawVote(category);
      let track = trackOf[handIndex];

      if (!track) {
        track = {
          vote,
          label: vote >= 0 ? "Right" : "Left",
          smooth: createSmoother(),
        };
      } else {
        track.vote += HANDEDNESS_ALPHA * (vote - track.vote);

        if (track.label === "Right" && track.vote < -HANDEDNESS_SWITCH) {
          track.label = "Left";
        } else if (track.label === "Left" && track.vote > HANDEDNESS_SWITCH) {
          track.label = "Right";
        }
      }

      track.center = centers[handIndex];
      track.at = nowMs;
      return track;
    });

    // Dos manos con la misma etiqueta: la menos segura toma la otra.
    if (current.length === 2 && current[0].label === current[1].label) {
      const [a, b] = current;
      const weaker = Math.abs(a.vote) <= Math.abs(b.vote) ? a : b;
      weaker.label = LABELS.find((label) => label !== weaker.label);
      weaker.vote = weaker.label === "Right" ? HANDEDNESS_SWITCH : -HANDEDNESS_SWITCH;
    }

    // Las manos que no se vieron en este cuadro se guardan un rato: si
    // MediaPipe las pierde 1 o 2 cuadros, vuelven con su misma etiqueta.
    tracks = [...current, ...alive.filter((_, trackIndex) => !usedTracks.has(trackIndex))];

    return hands.map(({ landmarks }, handIndex) => ({
      landmarks,
      handedness: current[handIndex].label,
      smoothed: current[handIndex].smooth(landmarks, nowMs),
    }));
  };
}
