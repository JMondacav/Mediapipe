import { expressionInfo, groupByExpression } from "../utils/expressions";

// Las señas reconocidas, en el orden en que salieron. Las palabras dichas con
// la misma expresión de la cara van juntas en un recuadro con esa expresión
// arriba (como en la glosa de lengua de señas). Una expresión sin seña se
// muestra sola.
function SignWords({ items, showNames = true, animate = true, className = "a-c-blue" }) {
  // Las fichas aparecen una tras otra, en el orden en que se señaron.
  const chip = (item) => (
    <span
      className={`a-word-chip ${animate ? "a-chip--new" : ""}`}
      key={item.index}
      style={animate ? { animationDelay: `${item.index * 120}ms` } : undefined}
    >
      {item.text}
    </span>
  );

  const groups = groupByExpression(items);
  const marked = groups.some((group) => expressionInfo(group.expression));

  return (
    <div className={`a-words ${marked ? "a-words--marked" : ""} ${className}`}>
      {groups.map((group) => {
        const info = expressionInfo(group.expression);

        if (!info) {
          return group.items.map(chip);
        }

        const words = group.items.filter((item) => item.text);
        const label = words.length
          ? `${info.name}: ${words.map((item) => item.text).join(" ")}`
          : info.name;

        return (
          <span
            className={`a-expr-group ${group.alone ? "a-expr-group--alone" : ""} ${animate ? "a-chip--new" : ""}`}
            data-tone={info.tone}
            key={`grupo-${group.items[0].index}`}
            style={animate ? { animationDelay: `${group.items[0].index * 120}ms` } : undefined}
            role="group"
            aria-label={label}
            title={info.hint || info.name}
          >
            <span className="a-expr-tag">
              <span className="a-expr-emoji" aria-hidden="true">
                {info.emoji}
              </span>
              {showNames && <span>{info.name}</span>}
            </span>
            {words.length > 0 && <span className="a-expr-words">{words.map(chip)}</span>}
          </span>
        );
      })}
    </div>
  );
}

export default SignWords;
