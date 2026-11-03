import { useState, useSyncExternalStore } from "react";
import useOnline from "../hooks/useOnline";
import { getSpeechStatus, onSpeechStatus } from "../utils/feedback";
import Icon from "./Icon";

// Piezas básicas del diseño EnSeñas (botones, avisos, pictogramas, selectores).
// Todas con área táctil de 48 px o más, etiqueta para lectores de pantalla y
// foco visible.

// Contenedor de cada pantalla: ancho máximo legible y aviso sin internet.
export function Screen({ children, tabs = true }) {
  return (
    <main className={`screen ${tabs ? "screen--tabs" : ""}`}>
      <OfflineBanner />
      {children}
    </main>
  );
}

export function Button({
  label,
  onClick,
  variant = "primary",
  size = "md",
  icon,
  hint,
  disabled,
  loading,
  type = "button",
  ariaLabel,
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size}`}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-description={hint}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon && <Icon name={icon} />}
      <span>{label}</span>
    </button>
  );
}

// Ícono lineal dentro de un círculo suave. Es decorativo: la etiqueta la lleva
// el control que lo contiene.
export function Picto({ name, size = 56, tone = "primary" }) {
  return (
    <span
      className={`picto ${tone === "accent" ? "picto--accent" : ""}`}
      style={{ "--size": `${size}px` }}
      aria-hidden="true"
    >
      <Icon name={name} />
    </span>
  );
}

export function Logo({ size = 96 }) {
  return (
    <img className="logo" src="/logo.png" width={size} height={size} alt="Logo de EnSeñas" />
  );
}

export function Notice({ icon = "lock", children }) {
  return (
    <div className="notice">
      <Icon name={icon} />
      <p>{children}</p>
    </div>
  );
}

// Aviso de falta de internet: la traducción necesita el servidor.
export function OfflineBanner() {
  const online = useOnline();

  if (online) {
    return null;
  }

  return (
    <div className="offline" role="alert">
      <Icon name="wifi-off" />
      Sin internet. Algunas funciones no están disponibles.
    </div>
  );
}

// Interruptor con toda la fila como área táctil.
export function SettingRow({ icon, label, description, value, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      className="setting-row"
      onClick={() => onChange(!value)}
      disabled={disabled}
    >
      {icon && <Icon name={icon} />}
      <span className="setting-texts">
        <span className="t-label">{label}</span>
        {description && <span className="t-caption t-muted">{description}</span>}
      </span>
      <span className="toggle" aria-hidden="true" />
    </button>
  );
}

// Selector de una opción, con marca visual (✓) en la elegida.
export function Segmented({ options, value, onChange, label, disabled }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            className="segmented-item"
            onClick={() => onChange(option.value)}
            disabled={disabled}
          >
            {option.icon && <Icon name={option.icon} />}
            {selected ? "✓ " : ""}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Tarjeta grande para elegir cómo se comunica la persona.
export function RoleCard({ icon, title, subtitle, tone = "primary", selected, onClick, hint, compact }) {
  return (
    <button
      type="button"
      className={`role-card ${tone === "accent" ? "role-card--accent" : ""} ${
        compact ? "role-card--compact" : ""
      }`}
      aria-pressed={selected}
      aria-description={hint}
      onClick={onClick}
    >
      <span className="role-circle" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="role-texts">
        <span className={compact ? "t-h3" : "t-h1"}>
          {selected ? "✓ " : ""}
          {title}
        </span>
        <span className="t-body">{subtitle}</span>
      </span>
    </button>
  );
}

// Frase con pictograma. En modo poca lectura el pictograma crece y el texto se
// acorta a dos líneas.
export function PhraseCard({ text, icon, onClick, hint }) {
  return (
    <button type="button" className="phrase-card" onClick={onClick} aria-description={hint}>
      <Picto name={icon} />
      <span>{text}</span>
    </button>
  );
}

export function Field({ label, multiline, ...input }) {
  const Control = multiline ? "textarea" : "input";

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <Control className="input" {...input} />
    </label>
  );
}

const SPEECH_COPY = {
  loading: { icon: "hourglass", text: "Cargando audio…" },
  playing: { icon: "speaker", text: "Sonando en voz alta" },
};

// Estado de la voz para la persona oyente. La persona sorda no oye si el
// teléfono ya está hablando, así que se lo mostramos. Un error queda a la
// vista hasta cerrarlo o hasta la próxima lectura.
export function SpeechBanner() {
  const speech = useSyncExternalStore(onSpeechStatus, getSpeechStatus);
  const [dismissed, setDismissed] = useState(null);
  const visible = speech.status !== "idle" && speech !== dismissed;
  const copy = SPEECH_COPY[speech.status];

  return (
    <div className="speech-banner-wrap" aria-live="polite">
      {visible && speech.status === "error" && (
        <div className="speech-banner speech-banner--error" role="alert">
          <Icon name="alert-circle" />
          <p>{speech.message}</p>
          <button
            type="button"
            className="speech-banner-close"
            aria-label="Cerrar aviso"
            onClick={() => setDismissed(speech)}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {visible && copy && (
        <div className={`speech-banner speech-banner--${speech.status}`}>
          <Icon name={copy.icon} />
          <p>{copy.text}</p>
        </div>
      )}
    </div>
  );
}
