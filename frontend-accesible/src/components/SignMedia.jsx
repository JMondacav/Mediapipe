import { useState } from "react";
import Icon from "./Icon";

// Muestra el video de una seña (public/senas/<videoId>.mp4) en bucle y sin
// sonido. Mientras carga, o si el video no existe todavía, se ve el ícono.
// Sin ícono y sin video, no muestra nada.
function SignMedia({ videoId, icon, className = "" }) {
  const [media, setMedia] = useState({ id: videoId, state: "loading" });
  const state = media.id === videoId ? media.state : "loading";

  if (!icon && state === "failed") {
    return null;
  }

  const hidden = !icon && state !== "ready";

  return (
    <div className={`a-media ${className} ${hidden ? "a-media--hidden" : ""}`}>
      {icon && <Icon name={icon} />}

      {videoId && state !== "failed" && (
        <video
          key={videoId}
          src={`/senas/${videoId}.mp4`}
          autoPlay
          loop
          muted
          playsInline
          style={{ opacity: state === "ready" ? 1 : 0 }}
          onLoadedData={() => setMedia({ id: videoId, state: "ready" })}
          onError={() => setMedia({ id: videoId, state: "failed" })}
        />
      )}
    </div>
  );
}

export default SignMedia;
