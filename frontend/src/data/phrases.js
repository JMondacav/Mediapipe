// Frases frecuentes con pictograma (del diseño EnSeñas). La persona oyente
// las usa para comunicarse: cada una muestra el video de su seña, que va en
// public/senas/frases/<id>.mp4 (ver el LEEME.txt de esa carpeta). Los videos
// están pendientes: idealmente los graba una persona sorda o un intérprete.

export const CATEGORIES = [
  { id: "saludo", label: "Saludos" },
  { id: "ayuda", label: "Ayuda" },
  { id: "salud", label: "Salud" },
  { id: "compras", label: "Compras" },
  { id: "transporte", label: "Transporte" },
];

export const PHRASES = [
  { id: "hola", category: "saludo", icon: "hand", text: "Hola, ¿cómo estás?" },
  { id: "gracias", category: "saludo", icon: "heart", text: "Muchas gracias" },
  { id: "por-favor", category: "saludo", icon: "message-dots", text: "Por favor" },
  { id: "soy-sordo", category: "ayuda", icon: "ear", text: "Soy una persona sorda. Uso Lengua de Señas Chilena." },
  { id: "escribir", category: "ayuda", icon: "edit", text: "¿Puedes escribirlo, por favor?" },
  { id: "repetir", category: "ayuda", icon: "repeat", text: "¿Puedes repetir más despacio?" },
  { id: "no-entiendo", category: "ayuda", icon: "help", text: "No entiendo. ¿Me puedes ayudar?" },
  { id: "ayuda", category: "ayuda", icon: "alert-circle", text: "Necesito ayuda" },
  { id: "dolor", category: "salud", icon: "bandage", text: "Me duele aquí. Necesito atención médica." },
  { id: "medico", category: "salud", icon: "medkit", text: "Necesito hablar con un médico" },
  { id: "interprete", category: "salud", icon: "users", text: "Necesito un intérprete de lengua de señas" },
  { id: "precio", category: "compras", icon: "tag", text: "¿Cuánto cuesta?" },
  { id: "tarjeta", category: "compras", icon: "card", text: "¿Puedo pagar con tarjeta?" },
  { id: "bolsa", category: "compras", icon: "bag", text: "¿Me da una bolsa, por favor?" },
  { id: "donde", category: "transporte", icon: "pin", text: "¿Dónde queda esta dirección?" },
  { id: "paradero", category: "transporte", icon: "bus", text: "¿Dónde está el paradero?" },
];

// Inicio en modo Señas: frases para mostrar escritas a la persona oyente.
export const QUICK_PHRASE_IDS = ["soy-sordo", "escribir", "repetir", "no-entiendo", "ayuda", "interprete"];

// Inicio en modo Voz: frases cuya seña se muestra a la persona sorda.
export const QUICK_SIGN_PHRASE_IDS = ["hola", "gracias", "por-favor", "escribir", "repetir", "no-entiendo"];
