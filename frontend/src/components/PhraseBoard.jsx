import { useState } from "react";
import { PhraseCard, Segmented } from "./ui";
import { CATEGORIES, PHRASES } from "../data/phrases";

// Frases prehechas para que la persona oyente se comunique con la persona
// sorda: al tocar una se muestra en grande el video de su seña y el texto.
function PhraseBoard({ onPick }) {
  const [filter, setFilter] = useState("all");
  const list = PHRASES.filter((phrase) => filter === "all" || phrase.category === filter);

  return (
    <section className="stack" aria-label="Frases en señas">
      <h2 className="t-h2">Frases en señas</h2>
      <p className="t-body t-muted">Toca una frase para mostrarle su seña a la persona sorda.</p>
      <Segmented
        label="Categoría de frases"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Todas" },
          ...CATEGORIES.map((category) => ({ value: category.id, label: category.label })),
        ]}
      />
      <div className="stack">
        {list.map((phrase) => (
          <PhraseCard
            key={phrase.id}
            text={phrase.text}
            icon={phrase.icon}
            hint="Muestra la seña en pantalla completa"
            onClick={() => onPick(phrase)}
          />
        ))}
      </div>
    </section>
  );
}

export default PhraseBoard;
