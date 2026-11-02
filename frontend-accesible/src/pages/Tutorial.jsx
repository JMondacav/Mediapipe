import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import HandCamera from "../components/HandCamera";
import HandIllustration from "../components/HandIllustration";
import HelpButton from "../components/HelpButton";
import Icon from "../components/Icon";
import SignMedia from "../components/SignMedia";
import { normalizeLabel } from "../utils/labels";
import { predictSign } from "../services/api";
import { vibrate } from "../utils/feedback";

const PRACTICE_CONFIDENCE = 0.72;
// Cada estrella confirma la forma; con 400 ms bastan ~1 s sosteniéndola.
const PRACTICE_INTERVAL_MS = 400;
const STARS = 3;

// Práctica sin texto: eliges la seña por su dibujo, la imitas frente a la
// cámara y las estrellas se llenan mientras la sostienes bien.
const SIGNS = [
  { id: "A", label: "A", aliases: ["A"], videoId: "letra-a" },
  { id: "L", label: "L", aliases: ["L"], videoId: "letra-l" },
  { id: "U", label: "U", aliases: ["U"], videoId: "letra-u" },
  { id: "ILY", label: "🤟", aliases: ["TE QUIERO", "TEQUIERO", "ILY"], videoId: "letra-ily" },
];

const HELP_GRID = [
  { icon: "hand", color: "green" },
  { icon: "camera", color: "green" },
  { icon: "star", color: "amber" },
];

function Practice({ sign, onBack, onNext }) {
  const [streak, setStreak] = useState(0);
  const [handVisible, setHandVisible] = useState(false);
  const isPredictingRef = useRef(false);
  const lastRequestTimeRef = useRef(0);
  const done = streak >= STARS;

  const handleLandmarks = useCallback(
    async (landmarks) => {
      if (done || !landmarks || landmarks.length < 21) {
        return;
      }

      const now = Date.now();

      if (isPredictingRef.current || now - lastRequestTimeRef.current < PRACTICE_INTERVAL_MS) {
        return;
      }

      isPredictingRef.current = true;
      lastRequestTimeRef.current = now;

      try {
        const prediction = await predictSign(landmarks);
        const label = normalizeLabel(prediction?.label);
        const matched =
          sign.aliases.map(normalizeLabel).includes(label) &&
          (prediction?.confidence ?? 0) >= PRACTICE_CONFIDENCE;

        const next = matched ? Math.min(streak + 1, STARS) : 0;
        setStreak(next);

        if (next === STARS) {
          vibrate([100, 60, 160]);
        }
      } catch (error) {
        console.error(error);
      } finally {
        isPredictingRef.current = false;
      }
    },
    [done, sign, streak]
  );

  return (
    <main className="a-screen">
      <header className="a-topbar">
        <button className="a-icon-btn" onClick={onBack} aria-label="Volver">
          <Icon name="back" />
        </button>
        <span className="a-sign-letter">{sign.label}</span>
        <HelpButton videoId="ayuda-practica" steps={HELP_GRID} />
      </header>

      <section
        className="a-camera"
        data-phase={done ? "success" : streak > 0 ? "confirming" : handVisible ? "hand" : "nohand"}
      >
        <HandCamera
          isRunning
          onLandmarksDetected={handleLandmarks}
          onFrame={(frame) => setHandVisible(frame.hands.length > 0)}
          showStatus={false}
        />

        <div className="a-practice-ref">
          <SignMedia videoId={sign.videoId} className="a-practice-video" />
          <HandIllustration signId={sign.id} />
        </div>

        {done && (
          <div className="a-success">
            <span className="a-success-badge">
              <Icon name="check" />
            </span>
          </div>
        )}
      </section>

      <div className="a-stars" aria-label={`${streak} de ${STARS}`}>
        {Array.from({ length: STARS }, (_, index) => (
          <span key={index} className={`a-star ${index < streak ? "is-on" : ""}`}>
            <Icon name="star" filled />
          </span>
        ))}
      </div>

      <div className="a-row">
        <button
          className="a-icon-btn a-icon-btn--soft a-c-gray"
          onClick={() => setStreak(0)}
          aria-label="Repetir"
        >
          <Icon name="repeat" />
        </button>
        <button
          className="a-icon-btn a-icon-btn--lg a-icon-btn--solid a-c-green"
          onClick={onNext}
          aria-label="Siguiente seña"
        >
          <Icon name="next" />
        </button>
      </div>
    </main>
  );
}

function Tutorial() {
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(null);

  if (selectedIndex !== null) {
    const sign = SIGNS[selectedIndex];

    return (
      <Practice
        key={sign.id}
        sign={sign}
        onBack={() => setSelectedIndex(null)}
        onNext={() => setSelectedIndex((selectedIndex + 1) % SIGNS.length)}
      />
    );
  }

  return (
    <main className="a-screen">
      <header className="a-topbar">
        <button className="a-icon-btn" onClick={() => navigate("/menu")} aria-label="Volver al menú">
          <Icon name="back" />
        </button>
        <span className="a-screen-icon a-c-green">
          <Icon name="hand" />
        </span>
        <HelpButton videoId="ayuda-practica" steps={HELP_GRID} />
      </header>

      <section className="a-sign-grid">
        {SIGNS.map((sign, index) => (
          <button
            key={sign.id}
            className="a-sign-card"
            onClick={() => setSelectedIndex(index)}
            aria-label={`Practicar ${sign.aliases[0]}`}
          >
            <HandIllustration signId={sign.id} />
            <span className="a-sign-letter">{sign.label}</span>
          </button>
        ))}
      </section>
    </main>
  );
}

export default Tutorial;
