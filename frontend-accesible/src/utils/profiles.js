// Perfiles guardados en este dispositivo: cada persona entra tocando su
// animal y escribiendo un PIN de 4 números, sin tener que leer ni escribir.
// Por debajo es una cuenta normal del backend: el usuario se genera solo
// (por ejemplo "zorro-4821") y la contraseña sale del PIN.

const PROFILES_KEY = "ensenavos_profiles";
const CURRENT_KEY = "ensenavos_current_profile";

export const AVATARS = [
  { id: "perro", emoji: "🐶", color: "#d97706", soft: "#fef3c7" },
  { id: "gato", emoji: "🐱", color: "#db2777", soft: "#fce7f3" },
  { id: "zorro", emoji: "🦊", color: "#ea580c", soft: "#ffedd5" },
  { id: "panda", emoji: "🐼", color: "#334155", soft: "#e2e8f0" },
  { id: "rana", emoji: "🐸", color: "#16a34a", soft: "#dcfce7" },
  { id: "leon", emoji: "🦁", color: "#ca8a04", soft: "#fef9c3" },
  { id: "conejo", emoji: "🐰", color: "#9333ea", soft: "#f3e8ff" },
  { id: "oso", emoji: "🐻", color: "#92400e", soft: "#fde68a" },
  { id: "pinguino", emoji: "🐧", color: "#0f766e", soft: "#ccfbf1" },
  { id: "pulpo", emoji: "🐙", color: "#e11d48", soft: "#ffe4e6" },
  { id: "tortuga", emoji: "🐢", color: "#65a30d", soft: "#ecfccb" },
  { id: "ballena", emoji: "🐳", color: "#2563eb", soft: "#dbeafe" },
];

export function getAvatar(avatarId) {
  return AVATARS.find((avatar) => avatar.id === avatarId) || null;
}

export function readProfiles() {
  try {
    const profiles = JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
    return Array.isArray(profiles) ? profiles : [];
  } catch {
    return [];
  }
}

export function saveProfile(profile) {
  const others = readProfiles().filter((item) => item.username !== profile.username);
  localStorage.setItem(PROFILES_KEY, JSON.stringify([profile, ...others]));
}

export function setCurrentProfile(username) {
  localStorage.setItem(CURRENT_KEY, username);
}

export function clearCurrentProfile() {
  localStorage.removeItem(CURRENT_KEY);
}

export function getCurrentAvatar() {
  const username = localStorage.getItem(CURRENT_KEY);
  const profile = readProfiles().find((item) => item.username === username);
  return profile ? getAvatar(profile.avatarId) : null;
}

export function newUsername(avatarId) {
  return `${avatarId}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// El backend pide al menos 6 caracteres de contraseña.
export function pinToPassword(pin) {
  return `ev-pin-${pin}`;
}
