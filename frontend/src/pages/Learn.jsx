import { useSearchParams } from "react-router-dom";
import { Screen, Segmented } from "../components/ui";
import LearnSigns from "./learn/LearnSigns";
import SignRecorder from "./learn/SignRecorder";

// Aprender: las señas de las frases frecuentes en video y, para el equipo,
// grabar señas (escribir la palabra y grabar su seña para que el modelo la
// aprenda).
const SECTIONS = [
  { value: "aprender", label: "Aprender señas", icon: "video" },
  { value: "grabar", label: "Grabar señas", icon: "record" },
];

function Learn() {
  const [params, setParams] = useSearchParams();
  const section = params.get("seccion") === "grabar" ? "grabar" : "aprender";

  return (
    <Screen>
      <h1 className="t-h1">Aprender</h1>
      <Segmented
        label="Qué quieres hacer"
        value={section}
        onChange={(value) => setParams({ seccion: value }, { replace: true })}
        options={SECTIONS}
      />

      {section === "aprender" ? <LearnSigns /> : <SignRecorder />}
    </Screen>
  );
}

export default Learn;
