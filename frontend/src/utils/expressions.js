// Expresiones faciales que acompañan a las señas. Las etiquetas son las que
// aprende el modelo de expresiones del backend.
// La app no cambia ni agrega palabras: solo marca con qué expresión se
// dijeron (por ejemplo, cejas arriba = pregunta).

export const NEUTRAL_LABEL = "NEUTRAL";

export const EXPRESSIONS = {
  PREGUNTA: {
    emoji: "🤨",
    name: "Pregunta",
    hint: "Cejas arriba: pregunta de sí o no",
    tone: "amber",
    speech: "question",
  },
  PREGUNTA_QU: {
    emoji: "🧐",
    name: "Pregunta abierta",
    hint: "Cejas juntas: qué, quién, dónde, cuándo",
    tone: "amber",
    speech: "question",
  },
  NEGACION: {
    emoji: "🙅",
    name: "Negación",
    hint: "Mover la cabeza de lado a lado",
    tone: "red",
    speech: "no",
  },
  AFIRMACION: {
    emoji: "🙆",
    name: "Afirmación",
    hint: "Asentir con la cabeza",
    tone: "green",
    speech: "sí",
  },
  INTENSIDAD: {
    emoji: "😤",
    name: "Intensidad",
    hint: "Mejillas infladas o labios apretados: mucho, muy",
    tone: "purple",
    speech: "exclamation",
  },
};

export const NEUTRAL_INFO = {
  emoji: "😐",
  name: "Neutral",
  hint: "Cara normal: haz distintas señas, habla o mira a los lados",
  tone: "gray",
};

// Las que se sugieren al grabar, en este orden.
export const SUGGESTED_EXPRESSIONS = [NEUTRAL_LABEL, ...Object.keys(EXPRESSIONS)];

function readableName(label) {
  const text = label.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Cómo se muestra una expresión. Las que el equipo grabe con otro nombre
// también se muestran, con un ícono genérico.
export function expressionInfo(label) {
  if (!label) {
    return null;
  }

  if (label === NEUTRAL_LABEL) {
    return NEUTRAL_INFO;
  }

  return (
    EXPRESSIONS[label] || {
      emoji: "🙂",
      name: readableName(label),
      hint: "",
      tone: "blue",
      speech: null,
    }
  );
}

// Palabras seguidas con la misma expresión van juntas, como en la glosa de
// lengua de señas, donde la marca de la cara se escribe sobre todas las
// señas que acompaña. Una expresión sin seña queda sola.
export function groupByExpression(items) {
  const groups = [];

  items.forEach((item, index) => {
    const entry = { ...item, index };
    const alone = item.kind === "expression";
    const last = groups[groups.length - 1];

    if (!alone && item.expression && last && !last.alone && last.expression === item.expression) {
      last.items.push(entry);
    } else {
      groups.push({ expression: item.expression || null, alone, items: [entry] });
    }
  });

  return groups;
}

// Cómo se escribe cada seña dentro de la frase: con tildes y, si la seña
// misma es una pregunta, con sus signos. No se agregan ni cambian palabras.
// Las señas que no están aquí se escriben en minúsculas, tal cual.
const WRITTEN_SIGNS = {
  HOLA: "hola",
  ADIOS: "adiós",
  "ADIÓS": "adiós",
  COMO: "cómo",
  "COMO ESTAS": "¿cómo estás?",
  "CÓMO ESTÁS": "¿cómo estás?",
  "COMO TE LLAMAS": "¿cómo te llamas?",
  "CÓMO TE LLAMAS": "¿cómo te llamas?",
  GRACIAS: "gracias",
  "NOS VEMOS": "nos vemos",
  "ME DUELE": "me duele",
  "DEJAME PENSAR": "déjame pensar",
  "TE QUIERO": "te quiero",
  TU: "tú",
  "CUANTO CUESTA": "¿cuánto cuesta?",
  "CUÁNTO CUESTA": "¿cuánto cuesta?",
  "CUANTO CUESTA LA HORA": "¿cuánto cuesta la hora?",
  "CUÁNTO CUESTA LA HORA": "¿cuánto cuesta la hora?",
};

// HOLA y ADIÓS se hacen con la misma seña (el modelo la aprende como HOLA).
// Se decide por el lugar donde quedó:
// - al final de la frase (o seguida solo de NOS VEMOS) es ADIOS;
// - al comienzo o en medio es HOLA;
// - sola, sin otras palabras: HOLA si la conversación recién empieza y
//   ADIOS si ya se venía conversando.
const GREETING_SIGNS = new Set(["HOLA", "ADIOS", "ADIÓS"]);
const FAREWELL_COMPANIONS = new Set(["NOS VEMOS"]);

const signKey = (item) => String(item.text || "").replaceAll("_", " ").trim().toUpperCase();

export function greetingByPosition(items, conversationStarted = false) {
  const words = items.filter((item) => item.kind !== "expression" && item.text);

  return items.map((item) => {
    if (item.kind !== "sign" || !GREETING_SIGNS.has(signKey(item))) {
      return item;
    }

    const position = words.indexOf(item);
    const before = words.slice(0, position);
    const after = words.slice(position + 1);
    const atEnd = after.every((word) => FAREWELL_COMPANIONS.has(signKey(word)));
    const alone = before.length === 0 && after.length === 0;
    const farewell = alone ? conversationStarted : atEnd;

    return { ...item, text: farewell ? "ADIOS" : "HOLA" };
  });
}

function writtenSign(item) {
  const text = String(item.text || "").replaceAll("_", " ").replace(/\s+/g, " ").trim();

  if (!text) {
    return "";
  }

  // Deletreo (un nombre, por ejemplo): con mayúscula inicial, "Juan".
  if (item.kind === "letters") {
    return capitalize(text.toLowerCase());
  }

  return WRITTEN_SIGNS[text.toUpperCase()] || text.toLowerCase();
}

// Mayúscula en la primera letra, también después de "¿" o "¡".
function capitalize(text) {
  return text.replace(/^([¿¡]*)(\p{L})/u, (_, marks, letter) => marks + letter.toUpperCase());
}

const stripMarks = (text) => text.replace(/[¿?¡!]/g, "");

// Palabras que van separadas del resto por una coma, como en la escritura
// normal: saludos, despedidas, agradecimientos y respuestas cortas
// ("Hola, yo Juan.", "Bien, gracias.", "Gracias, adiós."). Las demás señas
// seguidas van con espacio ("Quiero bistec.", "Me duele."), y una pregunta
// en medio de la frase lleva coma antes ("Hola, ¿cómo estás?").
const STANDALONE_WORDS = new Set([
  "hola", "adiós", "gracias", "nos vemos", "ok", "bien", "mal", "sí", "no",
  "por favor", "perdón",
]);

// Las señas en orden como una frase que se lee de corrido, para la pantalla
// y para la voz: "HOLA · COMO_ESTAS · GRACIAS" -> "Hola, ¿cómo estás? Gracias."
// Cada pregunta lleva sus signos (la voz cambia la entonación), las comas van
// solo donde corresponden (la voz hace una pausa corta) y al final va un
// punto. La pregunta y la intensidad de la cara solo cambian los signos; la
// negación y la afirmación se leen como "no" y "sí", que es lo que significan.
export function speechText(items) {
  // Cada parte: su texto y si va separada por comas (palabra suelta).
  const parts = [];

  for (const group of groupByExpression(items)) {
    const words = group.items.map(writtenSign).filter(Boolean);
    const speech = group.expression ? expressionInfo(group.expression).speech : null;
    const joined = () => stripMarks(words.join(" "));

    if (speech === "question") {
      if (words.length) parts.push({ text: `¿${joined()}?` });
    } else if (speech === "exclamation") {
      if (words.length) parts.push({ text: `¡${joined()}!` });
    } else if (speech === "no" || speech === "sí") {
      parts.push({ text: words.length ? `${joined()}, ${speech}` : speech, standalone: true });
    } else {
      parts.push(...words.map((text) => ({ text, standalone: STANDALONE_WORDS.has(text) })));
    }
  }

  let sentence = "";
  let previous = null;

  for (const part of parts) {
    const question = /^[¿¡]/.test(part.text);

    if (!sentence) {
      sentence = capitalize(part.text);
    } else if (/[.?!]$/.test(sentence)) {
      // Después de una pregunta empieza otra oración.
      sentence += ` ${capitalize(part.text)}`;
    } else if (question || part.standalone || previous.standalone) {
      // "Hola, ¿cómo estás?": la pregunta sigue en minúscula tras la coma.
      sentence += `, ${part.text}`;
    } else {
      sentence += ` ${part.text}`;
    }

    previous = part;
  }

  return sentence && !/[.?!]$/.test(sentence) ? `${sentence}.` : sentence;
}

// En el historial cada palabra se guarda como "TEXTO" o "TEXTO|EXPRESIÓN";
// una expresión sin seña, como "|EXPRESIÓN".
export function toHistoryText(item) {
  return item.expression ? `${item.text}|${item.expression}` : item.text;
}

export function fromHistoryText(raw) {
  const [text, expression] = String(raw).split("|");
  return {
    text: text || "",
    kind: text ? "word" : "expression",
    expression: expression || null,
  };
}

// Las letras deletreadas antiguas se guardaban una por una: "J","U","A","N" -> "JUAN".
export function joinHistoryItems(texts) {
  const items = [];
  let previousWasLetter = false;

  texts.map(fromHistoryText).forEach((item) => {
    const isLetter = item.text.length === 1 && !item.expression;

    if (isLetter && previousWasLetter) {
      items[items.length - 1].text += item.text;
    } else {
      items.push(item);
    }

    previousWasLetter = isLetter;
  });

  return items;
}
