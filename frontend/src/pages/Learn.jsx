import { Screen } from "../components/ui";
import LearnSigns from "./learn/LearnSigns";

// Aprender: las señas de las frases frecuentes en video.
function Learn() {
  return (
    <Screen>
      <h1 className="t-h1">Aprender</h1>
      <LearnSigns />
    </Screen>
  );
}

export default Learn;
