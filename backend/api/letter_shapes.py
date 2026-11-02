"""
Formas de la mano de cada letra (puntos normalizados igual que el modelo de
letras), guardadas aparte en formas_letras.npz.

El entrenamiento de señas (train_dynamic.py) las usa para fabricar ejemplos
de deletreo y enseñarle a la CNN 1D que deletrear NO es una seña con
movimiento. Se guardan aparte porque el contenedor de entrenamiento solo
tiene TensorFlow (no scikit-learn para abrir el modelo de letras).

Se generan solas al entrenar las letras (train_from_roboflow.py). Para
sacarlas del modelo de letras actual, desde backend/:
    python api/letter_shapes.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

API_DIR = Path(__file__).resolve().parent
LETTER_SHAPES_PATH = API_DIR / "formas_letras.npz"
# J y Z se hacen con movimiento: no sirven como forma quieta.
MOVING_LETTERS = {"J", "Z"}
MAX_PER_LETTER = 80


def save_letter_shapes(shapes, labels, path: Path = LETTER_SHAPES_PATH, seed: int = 0) -> dict:
    """Guarda hasta MAX_PER_LETTER formas (21 x 3) por letra quieta."""
    shapes = np.asarray(shapes, dtype=np.float32).reshape(-1, 21, 3)
    labels = np.asarray([str(label).upper() for label in labels])
    rng = np.random.default_rng(seed)
    keep = []

    for letter in sorted(set(labels) - MOVING_LETTERS):
        indices = np.flatnonzero(labels == letter)
        keep.extend(rng.permutation(indices)[:MAX_PER_LETTER])

    keep = np.array(sorted(keep), dtype=int)
    np.savez_compressed(path, shapes=shapes[keep].astype(np.float16), labels=labels[keep])
    return {str(letter): int(np.sum(labels[keep] == letter)) for letter in sorted(set(labels[keep]))}


def load_letter_shapes(path: Path = LETTER_SHAPES_PATH):
    """(formas (N, 21, 3), letras) o (None, None) si el archivo no existe."""
    if not path.exists():
        return None, None

    with np.load(path, allow_pickle=False) as data:
        return data["shapes"].astype(np.float32), data["labels"]


_bank = {"mtime": None, "shapes": None, "labels": None}


def _shape_bank():
    if not LETTER_SHAPES_PATH.exists():
        return None, None

    mtime = LETTER_SHAPES_PATH.stat().st_mtime

    if _bank["mtime"] != mtime:
        shapes, labels = load_letter_shapes()
        _bank.update(mtime=mtime, shapes=shapes.reshape(len(shapes), -1), labels=labels)

    return _bank["shapes"], _bank["labels"]


def nearest_letters(hands) -> list[tuple[str, float]] | None:
    """
    Forma de cada mano (63 valores crudos) como la letra más parecida de
    formas_letras.npz, con su distancia. Es una forma de describir la
    configuración de la mano, aunque no se esté deletreando. None si falta el
    archivo de formas.
    """
    bank, labels = _shape_bank()

    if bank is None:
        return None

    if not hands:
        return []

    points = np.asarray(hands, dtype=np.float32).reshape(len(hands), 21, 3)
    centered = points - points[:, :1]
    scale = np.max(np.linalg.norm(centered, axis=2), axis=1)
    normalized = (centered / np.where(scale > 0, scale, 1.0)[:, None, None]).reshape(len(hands), -1)
    squared = (
        np.sum(normalized ** 2, axis=1)[:, None]
        + np.sum(bank ** 2, axis=1)[None, :]
        - 2.0 * normalized @ bank.T
    )
    best = np.argmin(squared, axis=1)
    distances = np.sqrt(np.maximum(squared[np.arange(len(hands)), best], 0.0))
    return [(str(labels[index]), float(distance)) for index, distance in zip(best, distances)]


def hand_shape_profiles(labels, raws, nothing: str, min_share: float = 0.01) -> dict | None:
    """
    Con qué formas de mano se hace cada seña en sus muestras: la letra más
    parecida de la mano principal en cada cuadro. Por ejemplo, con las
    muestras grabadas, HOLA sale B en 93% de los cuadros y DEJAME_PENSAR, K.
    """
    from api.sequence_features import main_hand

    counts = {}

    for label, raw in zip(labels, raws):
        if label == nothing:
            continue

        hands = [hand for hand in map(main_hand, raw["frames"]) if hand is not None]
        found = nearest_letters(hands)

        if found is None:
            return None

        for letter, _ in found:
            counts.setdefault(label, {}).setdefault(letter, 0)
            counts[label][letter] += 1

    profiles = {}

    for label, letters in counts.items():
        total = sum(letters.values())
        profiles[label] = {
            letter: round(count / total, 3)
            for letter, count in sorted(letters.items(), key=lambda item: -item[1])
            if count / total >= min_share
        }

    return profiles


def export_from_letter_model(path: Path = LETTER_SHAPES_PATH) -> dict:
    """
    Saca las formas del modelo de letras actual: sus vectores de soporte son
    ejemplos reales del entrenamiento. Se guardan los que el modelo reconoce
    como su propia letra.
    """
    from api.ml_predictor import get_model, predict_landmarks_batch

    model = get_model()

    if not hasattr(model, "steps") or not hasattr(model.steps[-1][1], "support_vectors_"):
        raise RuntimeError(
            "El modelo de letras no es un SVM: genera las formas entrenándolo con "
            "train_from_roboflow.py, que las guarda desde el conjunto de datos."
        )

    scaler, svc = model.steps[0][1], model.steps[-1][1]
    shapes = scaler.inverse_transform(svc.support_vectors_).reshape(-1, 21, 3)
    labels = np.repeat(svc.classes_, svc.n_support_)
    predicted = predict_landmarks_batch([shape.reshape(-1).tolist() for shape in shapes])
    keep = [str(p["label"]) == str(label) for p, label in zip(predicted, labels)]
    return save_letter_shapes(shapes[keep], labels[keep], path)


if __name__ == "__main__":
    import sys

    sys.path.insert(0, str(API_DIR.parent))
    counts = export_from_letter_model()
    print(f"Formas guardadas en {LETTER_SHAPES_PATH}: {counts}")
