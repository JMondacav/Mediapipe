import { useCallback, useState } from "react";
import { newId } from "../utils/ids";

// Frases propias (por ejemplo "Mi dirección es…"). Se guardan solo en este
// navegador.
const STORAGE_KEY = "ensenas.myphrases";
const MAX_PHRASES = 30;

function readPhrases() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function writePhrases(phrases) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(phrases));
  } catch {
    // Sin almacenamiento: las frases duran esta visita.
  }
}

function useMyPhrases() {
  const [phrases, setPhrases] = useState(readPhrases);

  const add = useCallback((text) => {
    const clean = text.trim().slice(0, 200);

    setPhrases((current) => {
      if (!clean || current.some((phrase) => phrase.text === clean)) {
        return current;
      }

      const next = [{ id: newId(), text: clean }, ...current].slice(0, MAX_PHRASES);
      writePhrases(next);
      return next;
    });
  }, []);

  const remove = useCallback((id) => {
    setPhrases((current) => {
      const next = current.filter((phrase) => phrase.id !== id);
      writePhrases(next);
      return next;
    });
  }, []);

  return { phrases, add, remove };
}

export default useMyPhrases;
