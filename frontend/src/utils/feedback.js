// Avisos que no dependen de leer: vibración, voz para la persona oyente y
// reconocimiento de voz para su respuesta.

import { synthesizeSpeech } from "../services/api";

// Perfil > Vibración. Encendida por defecto.
let vibrationEnabled = true;

export function setVibrationEnabled(enabled) {
  vibrationEnabled = enabled;
}

export function vibrate(pattern) {
  if (!vibrationEnabled) {
    return;
  }

  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Algunos navegadores (por ejemplo, en iPhone) no permiten vibrar.
  }
}

// Voz para la persona oyente: una voz neuronal (natural) que genera el
// backend. Nunca se usa la voz del navegador: si el audio no llega, hay
// silencio y un aviso en pantalla.

// El backend acepta hasta 500 caracteres por petición; queda margen.
const MAX_CHUNK_LENGTH = 480;

const AUDIO_ERROR = "No se pudo reproducir el audio. Inténtalo de nuevo.";
const AUDIO_BLOCKED = "El navegador no dejó reproducir el audio. Toca Escuchar para oírlo.";

// Perfil > Voz: "female" o "male".
let speechVoice = "female";

export function setSpeechVoice(voice) {
  speechVoice = voice;
}

// Un solo reproductor para toda la app. Safari solo deja sonar un audio si
// ese mismo elemento ya sonó durante un toque; como la voz tarda en llegar,
// se le hace sonar un silencio en el primer toque y en cada "Escuchar".
const player = typeof Audio === "undefined" ? null : new Audio();
let unlocked = false;
let silenceUrl = "";
let currentUrl = "";
// Cada speak() tiene su turno: el audio de un turno antiguo se descarta.
let turn = 0;
// Termina la espera del trozo que está sonando cuando empieza otro turno.
let finishPlaying = null;

// Estado para el aviso en pantalla (useSyncExternalStore):
// idle | loading | playing | error, con el mensaje del error.
let speechStatus = { status: "idle", message: "" };
const statusListeners = new Set();

function setSpeechStatus(status, message = "") {
  speechStatus = { status, message };
  statusListeners.forEach((listener) => listener());
}

export function getSpeechStatus() {
  return speechStatus;
}

export function onSpeechStatus(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

// 0,1 s de silencio en WAV (8 kHz, 8 bits, mono), sin archivos aparte.
function getSilenceUrl() {
  if (silenceUrl) {
    return silenceUrl;
  }

  const samples = 800;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const writeText = (offset, text) =>
    [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));

  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeText(36, "data");
  view.setUint32(40, samples, true);
  // Con 8 bits, el silencio es 128.
  new Uint8Array(buffer, 44).fill(128);

  silenceUrl = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
  return silenceUrl;
}

function markUnlocked() {
  unlocked = true;
  document.removeEventListener("pointerdown", unlockOnFirstTouch, true);
  document.removeEventListener("keydown", unlockOnFirstTouch, true);
}

function playSilence() {
  player.src = getSilenceUrl();
  player.play().then(markUnlocked, () => {
    // Fuera de un toque Safari no deja sonar ni el silencio; no es un error.
  });
}

// El primer toque en cualquier parte de la app desbloquea el reproductor, así
// la lectura automática de una traducción nueva (que no viene de un toque)
// también suena en iPhone.
function unlockOnFirstTouch() {
  if (!unlocked && player.paused) {
    playSilence();
  }
}

if (player) {
  document.addEventListener("pointerdown", unlockOnFirstTouch, true);
  document.addEventListener("keydown", unlockOnFirstTouch, true);
}

function releaseCurrentUrl() {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = "";
  }
}

// Detiene lo que suena y, si speak() viene de un toque, desbloquea el
// reproductor antes de esperar la red.
function stopAndPrime() {
  finishPlaying?.();
  finishPlaying = null;
  player.onended = null;
  player.onerror = null;
  player.pause();
  releaseCurrentUrl();
  playSilence();
}

// Parte el texto en trozos que acepta el backend, sin cortar palabras:
// primero al final de una oración, después en una coma y, si no queda otra,
// en un espacio. Así cada pregunta conserva su entonación.
function splitSpeech(text) {
  const chunks = [];
  let rest = text.replace(/\s+/g, " ").trim();

  while (rest.length > MAX_CHUNK_LENGTH) {
    const head = rest.slice(0, MAX_CHUNK_LENGTH + 1);
    const cut =
      lastBreak(head, /[.?!]\s/g) || lastBreak(head, /[,;:]\s/g) || lastBreak(head, /\s/g) ||
      MAX_CHUNK_LENGTH;

    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest) {
    chunks.push(rest);
  }

  return chunks;
}

// Posición donde termina el último corte posible (el signo queda en el trozo).
function lastBreak(text, pattern) {
  let cut = 0;

  for (const match of text.matchAll(pattern)) {
    cut = match.index + match[0].length - 1;
  }

  return cut;
}

function playBlob(blob, myTurn) {
  return new Promise((resolve, reject) => {
    releaseCurrentUrl();
    currentUrl = URL.createObjectURL(blob);
    finishPlaying = resolve;
    player.onended = () => resolve();
    player.onerror = () => reject(new Error(AUDIO_ERROR));
    player.src = currentUrl;
    player.play().then(() => {
      markUnlocked();

      if (myTurn === turn) {
        setSpeechStatus("playing");
      }
    }, reject);
  });
}

// Pide los trozos de a uno: mientras suena uno se descarga el siguiente, y
// nunca más de uno por adelantado.
async function playChunks(chunks, voice, myTurn) {
  let next = synthesizeSpeech(chunks[0], voice);

  for (let index = 0; index < chunks.length; index += 1) {
    const blob = await next;

    if (myTurn !== turn) {
      return;
    }

    next = index + 1 < chunks.length ? synthesizeSpeech(chunks[index + 1], voice) : null;
    // Si falla, el error se muestra al llegar a ese trozo.
    next?.catch(() => {});

    await playBlob(blob, myTurn);

    if (myTurn !== turn) {
      return;
    }
  }

  releaseCurrentUrl();
  setSpeechStatus("idle");
}

export function canSpeak() {
  return player !== null;
}

// Lee el texto en voz alta con la voz natural elegida en Perfil. Un nuevo
// speak() corta lo que estaba sonando o cargando.
export function speak(text) {
  if (!canSpeak() || !text) {
    return;
  }

  const chunks = splitSpeech(text);

  if (!chunks.length) {
    return;
  }

  turn += 1;
  const myTurn = turn;

  stopAndPrime();
  setSpeechStatus("loading");

  playChunks(chunks, speechVoice, myTurn).catch((error) => {
    if (myTurn !== turn) {
      return;
    }

    releaseCurrentUrl();
    setSpeechStatus(
      "error",
      error?.name === "NotAllowedError" ? AUDIO_BLOCKED : error?.message || AUDIO_ERROR
    );
  });
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
