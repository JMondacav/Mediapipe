// Expresiones faciales que acompañan a las señas. Las etiquetas son las que
// se graban en "Grabar señas" > Expresiones y aprende el modelo del backend.
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

// Texto para leer en voz alta, con las señas en orden. La pregunta y la
// intensidad solo cambian la entonación; la negación y la afirmación se
// leen como "no" y "sí", que es lo que significan.
export function speechText(items) {
  return groupByExpression(items)
    .map((group) => {
      const words = group.items
        .map((item) => item.text)
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const speech = group.expression ? expressionInfo(group.expression).speech : null;

      if (speech === "question") {
        return words && `¿${words}?`;
      }

      if (speech === "exclamation") {
        return words && `¡${words}!`;
      }

      if (speech === "no" || speech === "sí") {
        return words ? `${words}, ${speech}` : speech;
      }

      return words;
    })
    .filter(Boolean)
    .reduce((text, part) => {
      if (!text) {
        return part;
      }

      // Pausa entre grupos, sin repetir el punto después de "?" o "!".
      return /[?!]$/.test(text) ? `${text} ${part}` : `${text}. ${part}`;
    }, "");
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
