import { expressionInfo, groupByExpression, speechText } from "../utils/expressions";

// Las señas reconocidas, en el orden en que salieron, escritas como una sola
// frase que se lee de corrido ("Hola, ¿cómo estás? Gracias."). Es el mismo
// texto que lee la voz. Si solo hubo una expresión de la cara sin palabras,
// se muestra su emoji.
function SignWords({ items, animate = true, className = "a-c-blue" }) {
  const sentence = speechText(items);
  const emojis = sentence
    ? ""
    : groupByExpression(items)
        .map((group) => expressionInfo(group.expression)?.emoji)
        .filter(Boolean)
        .join(" ");

  return (
    <p className={`a-sentence ${animate ? "a-chip--new" : ""} ${className}`}>
      {sentence || emojis}
    </p>
  );
}

export default SignWords;
