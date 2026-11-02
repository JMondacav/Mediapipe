import { useState } from "react";
import Icon from "./Icon";

const PIN_LENGTH = 4;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "delete"];

// Teclado numérico grande. Al completar los 4 dígitos llama a onComplete y
// se vacía solo. Con error=true los puntos se ponen rojos y tiemblan.
function PinPad({ onComplete, error = false, disabled = false }) {
  const [digits, setDigits] = useState("");

  const press = (key) => {
    if (disabled) {
      return;
    }

    if (key === "delete") {
      setDigits((current) => current.slice(0, -1));
      return;
    }

    const next = `${digits}${key}`.slice(0, PIN_LENGTH);
    setDigits(next);

    if (next.length === PIN_LENGTH) {
      // Pequeña pausa para que se vea el cuarto punto lleno.
      window.setTimeout(() => {
        setDigits("");
        onComplete(next);
      }, 160);
    }
  };

  return (
    <div className="a-center a-pinpad">
      <div className={`a-pin-dots ${error ? "a-pin--error" : ""}`} aria-hidden="true">
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span
            key={index}
            className={`a-pin-dot ${index < digits.length ? "is-filled" : ""}`}
          />
        ))}
      </div>

      <div className="a-keypad">
        {KEYS.map((key, index) =>
          key === "" ? (
            <span key={index} />
          ) : (
            <button
              key={key}
              className="a-key"
              onClick={() => press(key)}
              disabled={disabled}
              aria-label={key === "delete" ? "Borrar" : key}
            >
              {key === "delete" ? <Icon name="backspace" /> : key}
            </button>
          )
        )}
      </div>
    </div>
  );
}

export default PinPad;
