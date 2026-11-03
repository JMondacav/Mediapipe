import { useCallback, useEffect, useMemo, useState } from "react";
import { setSpeechVoice, setVibrationEnabled } from "../utils/feedback";
import { DEFAULT_SETTINGS, SettingsContext } from "./settings";

const STORAGE_KEY = "ensenas.settings";

function readSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Aplica las preferencias a toda la página: tamaño de texto, tema y modo de
// poca lectura van como variables y atributos en <html> (ver ensenas.css).
function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(readSettings);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--scale", String(settings.textScale));
    root.dataset.lowReading = String(settings.lowReading);

    if (settings.themeMode === "system") {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = settings.themeMode;
    }

    setVibrationEnabled(settings.haptics);
    setSpeechVoice(settings.voice);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Sin almacenamiento (modo privado): las preferencias duran esta visita.
    }
  }, [settings]);

  const update = useCallback((patch) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const value = useMemo(() => ({ settings, update }), [settings, update]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export default SettingsProvider;
