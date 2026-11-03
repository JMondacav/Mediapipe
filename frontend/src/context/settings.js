import { createContext, useContext } from "react";

// Preferencias de accesibilidad. Se guardan en este navegador.
export const DEFAULT_SETTINGS = {
  // 1 = normal, 1.15 = grande, 1.3 = muy grande
  textScale: 1,
  // Pictogramas más grandes y menos texto
  lowReading: false,
  // Vibración como aviso de cada cambio de estado (no depende del audio)
  haptics: true,
  // Lee en voz alta las señas traducidas, para la persona oyente
  autoSpeak: false,
  // Voz natural con que se leen las señas: "female" o "male"
  voice: "female",
  // "system" | "light" | "dark"
  themeMode: "system",
};

export const SettingsContext = createContext(null);

export function useSettings() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error("useSettings debe usarse dentro de SettingsProvider");
  }

  return context;
}
