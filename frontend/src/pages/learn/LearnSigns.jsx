import { useState } from "react";
import Icon from "../../components/Icon";
import SignVideo from "../../components/SignVideo";
import { Button, PhraseCard, Segmented, SettingRow } from "../../components/ui";
import { CATEGORIES, PHRASES } from "../../data/phrases";

// Aprender señas con los videos de las frases frecuentes: las mismas que la
// persona oyente le muestra a la persona sorda en Traducir > Voz.
function LearnSigns() {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [slow, setSlow] = useState(false);
  const list = PHRASES.filter((phrase) => filter === "all" || phrase.category === filter);
  const phrase = selected === null ? null : list[selected];

  if (phrase) {
    const category = CATEGORIES.find((item) => item.id === phrase.category);

    return (
      <>
        <div className="home-head">
          <button type="button" className="icon-btn" onClick={() => setSelected(null)} aria-label="Volver a las frases">
            <Icon name="back" />
          </button>
          <div>
            <h2 className="t-h2">{phrase.text}</h2>
            {category && <p className="t-caption t-muted">{category.label}</p>}
          </div>
        </div>

        <div className="learn-video">
          <SignVideo key={phrase.id} id={phrase.id} icon={phrase.icon} rate={slow ? 0.5 : 1} />
        </div>

        <SettingRow
          icon="clock"
          label="Ver más lento"
          description="El video va a la mitad de velocidad para seguir cada movimiento."
          value={slow}
          onChange={setSlow}
        />

        <div className="btn-row">
          <Button
            label="Anterior"
            icon="back"
            variant="secondary"
            disabled={selected === 0}
            onClick={() => setSelected(selected - 1)}
          />
          <Button
            label="Siguiente"
            icon="next"
            disabled={selected === list.length - 1}
            onClick={() => setSelected(selected + 1)}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <p className="t-body t-muted">
        Mira cómo se hacen en LSCh las frases frecuentes, las mismas que la persona oyente puede
        mostrar en Traducir.
      </p>
      <Segmented
        label="Categoría de frases"
        value={filter}
        onChange={(value) => {
          setFilter(value);
          setSelected(null);
        }}
        options={[
          { value: "all", label: "Todas" },
          ...CATEGORIES.map((category) => ({ value: category.id, label: category.label })),
        ]}
      />
      <div className="stack">
        {list.map((item, index) => (
          <PhraseCard
            key={item.id}
            text={item.text}
            icon={item.icon}
            hint="Ver el video de la seña"
            onClick={() => setSelected(index)}
          />
        ))}
      </div>
    </>
  );
}

export default LearnSigns;
