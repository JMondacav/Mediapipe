import Icon from "./Icon";

// Guía de encuadre sobre la cámara: contorno de cabeza y hombros, marco para
// las manos y un recordatorio de luz. Solo es un dibujo encima del video.
function CameraGuide() {
  return (
    <div className="camera-guide" aria-hidden="true">
      <span className="camera-guide-head" />
      <span className="camera-guide-hands" />
      <span className="camera-guide-chip">
        <span>
          <Icon name="sun" />
          Busca buena luz y muestra tus manos en el marco
        </span>
      </span>
    </div>
  );
}

export default CameraGuide;
