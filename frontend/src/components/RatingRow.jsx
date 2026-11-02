const FACES = [
  { value: 1, emoji: "😞", label: "Muy mal" },
  { value: 2, emoji: "🙁", label: "Mal" },
  { value: 3, emoji: "😐", label: "Regular" },
  { value: 4, emoji: "🙂", label: "Bien" },
  { value: 5, emoji: "😄", label: "Muy bien" },
];

// Valoración con caritas: no exige leer y cada opción tiene su etiqueta.
function RatingRow({ onRate }) {
  return (
    <div className="rating" role="group" aria-label="Valoración">
      <div className="rating-row">
        {FACES.map((face) => (
          <button
            key={face.value}
            type="button"
            className="rating-face"
            onClick={() => onRate(face.value)}
            aria-label={`${face.label}. Calificar ${face.value} de 5`}
          >
            <span aria-hidden="true">{face.emoji}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default RatingRow;
