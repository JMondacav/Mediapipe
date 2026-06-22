import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HandCamera from "../components/HandCamera";
import AppBottomNav from "../components/AppBottomNav";
import { predictSign } from "../services/api";
import "../App.css";

const PRACTICE_CONFIDENCE = 0.72;
const PRACTICE_INTERVAL_MS = 700;

const SIGNS = [
  {
    id: "A",
    label: "A",
    title: "Letra A",
    shape: "Puno cerrado",
    aliases: ["A"],
    steps: [
      "Cierra los cuatro dedos hacia la palma.",
      "Deja el pulgar apoyado al costado del indice.",
      "Muestra el dorso de la mano hacia la camara.",
    ],
    tip: "El pulgar debe verse al costado, no escondido dentro del puno.",
  },
  {
    id: "L",
    label: "L",
    title: "Letra L",
    shape: "Indice y pulgar extendidos",
    aliases: ["L"],
    steps: [
      "Levanta el indice completamente.",
      "Estira el pulgar hacia el lado para formar un angulo recto.",
      "Manten medio, anular y menique cerrados.",
    ],
    tip: "La camara reconoce mejor la L cuando el indice queda vertical.",
  },
  {
    id: "U",
    label: "U",
    title: "Letra U",
    shape: "Dos dedos juntos",
    aliases: ["U"],
    steps: [
      "Extiende indice y medio hacia arriba.",
      "Manten ambos dedos juntos, sin separarlos como una V.",
      "Cierra anular, menique y pulgar.",
    ],
    tip: "Si separas mucho los dedos, el modelo puede leer otra sena.",
  },
  {
    id: "ILY",
    label: "ILY",
    title: "Te quiero",
    shape: "Pulgar, indice y menique",
    aliases: ["TE QUIERO", "TEQUIERO", "ILY"],
    steps: [
      "Extiende indice, pulgar y menique.",
      "Dobla medio y anular hacia la palma.",
      "Orienta la palma hacia la camara.",
    ],
    tip: "Sosten la forma un momento para que el detector confirme.",
  },
];

function normalizeLabel(label) {
  const normalized = String(label || "")
    .trim()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .toUpperCase();

  if (normalized === "TEQUIERO") return "TE QUIERO";
  return normalized;
}

function SvgBase({ children }) {
  return (
    <svg
      className="sign-illustration"
      viewBox="0 0 220 220"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="skinMain" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffe1bf" />
          <stop offset="62%" stopColor="#f5b77f" />
          <stop offset="100%" stopColor="#e59a63" />
        </linearGradient>
        <linearGradient id="skinSoft" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffe8cf" />
          <stop offset="100%" stopColor="#f0aa73" />
        </linearGradient>
      </defs>
      <rect className="sign-glow" x="18" y="18" width="184" height="184" rx="48" />
      {children}
    </svg>
  );
}

function ExtendedFinger({ x, y, width = 27, height = 112, rotate = 0 }) {
  return (
    <g transform={`rotate(${rotate} ${x + width / 2} ${y + height})`}>
      <rect
        className="sign-finger"
        x={x}
        y={y}
        width={width}
        height={height}
        rx={width / 2}
      />
      <line
        className="sign-crease"
        x1={x + 6}
        y1={y + height * 0.42}
        x2={x + width - 6}
        y2={y + height * 0.42}
      />
      <line
        className="sign-crease"
        x1={x + 6}
        y1={y + height * 0.66}
        x2={x + width - 6}
        y2={y + height * 0.66}
      />
    </g>
  );
}

function FoldedKnuckle({ x, y, width = 32, height = 42, rotate = 0 }) {
  return (
    <g transform={`rotate(${rotate} ${x + width / 2} ${y + height / 2})`}>
      <rect
        className="sign-knuckle"
        x={x}
        y={y}
        width={width}
        height={height}
        rx="14"
      />
      <path
        className="sign-crease"
        d={`M${x + 7} ${y + 17} C${x + width / 2} ${y + 23} ${x + width - 7} ${y + 17} ${x + width - 7} ${y + 17}`}
      />
    </g>
  );
}

function Palm() {
  return (
    <>
      <path
        className="sign-palm"
        d="M67 92 C67 75 82 63 104 63 H121 C144 63 159 78 159 101 V153 C159 183 141 203 113 203 C84 203 63 183 63 153 V106 C63 100 64 96 67 92 Z"
      />
      <path
        className="sign-palm-line"
        d="M82 139 C99 132 122 133 141 145"
      />
      <path
        className="sign-palm-line"
        d="M86 164 C104 174 125 174 142 163"
      />
    </>
  );
}

function ThumbSide() {
  return (
    <path
      className="sign-thumb"
      d="M151 104 C171 111 181 126 176 141 C172 154 158 154 150 143 C143 133 139 119 142 111 C144 106 147 104 151 104 Z"
    />
  );
}

function ThumbOpen() {
  return (
    <path
      className="sign-thumb"
      d="M66 112 C48 102 35 88 31 76 C28 66 35 58 44 62 C58 68 72 83 82 99 C88 109 78 119 66 112 Z"
    />
  );
}

function ThumbAcross() {
  return (
    <path
      className="sign-thumb"
      d="M74 129 C94 114 124 110 146 121 C156 126 156 139 146 145 C126 157 94 153 73 142 C65 138 66 134 74 129 Z"
    />
  );
}

function HandA() {
  return (
    <SvgBase>
      <FoldedKnuckle x={70} y={64} width={28} height={48} rotate={-5} />
      <FoldedKnuckle x={95} y={58} width={30} height={54} />
      <FoldedKnuckle x={122} y={62} width={29} height={50} rotate={5} />
      <FoldedKnuckle x={148} y={78} width={24} height={38} rotate={11} />
      <Palm />
      <ThumbSide />
    </SvgBase>
  );
}

function HandL() {
  return (
    <SvgBase>
      <ExtendedFinger x={86} y={21} width={29} height={122} />
      <FoldedKnuckle x={115} y={86} width={30} height={45} rotate={5} />
      <FoldedKnuckle x={141} y={94} width={27} height={38} rotate={12} />
      <FoldedKnuckle x={67} y={91} width={26} height={40} rotate={-10} />
      <Palm />
      <ThumbOpen />
    </SvgBase>
  );
}

function HandU() {
  return (
    <SvgBase>
      <ExtendedFinger x={81} y={22} width={28} height={121} rotate={-1} />
      <ExtendedFinger x={110} y={22} width={28} height={121} rotate={1} />
      <FoldedKnuckle x={139} y={92} width={27} height={40} rotate={10} />
      <FoldedKnuckle x={61} y={97} width={25} height={36} rotate={-10} />
      <Palm />
      <ThumbAcross />
    </SvgBase>
  );
}

function HandIly() {
  return (
    <SvgBase>
      <ExtendedFinger x={84} y={24} width={29} height={119} />
      <ExtendedFinger x={143} y={43} width={25} height={99} rotate={13} />
      <FoldedKnuckle x={113} y={86} width={29} height={45} rotate={5} />
      <FoldedKnuckle x={60} y={96} width={25} height={37} rotate={-11} />
      <Palm />
      <ThumbOpen />
    </SvgBase>
  );
}

function HandReference({ signId }) {
  const illustrations = {
    A: <HandA />,
    L: <HandL />,
    U: <HandU />,
    ILY: <HandIly />,
  };

  return <div className="hand-reference">{illustrations[signId] || <HandA />}</div>;
}

function Tutorial() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(SIGNS[0].id);
  const [mode, setMode] = useState("guide");
  const [practiceState, setPracticeState] = useState({
    label: "Sin lectura",
    confidence: 0,
    streak: 0,
    matched: false,
    message: "Muestra la sena frente a la camara.",
  });

  const isPredictingRef = useRef(false);
  const lastRequestTimeRef = useRef(0);

  const selectedSign = useMemo(
    () => SIGNS.find((sign) => sign.id === selectedId) || SIGNS[0],
    [selectedId]
  );

  const expectedLabels = useMemo(
    () => selectedSign.aliases.map((alias) => normalizeLabel(alias)),
    [selectedSign]
  );

  const resetPractice = useCallback(() => {
    isPredictingRef.current = false;
    lastRequestTimeRef.current = 0;
    setPracticeState({
      label: "Sin lectura",
      confidence: 0,
      streak: 0,
      matched: false,
      message: "Muestra la sena frente a la camara.",
    });
  }, []);

  const selectSign = (signId) => {
    setSelectedId(signId);
    resetPractice();
  };

  const handlePracticeLandmarks = useCallback(
    async (landmarks) => {
      if (mode !== "practice" || !landmarks || landmarks.length < 21) {
        return;
      }

      const now = Date.now();

      if (
        isPredictingRef.current ||
        now - lastRequestTimeRef.current < PRACTICE_INTERVAL_MS
      ) {
        return;
      }

      isPredictingRef.current = true;
      lastRequestTimeRef.current = now;

      try {
        const prediction = await predictSign(landmarks);
        const label = normalizeLabel(prediction?.label);
        const confidence = prediction?.confidence ?? 0;
        const matched =
          expectedLabels.includes(label) && confidence >= PRACTICE_CONFIDENCE;

        setPracticeState((prev) => {
          const streak = matched ? Math.min(prev.streak + 1, 3) : 0;
          const message =
            streak >= 3
              ? "Correcto. Mantienes la forma de manera estable."
              : matched
                ? "Bien. Sosten la sena un poco mas."
                : "Ajusta la posicion y compara con la referencia.";

          return {
            label: label || "Sin lectura",
            confidence,
            streak,
            matched,
            message,
          };
        });
      } catch (error) {
        console.error(error);
        setPracticeState((prev) => ({
          ...prev,
          matched: false,
          message: error.message || "No se pudo leer la sena.",
        }));
      } finally {
        isPredictingRef.current = false;
      }
    },
    [expectedLabels, mode]
  );

  const confidencePercent = Math.round(practiceState.confidence * 100);
  const progressPercent = Math.round((practiceState.streak / 3) * 100);

  return (
    <main className="tutorial-page">
      <section className="tutorial-phone refined">
        <header className="tutorial-topbar refined">
          <button
            className="tutorial-back-button"
            onClick={() => navigate("/menu")}
          >
            {"<"}
          </button>

          <div>
            <p>{"Ense\u00f1aVos"}</p>
            <h1>{mode === "guide" ? "Guia" : "Practica"}</h1>
          </div>

          <button
            className="tutorial-practice-button"
            onClick={() => {
              setMode((currentMode) =>
                currentMode === "guide" ? "practice" : "guide"
              );
              resetPractice();
            }}
          >
            {mode === "guide" ? "Practicar" : "Guia"}
          </button>
        </header>

        <section className="tutorial-mode-switch">
          <button
            className={mode === "guide" ? "active" : ""}
            onClick={() => setMode("guide")}
          >
            Guia
          </button>
          <button
            className={mode === "practice" ? "active" : ""}
            onClick={() => {
              setMode("practice");
              resetPractice();
            }}
          >
            Practica
          </button>
        </section>

        <section className="tutorial-tabs refined" aria-label="Seleccionar sena">
          {SIGNS.map((sign) => (
            <button
              key={sign.id}
              className={sign.id === selectedId ? "active" : ""}
              onClick={() => selectSign(sign.id)}
            >
              {sign.label}
            </button>
          ))}
        </section>

        {mode === "guide" ? (
          <>
            <section className="tutorial-stage refined">
              <div className="tutorial-hand-card refined">
                <HandReference signId={selectedSign.id} />
              </div>

              <div className="tutorial-copy refined">
                <p className="retro-small-label">{selectedSign.shape}</p>
                <h2>{selectedSign.title}</h2>
                <p>{selectedSign.tip}</p>
              </div>
            </section>

            <section className="tutorial-steps refined">
              {selectedSign.steps.map((step, index) => (
                <article key={step} className="tutorial-step">
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </article>
              ))}
            </section>
          </>
        ) : (
          <>
            <section className="practice-stage">
              <div className="practice-camera">
                <HandCamera
                  isRunning
                  onLandmarksDetected={handlePracticeLandmarks}
                  readyMessage="Camara lista. Muestra la sena seleccionada."
                />

                <div className="practice-reference">
                  <HandReference signId={selectedSign.id} />
                  <strong>{selectedSign.label}</strong>
                </div>
              </div>

              <div
                className={
                  practiceState.streak >= 3
                    ? "practice-readout success"
                    : "practice-readout"
                }
              >
                <div>
                  <p className="home-label">Objetivo</p>
                  <h2>{selectedSign.title}</h2>
                </div>

                <div className="practice-metrics">
                  <div>
                    <span>Lectura</span>
                    <strong>{practiceState.label}</strong>
                  </div>
                  <div>
                    <span>Confianza</span>
                    <strong>{confidencePercent}%</strong>
                  </div>
                </div>

                <div className="practice-progress">
                  <span style={{ width: `${progressPercent}%` }}></span>
                </div>

                <p>{practiceState.message}</p>
              </div>
            </section>

            <section className="practice-hints">
              {selectedSign.steps.map((step, index) => (
                <span key={step}>
                  {index + 1}. {step}
                </span>
              ))}
            </section>
          </>
        )}
        <AppBottomNav />
      </section>
    </main>
  );
}

export default Tutorial;
