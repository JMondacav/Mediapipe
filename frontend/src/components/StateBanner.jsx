import Icon from "./Icon";

const ICONS = {
  idle: "circle",
  capturing: "radio-on",
  result: "check-circle",
  error: "alert-circle",
};

// Estado del traductor siempre visible. No depende solo del color: cada
// estado tiene su ícono y su texto, y se anuncia a lectores de pantalla.
function StateBanner({ status, label, hint }) {
  return (
    <div role={status === "error" ? "alert" : "status"} aria-live={status === "error" ? "assertive" : "polite"}>
      <div className="state-banner" data-status={status} key={status}>
        <span className="state-icon" aria-hidden="true">
          {status === "processing" ? <span className="spinner" /> : <Icon name={ICONS[status]} />}
        </span>
        <span className="state-texts">
          <span className="t-h3">{label}</span>
          <span className="t-caption">{hint}</span>
        </span>
      </div>
    </div>
  );
}

export default StateBanner;
