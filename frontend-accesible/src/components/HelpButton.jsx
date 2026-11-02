import { Fragment, useEffect, useState } from "react";
import Icon from "./Icon";
import Modal from "./Modal";

const STEP_MS = 1300;

// Ayuda sin texto: el video en LSCh (public/senas/<videoId>.mp4) y, debajo,
// los pasos como íconos que se iluminan uno tras otro.
function HelpModal({ videoId, steps, onClose }) {
  const [active, setActive] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActive((current) => (current + 1) % steps.length);
    }, STEP_MS);

    return () => window.clearInterval(intervalId);
  }, [steps.length]);

  return (
    <Modal onClose={onClose} label="Ayuda">
      {videoId && !videoFailed && (
        <video
          className="a-help-video"
          src={`/senas/${videoId}.mp4`}
          autoPlay
          loop
          muted
          playsInline
          onError={() => setVideoFailed(true)}
        />
      )}

      <div className="a-steps">
        {steps.map((step, index) => (
          <Fragment key={`${step.icon}-${index}`}>
            {index > 0 && (
              <span className="a-step-arrow">
                <Icon name="next" />
              </span>
            )}
            <span
              className={`a-step a-c-${step.color} ${index === active ? "is-active" : ""}`}
            >
              <Icon name={step.icon} />
            </span>
          </Fragment>
        ))}
      </div>
    </Modal>
  );
}

function HelpButton({ videoId, steps }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="a-icon-btn a-icon-btn--solid a-c-amber"
        onClick={() => setOpen(true)}
        aria-label="Ayuda"
      >
        <Icon name="help" />
      </button>

      {open && (
        <HelpModal videoId={videoId} steps={steps} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

export default HelpButton;
