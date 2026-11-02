import { useEffect, useState } from "react";

// Algunas de las 52 expresiones de MediaPipe (índice en face.blendshapes),
// las que más se usan en lengua de señas.
const READINGS = [
  { name: "Cejas arriba", value: (b) => Math.max(b[3], (b[4] + b[5]) / 2) },
  { name: "Cejas juntas", value: (b) => (b[1] + b[2]) / 2 },
  { name: "Ojos muy abiertos", value: (b) => (b[21] + b[22]) / 2 },
  { name: "Ojos entrecerrados", value: (b) => (b[19] + b[20]) / 2 },
  { name: "Boca abierta", value: (b) => b[25] },
  { name: "Sonrisa", value: (b) => (b[44] + b[45]) / 2 },
  { name: "Mejillas infladas", value: (b) => b[6] },
  { name: "Labios hacia adelante", value: (b) => b[38] },
];

const MAX_ANGLE = 40;
const REFRESH_MS = 120;

// Giro e inclinación de la cabeza en grados, igual que el backend
// (head_pose en backend/api/sequence_features.py).
function headAngles(points, aspectRatio) {
  const point = (index) => [
    points[index * 3] * aspectRatio,
    points[index * 3 + 1],
    points[index * 3 + 2] * aspectRatio,
  ];
  const [, forehead, chin, sideA, sideB] = [0, 1, 2, 3, 4].map(point);
  const side = sideB.map((value, axis) => value - sideA[axis]);
  const vertical = chin.map((value, axis) => value - forehead[axis]);
  const width = Math.max(Math.abs(side[0]), 1e-6);
  const toDegrees = 180 / Math.PI;

  return {
    turn: Math.atan2(side[2], width) * toDegrees,
    tilt: Math.atan2(vertical[2], Math.max(vertical[1], 1e-6)) * toDegrees,
  };
}

function Bar({ name, value }) {
  return (
    <div className="a-facecheck-row">
      <span>{name}</span>
      <span className="a-facecheck-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
        <span style={{ width: `${Math.min(100, value * 100)}%` }} />
      </span>
    </div>
  );
}

function Angle({ name, degrees }) {
  const clamped = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, degrees));
  const half = (Math.abs(clamped) / MAX_ANGLE) * 50;

  return (
    <div className="a-facecheck-row">
      <span>{name}</span>
      <span className="a-facecheck-bar a-facecheck-bar--center" aria-label={`${Math.round(degrees)} grados`}>
        <span style={{ left: clamped < 0 ? `${50 - half}%` : "50%", width: `${half}%` }} />
      </span>
    </div>
  );
}

// Lo que la cámara está leyendo de la cara, en vivo, para comprobar que
// funciona bien: los puntos, las expresiones principales, el movimiento de
// la cabeza y cuánto tarda el dispositivo en cada cuadro.
// faceRef.current = { face: { blendshapes, points }, aspectRatio } o null.
function FaceCheck({ faceRef, stats, mesh, onToggleMesh }) {
  const [reading, setReading] = useState(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const current = faceRef.current;
      setReading(
        current
          ? {
              values: READINGS.map((item) => item.value(current.face.blendshapes)),
              angles: headAngles(current.face.points, current.aspectRatio),
            }
          : null
      );
    }, REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [faceRef]);

  const points = stats?.facePoints || 478;

  return (
    <section className="a-card a-facecheck">
      <div className="a-facecheck-head">
        <p className="a-section-title" style={{ margin: 0 }}>
          Lo que lee la cámara
        </p>
        <button
          className="a-facecheck-toggle"
          role="switch"
          aria-checked={mesh}
          onClick={onToggleMesh}
        >
          Ver los {points} puntos
          <span className="a-switch" aria-hidden="true" />
        </button>
      </div>

      {reading ? (
        <>
          <p className="a-facecheck-ok">
            Cara detectada: {points} puntos y 52 expresiones por cuadro
          </p>
          <div className="a-facecheck-grid">
            {READINGS.map((item, index) => (
              <Bar key={item.name} name={item.name} value={reading.values[index]} />
            ))}
            <Angle name="Giro de la cabeza" degrees={reading.angles.turn} />
            <Angle name="Inclinación" degrees={reading.angles.tilt} />
          </div>
        </>
      ) : (
        <p className="a-hint">No se ve la cara. Mira a la cámara con buena luz.</p>
      )}

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
