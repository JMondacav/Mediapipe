import { useEffect, useState } from "react";

// Dónde está la mano respecto a la cara, como lo mide el backend para ubicar
// cada seña (sequence_features.py): la palma y la punta del índice respecto a
// la nariz, en "altos de cara" (de la frente al mentón), hacia abajo positivo.
// Los límites de cada zona son aproximados: solo sirven para mostrarlo.
const ZONES = [
  { name: "Frente", until: -0.3 },
  { name: "Ojos", until: -0.05 },
  { name: "Nariz", until: 0.12 },
  { name: "Boca", until: 0.32 },
  { name: "Mentón", until: 0.6 },
  { name: "Cuello", until: 1.1 },
  { name: "Pecho", until: 2.6 },
  { name: "Abajo", until: Infinity },
];
const SIDE = "Al costado";
// A esta distancia de la nariz (hacia el lado), sobre el mentón, la mano ya
// no está delante de la cara.
const SIDE_LIMIT = 0.75;
const PALM_POINTS = [0, 5, 9, 13, 17];
const INDEX_TIP = 8;
const REFRESH_MS = 150;

// face.points: nariz, frente, mentón y los dos costados (x, y, z de cada uno).
function handSpot(landmarks, face, aspectRatio) {
  const point = (index) => [face.points[index * 3] * aspectRatio, face.points[index * 3 + 1]];
  const [nose, forehead, chin] = [0, 1, 2].map(point);
  const height = Math.hypot(chin[0] - forehead[0], chin[1] - forehead[1]);

  if (!(height > 1e-6) || landmarks.length < 21) {
    return null;
  }

  const palm = [
    PALM_POINTS.reduce((sum, index) => sum + landmarks[index].x, 0) / PALM_POINTS.length,
    PALM_POINTS.reduce((sum, index) => sum + landmarks[index].y, 0) / PALM_POINTS.length,
  ];
  const tip = [landmarks[INDEX_TIP].x, landmarks[INDEX_TIP].y];

  // La parte de la mano más cerca de la cara: la palma o la punta del índice.
  const [dx, dy] = [palm, tip]
    .map(([x, y]) => [(x * aspectRatio - nose[0]) / height, (y - nose[1]) / height])
    .sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0];

  if (Math.abs(dx) > SIDE_LIMIT && dy < ZONES[4].until) {
    return SIDE;
  }

  return ZONES.find((zone) => dy < zone.until).name;
}

// Lo que la cámara está leyendo, en vivo: los puntos de la cara, dónde está
// la mano respecto a ella y cuánto tarda el dispositivo en cada cuadro.
// frameRef.current = { face, hands, aspectRatio } del último cuadro, o null.
function FaceCheck({ frameRef, stats, mesh, onToggleMesh }) {
  const [reading, setReading] = useState({ face: false, hands: 0, spots: [] });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const current = frameRef.current;
      const face = current?.face;
      const hands = current?.hands ?? [];

      setReading({
        face: Boolean(face),
        hands: hands.length,
        spots: face
          ? hands.map((hand) => handSpot(hand.landmarks, face, current.aspectRatio)).filter(Boolean)
          : [],
      });
    }, REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [frameRef]);

  const points = stats?.facePoints || 478;

  return (
    <section className="a-card a-facecheck">
      <div className="a-facecheck-head">
        <p className="a-section-title" style={{ margin: 0 }}>
          Lo que lee la cámara
        </p>
        <button
          type="button"
          className="a-facecheck-toggle"
          role="switch"
          aria-checked={mesh}
          onClick={onToggleMesh}
        >
          Ver los {points} puntos
          <span className="a-switch" aria-hidden="true" />
        </button>
      </div>

      {reading.face ? (
        <p className="a-facecheck-ok">Cara detectada: {points} puntos por cuadro</p>
      ) : (
        <p className="a-hint">
          No se ve la cara. Mira a la cámara con buena luz: sin la cara, la muestra se descarta.
        </p>
      )}

      <div className="face-spot">
        <p className="t-label">Dónde está la mano</p>
        <div className="face-zones">
          {[...ZONES.map((zone) => zone.name), SIDE].map((name) => (
            <span key={name} className={`face-zone ${reading.spots.includes(name) ? "is-on" : ""}`}>
              {name}
            </span>
          ))}
        </div>
        {reading.face && reading.hands === 0 && <p className="a-hint">Muestra la mano a la cámara.</p>}
      </div>

      {stats && (
        <p className="a-facecheck-stats">
          {stats.fps} cuadros/s · manos {stats.handMs} ms
          {stats.faceMs ? ` · cara ${stats.faceMs} ms (1 de cada ${stats.faceEvery} cuadros)` : ""}
        </p>
      )}
    </section>
  );
}

export default FaceCheck;
