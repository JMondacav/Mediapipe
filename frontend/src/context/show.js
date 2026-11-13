import { createContext, useContext } from "react";

// show({ text, icon }) o show({ items }) abre el mensaje en pantalla completa.
// show({ text, icon, video }) muestra además el video de la seña de la frase.
export const ShowContext = createContext(null);

export function useShow() {
  const show = useContext(ShowContext);

  if (!show) {
    throw new Error("useShow debe usarse dentro de ShowProvider");
  }

  return show;
}
