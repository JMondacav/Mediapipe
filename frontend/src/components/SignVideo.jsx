import { useEffect, useRef, useState } from "react";
import { Picto } from "./ui";

// Video de la seña de una frase (public/senas/frases/<id>.mp4), en bucle y
// sin sonido; `rate` lo hace más lento para aprender. Mientras el video no
// exista, se ve el aviso de contenido pendiente con el pictograma de la frase.
function SignVideo({ id, icon = "video", rate = 1 }) {
  const videoRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  }, [rate]);

  if (failed) {
    return (
      <div className="video-placeholder" role="img" aria-label="Video de la seña: aún no disponible">
        <Picto name={icon} size={64} />
        <p className="t-caption t-muted t-center">Video de la seña en LSCh: pendiente de contenido</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className="sign-video"
      src={`/senas/frases/${id}.mp4`}
      autoPlay
      loop
      muted
      playsInline
      aria-label="Video de la seña en LSCh"
      onLoadedData={(event) => {
        event.currentTarget.playbackRate = rate;
      }}
      onError={() => setFailed(true)}
    />
  );
}

export default SignVideo;
