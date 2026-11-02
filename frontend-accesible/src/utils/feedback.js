// Avisos que no dependen de leer: vibración, voz para la persona oyente y
// reconocimiento de voz para su respuesta.

export function vibrate(pattern) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Algunos navegadores (por ejemplo, en iPhone) no permiten vibrar.
  }
}

export function canSpeak() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Lee el texto en voz alta con la voz en español del navegador.
export function speak(text) {
  if (!canSpeak() || !text) {
    return;
  }

  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = synth.getVoices();
  const voice =
    voices.find((item) => item.lang?.toLowerCase().startsWith("es-cl")) ||
    voices.find((item) => item.lang?.toLowerCase().startsWith("es"));

  utterance.lang = voice?.lang || "es-CL";
  if (voice) {
    utterance.voice = voice;
  }
  utterance.rate = 0.95;

  synth.cancel();
  synth.speak(utterance);
}

export function getSpeechRecognition() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// "Gracias" -> "palabras/gracias"; sin tildes, la ñ queda como n.
export function videoIdForWord(word) {
  const slug = String(word || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug ? `palabras/${slug}` : "";
}
