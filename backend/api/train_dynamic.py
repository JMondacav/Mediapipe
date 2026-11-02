"""
Entrena las CNN 1D de EnseñaVos con las muestras grabadas desde la app
(pantalla "Grabar señas"):

- Señas con movimiento:  backend/data/dynamic_signs/<SEÑA>/*.json
- Expresiones faciales:  backend/data/expressions/<EXPRESIÓN>/*.json

Con Docker (no hace falta instalar TensorFlow en el backend):
    docker compose --profile train run --rm trainer

Sin Docker:
    pip install -r requirements-train.txt
    python api/train_dynamic.py

Entrena las señas y, si hay muestras de expresiones, también las expresiones.
Para entrenar solo una de las dos, agrega --senas o --expresiones.

Genera en backend/api/:
    modelo_dinamico.npz, modelo_expresiones.npz       pesos que usa el backend (numpy)
    modelo_dinamico.keras, modelo_expresiones.keras   modelos Keras (sirven para TFLite)
    model_report_dinamico.json, model_report_expresiones.json   métricas
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from tensorflow import keras

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from api.dynamic_predictor import (  # noqa: E402
    DEFAULT_MIN_MOTION,
    EXPRESSION_MODEL_PATH,
    EXPRESSIONS,
    MODEL_PATH,
    NEUTRAL_LABEL,
    NOTHING_LABEL,
    SIGNS,
    SequenceModel,
)
from api.dynamic_samples import EXPRESSION, SIGN, data_dir, iter_sample_paths  # noqa: E402
from api.letter_shapes import hand_shape_profiles, load_letter_shapes  # noqa: E402
from api.sequence_features import (  # noqa: E402
    DEFAULT_ASPECT_RATIO,
    EXPRESSION_BLENDSHAPES,
    EXPRESSION_VERSION,
    FACE_LOCATION_OFFSET,
    FACE_LOCATION_PER_HAND,
    FACE_PRESENCE_COLUMN,
    FACE_PRESENT_OFFSET,
    FEATURE_SIZE,
    FEATURE_VERSION,
    FEATURES_PER_HAND,
    HAND_SLOTS,
    LANDMARK_VALUES,
    NOSE_TRAJECTORY_OFFSET,
    POSE_MOTION_OFFSET,
    POSE_OFFSET,
    PRESENCE_OFFSET,
    SEQUENCE_LENGTH,
    TRAJECTORY_OFFSET,
    WINDOW_MS,
    build_expression_features,
    build_sequence_features,
    face_ratio,
    motion_amount,
)

API_DIR = BASE_DIR / "api"

SEED = 42
EPOCHS = int(os.environ.get("DYNAMIC_EPOCHS", "150"))
BATCH_SIZE = 32
AUGMENTED_COPIES = int(os.environ.get("DYNAMIC_AUGMENTED_COPIES", "16"))
# Espejo: cada seña se aprende también hecha con la otra mano, así las
# personas zurdas la usan sin grabar sus propias muestras. Con los ejemplos de
# deletreo y transiciones como NADA, el modelo igual distingue la palma del
# dorso (HOLA con el dorso: 0 de 12 muestras no vistas). DYNAMIC_MIRROR=False
# lo apaga.
MIRROR_HANDS = os.environ.get("DYNAMIC_MIRROR", "True") == "True"
MIN_SAMPLES_PER_CLASS = 5
# Ejemplos de señado rápido y de corrido fabricados a partir de las muestras:
# la seña acelerada hasta 2,2 veces, con otra seña justo antes (y a veces
# después). Sin esto el modelo solo conoce señas que duran lo que la grabación.
FLUENCY_COPIES = int(os.environ.get("DYNAMIC_FLUENCY_COPIES", "6"))
FAST_SPEEDS = (1.0, 2.2)
# Transiciones que no son ninguna seña, entrenadas como NADA: el final de una
# seña que ya va saliendo de la ventana o el comienzo de una que recién
# entra, con las manos abajo o quietas en el resto. Sin esto el modelo puede
# inventar una seña (por ejemplo HOLA) en las pausas entre señas.
TRANSITION_COPIES = int(os.environ.get("DYNAMIC_TRANSITION_COPIES", "4"))
# Qué parte de la seña se ve en esas ventanas (fracción de su duración) y a
# qué velocidad. Con más, el modelo empieza a perder señas muy rápidas, que
# también ocupan poco de la ventana.
TRANSITION_TAIL = (0.05, 0.3)
TRANSITION_HEAD = (0.05, 0.25)
TRANSITION_SPEEDS = (1.0, 1.5)
# Deletreo como NADA: ventanas con letras sostenidas y el paso de una a otra,
# armadas con formas reales de letras (formas_letras.npz) en la posición de
# manos reales. Sin esto la CNN toma el movimiento de los dedos al deletrear
# como una seña (por ejemplo HOLA) y la letra se pierde.
FINGERSPELLING_COPIES = int(os.environ.get("DYNAMIC_FINGERSPELLING_COPIES", "2"))
# De 1 a 6 letras: una letra sola también (subir la mano, formarla y bajarla
# se leía como HOLA o DEJAME_PENSAR).
FINGERSPELLING_LETTERS = (1, 7)
FINGERSPELLING_HOLD_MS = (150, 600)
FINGERSPELLING_TRANSITION_MS = (100, 300)
# La mitad de las veces la mano sube desde abajo al empezar y baja al terminar.
FINGERSPELLING_RAISE_MS = (250, 600)
# Temblor de MediaPipe con la mano quieta, en unidades de la imagen.
FINGERSPELLING_JITTER = 0.001

# Ubicación de las manos respecto a la cara. Con "auto" se usa si al menos el
# 80% de las muestras de señas se grabó viendo la cara (las grabadas antes de
# que la app leyera la cara no la tienen). "True" o "False" la fuerzan.
FACE_LOCATION_MODE = os.environ.get("DYNAMIC_FACE_LOCATION", "auto")
FACE_LOCATION_MIN_SHARE = 0.8
SAMPLE_MIN_FACE_RATIO = 0.5
# Parte de los ejemplos se entrena sin cara, para que el modelo siga
# funcionando si un momento no se ve (o si la persona apaga la lectura de cara).
FACE_DROPOUT = 0.15

# Expresiones: se aceleran menos que las señas (hasta 1,8 veces).
EXPRESSION_SPEEDS = (1.0, 1.8)

SLOT_OFFSETS = [slot * FEATURES_PER_HAND for slot in range(len(HAND_SLOTS))]

SIGN_SPEC = {
    "title": "señas",
    "kind": SIGNS,
    "nothing": NOTHING_LABEL,
    "keras_name": "cnn1d_senas_dinamicas",
    "model_path": MODEL_PATH,
    "keras_path": API_DIR / "modelo_dinamico.keras",
    "report_path": API_DIR / "model_report_dinamico.json",
    "tmp_path": API_DIR / "modelo_dinamico.tmp.npz",
    "backup_path": API_DIR / "modelo_dinamico.backup.npz",
}

EXPRESSION_SPEC = {
    "title": "expresiones",
    "kind": EXPRESSIONS,
    "nothing": NEUTRAL_LABEL,
    "keras_name": "cnn1d_expresiones",
    "model_path": EXPRESSION_MODEL_PATH,
    "keras_path": API_DIR / "modelo_expresiones.keras",
    "report_path": API_DIR / "model_report_expresiones.json",
    "tmp_path": API_DIR / "modelo_expresiones.tmp.npz",
    "backup_path": API_DIR / "modelo_expresiones.backup.npz",
}


# ---------------------------------------------------------------- datos

def load_samples(kind: str, validate) -> tuple[list[str], list[dict]]:
    """Etiquetas y grabaciones crudas ({frames, aspect_ratio}) de un tipo de muestra."""
    labels, raws = [], []
    directory = data_dir(kind)

    for label, path in iter_sample_paths(kind):
        try:
            sample = json.loads(path.read_text(encoding="utf-8"))
            raw = {
                "frames": sample["frames"],
                "aspect_ratio": float(sample.get("aspect_ratio", DEFAULT_ASPECT_RATIO)),
            }
            validate(raw)
            labels.append(label)
            raws.append(raw)
        except (KeyError, TypeError, ValueError) as exc:
            print(f"Se omite {path.relative_to(directory)}: {exc}")

    return labels, raws


def drop_small_classes(labels: list[str], raws: list[dict], what: str):
    counts = {label: labels.count(label) for label in sorted(set(labels))}
    too_few = [label for label, count in counts.items() if count < MIN_SAMPLES_PER_CLASS]

    for label in too_few:
        print(
            f"Se omite {label}: tiene {counts[label]} muestras "
            f"(mínimo {MIN_SAMPLES_PER_CLASS})"
        )

    keep = [index for index, label in enumerate(labels) if label not in too_few]

    if len({labels[index] for index in keep}) < 2:
        raise RuntimeError(f"Se necesitan al menos 2 {what} con suficientes muestras.")

    return [labels[index] for index in keep], [raws[index] for index in keep]


def compute_min_motion(labels: list[str], motions: list[float]) -> tuple[float, dict]:
    """
    Umbral del filtro de movimiento según las señas grabadas: 80% del
    movimiento de la seña más quieta (percentil 5), entre 0,05 y 0,5.
    Así una seña casi quieta (como DEJAME_PENSAR) no queda bloqueada.
    """
    by_label = {}
    for label, motion in zip(labels, motions):
        by_label.setdefault(label, []).append(motion)

    stats = {
        label: {
            "p5": round(float(np.percentile(values, 5)), 3),
            "median": round(float(np.median(values)), 3),
        }
        for label, values in sorted(by_label.items())
    }
    sign_floors = [item["p5"] for label, item in stats.items() if label != NOTHING_LABEL]
    min_motion = float(np.clip(0.8 * min(sign_floors), 0.05, DEFAULT_MIN_MOTION))
    return round(min_motion, 3), stats


def decide_face_location(raws: list[dict]) -> tuple[bool, float]:
    """Si el modelo de señas usará la ubicación de las manos respecto a la cara."""
    share = float(np.mean([
        face_ratio(raw["frames"], WINDOW_MS) >= SAMPLE_MIN_FACE_RATIO for raw in raws
    ]))

    if FACE_LOCATION_MODE in ("True", "False"):
        return FACE_LOCATION_MODE == "True", share

    return share >= FACE_LOCATION_MIN_SHARE, share


def split_indices(y: np.ndarray, rng) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """División estratificada: ~70% train, ~15% valid, ~15% test por clase."""
    train, valid, test = [], [], []

    for class_index in np.unique(y):
        indices = rng.permutation(np.flatnonzero(y == class_index))
        total = len(indices)
        n_valid = max(1, round(total * 0.15))
        n_test = round(total * 0.15) if total >= 10 else 0
        valid.extend(indices[:n_valid])
        test.extend(indices[n_valid : n_valid + n_test])
        train.extend(indices[n_valid + n_test :])

    return (
        np.array(train, dtype=int),
        np.array(valid, dtype=int),
        np.array(test, dtype=int),
    )


# ---------------------------------------------------------------- aumentación

def time_warp(sequence: np.ndarray, rng) -> np.ndarray:
    """Movimiento un poco más rápido o lento y levemente desplazado en el tiempo."""
    center = (SEQUENCE_LENGTH - 1) / 2
    speed = rng.uniform(0.8, 1.2)
    shift = rng.uniform(-3, 3)
    positions = center + (np.arange(SEQUENCE_LENGTH) - center) * speed + shift
    return sequence[np.clip(np.rint(positions), 0, SEQUENCE_LENGTH - 1).astype(int)]


def _face_location_columns(slot: int) -> int:
    return FACE_LOCATION_OFFSET + slot * FACE_LOCATION_PER_HAND


def mirror(sequence: np.ndarray, face_location: bool = False) -> np.ndarray:
    """Simula a una persona zurda: refleja en x e intercambia las manos."""
    out = sequence.copy()

    for offset in SLOT_OFFSETS:
        out[:, offset : offset + LANDMARK_VALUES : 3] *= -1
        out[:, offset + TRAJECTORY_OFFSET] *= -1

    parts = [out[:, FEATURES_PER_HAND:FEATURE_SIZE], out[:, :FEATURES_PER_HAND]]

    if face_location:
        first, second = _face_location_columns(0), _face_location_columns(1)
        width = FACE_LOCATION_PER_HAND
        out[:, first : FACE_PRESENCE_COLUMN : 2] *= -1
        parts += [
            out[:, second : second + width],
            out[:, first : first + width],
            out[:, FACE_PRESENCE_COLUMN : FACE_PRESENCE_COLUMN + 1],
        ]

    return np.concatenate(parts, axis=1)


def rotate(sequence: np.ndarray, angle: float, face_location: bool = False) -> np.ndarray:
    """Gira forma, trayectoria y ubicación en el plano de la cámara (cámara algo inclinada)."""
    out = sequence.copy()
    cos, sin = np.cos(angle), np.sin(angle)
    axis_pairs = []

    for offset in SLOT_OFFSETS:
        axis_pairs += [
            (
                slice(offset, offset + LANDMARK_VALUES, 3),
                slice(offset + 1, offset + LANDMARK_VALUES, 3),
            ),
            (offset + TRAJECTORY_OFFSET, offset + TRAJECTORY_OFFSET + 1),
        ]

    if face_location:
        for slot in range(len(HAND_SLOTS)):
            offset = _face_location_columns(slot)
            axis_pairs += [(offset, offset + 1), (offset + 2, offset + 3)]

    for x_cols, y_cols in axis_pairs:
        x, y = sequence[:, x_cols], sequence[:, y_cols]
        out[:, x_cols] = cos * x - sin * y
        out[:, y_cols] = sin * x + cos * y

    return out


def augment(sequence: np.ndarray, rng, face_location: bool = False) -> np.ndarray:
    out = time_warp(sequence, rng)

    if MIRROR_HANDS and rng.random() < 0.5:
        out = mirror(out, face_location)

    out = rotate(out, rng.uniform(-0.2, 0.2), face_location)

    for offset in SLOT_OFFSETS:
        present = out[:, offset + PRESENCE_OFFSET : offset + PRESENCE_OFFSET + 1]
        noise = rng.normal(0, 0.01, (SEQUENCE_LENGTH, LANDMARK_VALUES))
        out[:, offset : offset + LANDMARK_VALUES] += noise * present
        out[:, offset + TRAJECTORY_OFFSET : offset + TRAJECTORY_OFFSET + 2] *= rng.uniform(0.8, 1.2)

    if face_location:
        if rng.random() < FACE_DROPOUT:
            out[:, FACE_LOCATION_OFFSET:] = 0
        else:
            # Personas con la cara más grande o más chica respecto a las manos.
            out[:, FACE_LOCATION_OFFSET:FACE_PRESENCE_COLUMN] *= rng.uniform(0.9, 1.1)

    return out.astype(np.float32)


def _mirror_blendshapes() -> np.ndarray:
    """Para cada expresión, la del lado contrario de la cara (browDownLeft <-> browDownRight)."""
    names = list(EXPRESSION_BLENDSHAPES)
    order = []

    for name in names:
        if name.endswith("Left"):
            name = name[: -len("Left")] + "Right"
        elif name.endswith("Right"):
            name = name[: -len("Right")] + "Left"
        order.append(names.index(name))

    return np.array(order)


BLENDSHAPE_MIRROR = _mirror_blendshapes()


def mirror_expression(sequence: np.ndarray) -> np.ndarray:
    """La misma expresión con los lados de la cara intercambiados."""
    out = sequence.copy()
    out[:, :POSE_OFFSET] = sequence[:, BLENDSHAPE_MIRROR]

    for offset in (POSE_OFFSET, POSE_MOTION_OFFSET):
        out[:, offset] *= -1  # giro
        out[:, offset + 2] *= -1  # ladeo

    out[:, NOSE_TRAJECTORY_OFFSET] *= -1
    return out


def augment_expression(sequence: np.ndarray, rng) -> np.ndarray:
    out = time_warp(sequence, rng)

    # Una expresión significa lo mismo con cualquier lado de la cara.
    if rng.random() < 0.5:
        out = mirror_expression(out)

    present = out[:, FACE_PRESENT_OFFSET : FACE_PRESENT_OFFSET + 1]
    count = POSE_OFFSET

    # Caras más o menos expresivas, con otra expresión "de reposo" y ruido.
    shapes = (
        out[:, :count] * rng.uniform(0.8, 1.2)
        + rng.normal(0, 0.03, count)
        + rng.normal(0, 0.02, (SEQUENCE_LENGTH, count))
    )
    out[:, :count] = np.clip(shapes, 0, 1) * present

    # Cámara más arriba, más abajo o de lado: cambia la postura de base.
    out[:, POSE_OFFSET : POSE_OFFSET + 3] += rng.normal(0, [0.12, 0.15, 0.08]) * present

    # Movimientos de cabeza más amplios o más cortos.
    gain = rng.uniform(0.7, 1.3)
    out[:, POSE_MOTION_OFFSET : POSE_MOTION_OFFSET + 3] *= gain
    out[:, NOSE_TRAJECTORY_OFFSET : NOSE_TRAJECTORY_OFFSET + 2] *= gain

    # La cara se pierde un momento (una mano la tapa).
    if rng.random() < 0.2:
        start = int(rng.integers(0, SEQUENCE_LENGTH - 4))
        out[start : start + int(rng.integers(2, 5))] = 0

    return out.astype(np.float32)


# ---------------------------------------------------------------- señado rápido

def retime(frames, speed: float, offset: float) -> list[dict]:
    """Acelera una grabación `speed` veces y la desplaza para que empiece en `offset`."""
    ordered = sorted(frames, key=lambda frame: frame["t"])
    start = ordered[0]["t"]
    return [{**frame, "t": offset + (frame["t"] - start) / speed} for frame in ordered]


def fluent_window(
    target: dict,
    previous: dict,
    following: dict | None,
    speed: float,
    rng,
    builder,
    speeds=FAST_SPEEDS,
):
    """
    Simula señar rápido y de corrido: la muestra objetivo acelerada `speed`
    veces, con otra justo antes y, si se da `following`, el comienzo de otra
    después (hasta 250 ms). La ventana termina donde termina la objetivo.
    """
    before = retime(previous["frames"], rng.uniform(*speeds), 0.0)
    current = retime(target["frames"], speed, before[-1]["t"] + 33)
    frames = before + current

    if following is not None:
        limit = current[-1]["t"] + rng.uniform(0, 250)
        after = retime(following["frames"], rng.uniform(*speeds), current[-1]["t"] + 33)
        frames += [frame for frame in after if frame["t"] <= limit]

    return builder(frames, target["aspect_ratio"])


def _targets(y: np.ndarray, classes: list[str], nothing: str) -> list[int]:
    skip = classes.index(nothing) if nothing in classes else -1
    return [index for index in range(len(y)) if y[index] != skip]


def build_fluent_set(raws, y, classes, rng, copies, nothing, builder, augment_fn, speeds):
    """Ventanas de señas (o expresiones) rápidas encadenadas, con velocidades al azar."""
    X_out, y_out = [], []

    for _ in range(copies):
        for index in _targets(y, classes, nothing):
            others = [other for other in range(len(raws)) if y[other] != y[index]]
            if not others:
                continue

            previous = raws[rng.choice(others)]
            following = raws[rng.choice(others)] if rng.random() < 0.5 else None
            features = fluent_window(
                raws[index], previous, following, rng.uniform(*speeds), rng, builder, speeds
            )
            X_out.append(augment_fn(features, rng) if rng.random() < 0.5 else features)
            y_out.append(y[index])

    return X_out, y_out


def _filler(start: float, length: float, still: dict | None, face) -> list[dict]:
    """Frames sin seña: las manos quietas de una muestra de NADA, o las manos abajo."""
    if still is not None:
        return [frame for frame in retime(still["frames"], 1.0, start) if frame["t"] <= start + length]

    filler = []
    for index in range(int(length // 33) + 1):
        frame = {"t": start + index * 33, "hands": []}
        if face:
            frame["face"] = face
        filler.append(frame)

    return filler


def transition_window(target: dict, still: dict | None, rng, builder, tail: bool):
    """
    Ventana con solo una parte de la seña `target`: su final saliendo de la
    ventana (tail) o su comienzo entrando (head). El resto, sin seña.
    """
    sign = retime(target["frames"], rng.uniform(*TRANSITION_SPEEDS), 0.0)
    duration = sign[-1]["t"]

    if tail:
        visible = rng.uniform(*TRANSITION_TAIL) * duration
        end = duration + WINDOW_MS - visible
        frames = sign + _filler(duration + 33, WINDOW_MS, still, sign[-1].get("face"))
    else:
        visible = rng.uniform(*TRANSITION_HEAD) * duration
        end = visible
        frames = _filler(-WINDOW_MS - 33, WINDOW_MS, still, sign[0].get("face")) + sign

    return builder([frame for frame in frames if frame["t"] <= end], target["aspect_ratio"])


def build_transition_set(raws, y, classes, rng, copies, nothing, builder, mirror_fn=None):
    """Ventanas de transición (ver TRANSITION_COPIES), con la etiqueta NADA."""
    if nothing not in classes or copies <= 0:
        return [], []

    nothing_index = classes.index(nothing)
    stills = [raws[index] for index in range(len(raws)) if y[index] == nothing_index]
    X_out = []

    for _ in range(copies):
        for index in _targets(y, classes, nothing):
            for tail in (True, False):
                still = stills[rng.integers(len(stills))] if stills and rng.random() < 0.5 else None
                window = transition_window(raws[index], still, rng, builder, tail)

                if mirror_fn is not None and rng.random() < 0.5:
                    window = mirror_fn(window)

                X_out.append(window)

    return X_out, [nothing_index] * len(X_out)


def _mirror_raw(raw: dict) -> dict:
    """La grabación reflejada (como si la hiciera una persona zurda)."""
    swap = {"Left": "Right", "Right": "Left"}
    frames = []

    for frame in raw["frames"]:
        hands = []
        for hand in frame.get("hands") or []:
            points = np.asarray(hand["landmarks"], dtype=np.float64).reshape(21, 3)
            points[:, 0] = 1.0 - points[:, 0]
            hands.append({
                "handedness": swap.get(hand.get("handedness", ""), hand.get("handedness", "")),
                "landmarks": points.reshape(-1).tolist(),
            })
        frames.append({**frame, "hands": hands})

    return {**raw, "frames": frames}


def _reference_hands(raws: list[dict]) -> list[dict]:
    """Manos reales (muñeca, tamaño, etiqueta y cara del frame) donde ubicar el deletreo."""
    references = []

    for raw in raws:
        aspect = raw["aspect_ratio"]
        scale = np.array([aspect, 1.0, aspect])

        for frame in raw["frames"][::5]:
            for hand in frame.get("hands") or []:
                points = np.asarray(hand["landmarks"], dtype=np.float64).reshape(21, 3)
                size = float(np.max(np.linalg.norm((points - points[0]) * scale, axis=1)))

                if size > 1e-3:
                    references.append({
                        "wrist": points[0],
                        "size": size,
                        "handedness": hand.get("handedness", ""),
                        "aspect": aspect,
                        "face": frame.get("face"),
                    })

    return references


def fingerspelling_window(reference: dict, shapes: np.ndarray, rng, builder):
    """
    Una ventana de deletreo: varias letras sostenidas y el paso de una forma
    a otra (los dedos cambian y la muñeca se corre un poco), en la posición y
    el tamaño de una mano real, con el temblor de una mano quieta.
    """
    scale = np.array([reference["aspect"], 1.0, reference["aspect"]])
    frame_ms = 1000.0 / rng.uniform(15, 30)
    wrist = np.array(reference["wrist"], dtype=np.float64)
    frames, t, previous = [], 0.0, None

    def add(shape, position):
        nonlocal t
        points = position + shape * reference["size"] / scale
        points += rng.normal(0, FINGERSPELLING_JITTER, points.shape)
        frame = {
            "t": t,
            "hands": [{"handedness": reference["handedness"], "landmarks": points.reshape(-1).tolist()}],
        }
        if reference["face"]:
            frame["face"] = reference["face"]
        frames.append(frame)
        t += frame_ms * rng.uniform(0.9, 1.1)

    def move(from_shape, from_position, to_shape, to_position, duration_ms):
        count = max(1, int(duration_ms / frame_ms))
        for step in range(1, count + 1):
            a = step / count
            add((1 - a) * from_shape + a * to_shape, (1 - a) * from_position + a * to_position)

    # Más abajo en la imagen (y crece hacia abajo), de donde sube la mano.
    low = wrist + np.array([rng.normal(0, 0.04), rng.uniform(0.25, 0.45), 0.0])
    raise_hand = rng.random() < 0.5

    for _ in range(int(rng.integers(*FINGERSPELLING_LETTERS))):
        shape = shapes[rng.integers(len(shapes))]
        position = wrist + np.array([rng.normal(0, 0.012), rng.normal(0, 0.008), 0.0])

        if previous is not None:
            move(*previous, shape, position, rng.uniform(*FINGERSPELLING_TRANSITION_MS))
        elif raise_hand:
            start_shape = shapes[rng.integers(len(shapes))]
            move(start_shape, low, shape, position, rng.uniform(*FINGERSPELLING_RAISE_MS))

        for _ in range(max(1, int(rng.uniform(*FINGERSPELLING_HOLD_MS) / frame_ms))):
            add(shape, position)

        previous, wrist = (shape, position), position

    if raise_hand:
        move(*previous, previous[0], low, rng.uniform(*FINGERSPELLING_RAISE_MS))

    # La ventana termina en algún momento del deletreo (después del primer segundo).
    end = rng.uniform(min(1000.0, t), t)
    return builder([frame for frame in frames if frame["t"] <= end], reference["aspect"])


def build_fingerspelling_set(raws, y, classes, rng, copies, nothing, builder, augment_fn):
    """Ventanas de deletreo (ver FINGERSPELLING_COPIES), con la etiqueta NADA."""
    shapes, _ = load_letter_shapes()

    if nothing not in classes or copies <= 0 or shapes is None:
        return [], []

    references = _reference_hands(raws)

    if not references:
        return [], []

    X_out = []

    for _ in range(copies * len(_targets(y, classes, nothing))):
        reference = references[rng.integers(len(references))]
        window = fingerspelling_window(reference, shapes, rng, builder)
        X_out.append(augment_fn(window, rng) if rng.random() < 0.5 else window)

    return X_out, [classes.index(nothing)] * len(X_out)


def fluency_accuracy(numpy_model, raws, y, classes, nothing, builder, speeds) -> dict:
    """
    Precisión con muestras aceleradas y encadenadas, usando solo muestras que
    no se usaron para entrenar.
    """
    rng = np.random.default_rng(SEED)
    results = {}

    for speed in speeds:
        X_eval, y_eval = [], []

        for index in _targets(y, classes, nothing):
            others = [other for other in range(len(raws)) if y[other] != y[index]]
            if others:
                previous = raws[rng.choice(others)]
                X_eval.append(fluent_window(raws[index], previous, None, speed, rng, builder))
                y_eval.append(y[index])

        if X_eval:
            predicted = numpy_model.predict_proba(np.stack(X_eval)).argmax(axis=1)
            results[f"{speed}x"] = round(float(np.mean(predicted == np.array(y_eval))), 3)

    return results


# ---------------------------------------------------------------- modelo

def build_model(num_classes: int, feature_size: int, name: str) -> keras.Model:
    inputs = keras.Input(shape=(SEQUENCE_LENGTH, feature_size))
    x = inputs

    # 3 bloques: con el pooling, el último ya "ve" los 30 frames completos.
    for _ in range(3):
        x = keras.layers.Conv1D(64, 5, padding="same", activation="relu")(x)
        x = keras.layers.BatchNormalization()(x)
        x = keras.layers.MaxPooling1D(2)(x)

    x = keras.layers.GlobalAveragePooling1D()(x)
    x = keras.layers.Dropout(0.3)(x)
    outputs = keras.layers.Dense(num_classes, activation="softmax")(x)

    model = keras.Model(inputs, outputs, name=name)
    model.compile(
        optimizer=keras.optimizers.Adam(1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def _first_int(value) -> int:
    return int(np.ravel(value)[0])


def export_numpy_model(model: keras.Model, classes: list[str], path: Path, meta: dict) -> None:
    """Guarda los pesos en .npz con la lista de capas que entiende SequenceModel."""
    layers, arrays = [], {}

    for layer in model.layers:
        kind = type(layer).__name__

        if kind == "InputLayer":
            continue

        config = layer.get_config()
        prefix = f"l{len(layers)}_"

        if config.get("data_format", "channels_last") != "channels_last":
            raise ValueError(f"{kind} debe usar data_format='channels_last'")

        if kind == "Conv1D":
            if (
                config["padding"] != "same"
                or _first_int(config["strides"]) != 1
                or _first_int(config["dilation_rate"]) != 1
                or config.get("groups", 1) != 1
            ):
                raise ValueError("Conv1D debe usar padding='same', strides=1 y dilation_rate=1")

            arrays[prefix + "kernel"], arrays[prefix + "bias"] = layer.get_weights()
            layers.append({"type": "conv1d", "activation": config["activation"]})

        elif kind == "BatchNormalization":
            axis = np.ravel(config.get("axis", -1))[0]

            if axis not in (-1, 2):
                raise ValueError("BatchNormalization debe normalizar el último eje")

            gamma, beta, mean, variance = layer.get_weights()
            arrays.update({
                prefix + "gamma": gamma,
                prefix + "beta": beta,
                prefix + "mean": mean,
                prefix + "variance": variance,
            })
            layers.append({"type": "batch_norm", "epsilon": float(config["epsilon"])})

        elif kind == "MaxPooling1D":
            if config["padding"] != "valid":
                raise ValueError("MaxPooling1D debe usar padding='valid'")

            pool_size = _first_int(config["pool_size"])
            strides = _first_int(config.get("strides") or pool_size)
            layers.append({"type": "max_pool1d", "pool_size": pool_size, "strides": strides})

        elif kind == "GlobalAveragePooling1D":
            if config.get("keepdims", False):
                raise ValueError("GlobalAveragePooling1D no debe usar keepdims")

            layers.append({"type": "global_avg_pool1d"})

        elif kind == "Dropout":
            layers.append({"type": "dropout"})

        elif kind == "Dense":
            arrays[prefix + "kernel"], arrays[prefix + "bias"] = layer.get_weights()
            layers.append({"type": "dense", "activation": config["activation"]})

        else:
            raise ValueError(f"Capa sin soporte en la inferencia numpy: {kind}")

    full_meta = {
        "classes": classes,
        "window_ms": WINDOW_MS,
        "sequence_length": SEQUENCE_LENGTH,
        "feature_size": int(model.input_shape[-1]),
        **meta,
        "layers": layers,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    np.savez_compressed(path, meta=np.array(json.dumps(full_meta, ensure_ascii=False)), **arrays)


# ---------------------------------------------------------------- métricas

def evaluate(probabilities: np.ndarray, y_true: np.ndarray, classes: list[str]) -> dict:
    y_pred = probabilities.argmax(axis=1)
    matrix = np.zeros((len(classes), len(classes)), dtype=int)
    np.add.at(matrix, (y_true, y_pred), 1)
    totals = matrix.sum(axis=1)

    return {
        "accuracy": float(np.mean(y_pred == y_true)),
        "recall_by_class": {
            label: float(matrix[i, i] / totals[i]) if totals[i] else None
            for i, label in enumerate(classes)
        },
        "confusion_matrix": matrix.tolist(),
    }


# ---------------------------------------------------------------- entrenamiento

def train(
    spec: dict,
    labels,
    raws,
    builder,
    augment_fn,
    speeds,
    meta: dict,
    report_extra: dict,
    transitions: bool = False,
    fingerspelling: bool = False,
    mirror_fn=None,
):
    """Entrena, exporta a numpy, comprueba que coincida con Keras y guarda el reporte."""
    keras.utils.set_random_seed(SEED)
    rng = np.random.default_rng(SEED)

    X = np.stack([builder(raw["frames"], raw["aspect_ratio"]) for raw in raws])
    classes = sorted(set(labels))
    y = np.array([classes.index(label) for label in labels])
    nothing = spec["nothing"]

    if nothing not in classes:
        print(
            f"AVISO: no hay muestras de '{nothing}'. Sin esa clase el modelo "
            f"siempre elige alguna de las {spec['title']}, aunque no hagas ninguna."
        )

    train_idx, valid_idx, test_idx = split_indices(y, rng)
    X_train, y_train = X[train_idx], y[train_idx]
    X_valid, y_valid = X[valid_idx], y[valid_idx]

    augmented = [X_train] + [
        np.stack([augment_fn(sequence, rng) for sequence in X_train])
        for _ in range(AUGMENTED_COPIES)
    ]
    X_fit = np.concatenate(augmented)
    y_fit = np.tile(y_train, AUGMENTED_COPIES + 1)

    fluent_X, fluent_y = build_fluent_set(
        [raws[index] for index in train_idx], y_train, classes, rng,
        FLUENCY_COPIES, nothing, builder, augment_fn, speeds,
    )
    if fluent_X:
        X_fit = np.concatenate([X_fit, np.stack(fluent_X).astype(np.float32)])
        y_fit = np.concatenate([y_fit, np.array(fluent_y)])

    transition_X, transition_y = (
        build_transition_set(
            [raws[index] for index in train_idx], y_train, classes, rng,
            TRANSITION_COPIES, nothing, builder, mirror_fn,
        )
        if transitions
        else ([], [])
    )
    if transition_X:
        X_fit = np.concatenate([X_fit, np.stack(transition_X).astype(np.float32)])
        y_fit = np.concatenate([y_fit, np.array(transition_y)])

    spelling_X, spelling_y = (
        build_fingerspelling_set(
            [raws[index] for index in train_idx], y_train, classes, rng,
            FINGERSPELLING_COPIES, nothing, builder, augment_fn,
        )
        if fingerspelling
        else ([], [])
    )
    if fingerspelling and not spelling_X:
        print(
            "AVISO: no se fabricaron ejemplos de deletreo (falta api/formas_letras.npz "
            f"o la clase {nothing}). El modelo puede confundir el deletreo con una seña."
        )
    if spelling_X:
        X_fit = np.concatenate([X_fit, np.stack(spelling_X).astype(np.float32)])
        y_fit = np.concatenate([y_fit, np.array(spelling_y)])

    counts = np.bincount(y_train, minlength=len(classes))
    class_weight = {
        index: float(len(y_train) / (len(classes) * count))
        for index, count in enumerate(counts)
        if count
    }

    print(f"\n=== Modelo de {spec['title']} ===")
    print(f"Clases: {classes}")
    print(
        f"Muestras train/valid/test: {len(train_idx)}/{len(valid_idx)}/{len(test_idx)} "
        f"(train con aumentación: {len(X_fit)}, de ellas {len(fluent_X)} de señado rápido,"
        f" {len(transition_X)} de transiciones y {len(spelling_X)} de deletreo)"
    )

    model = build_model(len(classes), X.shape[2], spec["keras_name"])
    model.summary()

    history = model.fit(
        X_fit,
        y_fit,
        validation_data=(X_valid, y_valid),
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        class_weight=class_weight,
        callbacks=[
            keras.callbacks.EarlyStopping(
                monitor="val_loss", patience=20, restore_best_weights=True
            ),
            keras.callbacks.ReduceLROnPlateau(
                monitor="val_loss", factor=0.5, patience=8, min_lr=1e-5
            ),
        ],
        verbose=2,
    )

    # Se exporta y se comprueba que la versión numpy (la que usa el backend)
    # da lo mismo que Keras antes de reemplazar el modelo actual.
    tmp_path, model_path = spec["tmp_path"], spec["model_path"]
    export_numpy_model(model, classes, tmp_path, meta)
    numpy_model = SequenceModel(tmp_path)
    numpy_model.check_compatible()
    held_out = np.concatenate([valid_idx, test_idx])
    max_diff = float(
        np.max(np.abs(model.predict(X[held_out], verbose=0) - numpy_model.predict_proba(X[held_out])))
    )

    if max_diff > 1e-3:
        tmp_path.unlink()
        raise RuntimeError(
            f"La inferencia numpy no coincide con Keras (diferencia {max_diff:.6f}). "
            "No se reemplazó el modelo."
        )

    if model_path.exists():
        model_path.replace(spec["backup_path"])
        print(f"Modelo anterior respaldado en: {spec['backup_path']}")

    tmp_path.replace(model_path)
    model.save(spec["keras_path"])

    fluency = fluency_accuracy(
        numpy_model,
        [raws[index] for index in held_out],
        y[held_out],
        classes,
        nothing,
        builder,
        (1.0, 1.5, 2.0) if spec["kind"] == SIGNS else (1.0, 1.5),
    )

    report = {
        "classes": classes,
        "samples_by_class": {label: int(np.sum(y == i)) for i, label in enumerate(classes)},
        "train_samples": len(train_idx),
        "valid_samples": len(valid_idx),
        "test_samples": len(test_idx),
        "augmented_copies": AUGMENTED_COPIES,
        "fluency_copies": FLUENCY_COPIES,
        "fluency_accuracy": fluency,
        **report_extra,
        "window_ms": WINDOW_MS,
        "sequence_length": SEQUENCE_LENGTH,
        "feature_size": int(X.shape[2]),
        "parameters": int(model.count_params()),
        "epochs_trained": len(history.history["loss"]),
        "best_val_accuracy": float(max(history.history["val_accuracy"])),
        "keras_numpy_max_diff": max_diff,
        "valid": evaluate(numpy_model.predict_proba(X_valid), y_valid, classes),
        "test": (
            evaluate(numpy_model.predict_proba(X[test_idx]), y[test_idx], classes)
            if len(test_idx)
            else None
        ),
    }
    spec["report_path"].write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"Modelo para el backend: {model_path}")
    print(f"Modelo Keras: {spec['keras_path']}")
    print(f"Reporte: {spec['report_path']}")
    print(f"Parámetros: {report['parameters']}")
    print(f"Accuracy valid: {report['valid']['accuracy']:.3f}")

    if report["test"]:
        print(f"Accuracy test: {report['test']['accuracy']:.3f}")

    print(f"Accuracy con muestras rápidas encadenadas (no vistas): {fluency}")
    return report


def train_signs():
    print(f"Leyendo señas: {data_dir(SIGN)}")
    labels, raws = load_samples(
        SIGN, lambda raw: build_sequence_features(raw["frames"], raw["aspect_ratio"], WINDOW_MS)
    )

    if not raws:
        raise RuntimeError(
            f"No hay muestras en {data_dir(SIGN)}. Grábalas desde la pantalla 'Grabar señas'."
        )

    motions = [motion_amount(raw["frames"], raw["aspect_ratio"], WINDOW_MS) for raw in raws]
    nothing = [motion for label, motion in zip(labels, motions) if label == NOTHING_LABEL]
    nothing_moving = sum(motion >= DEFAULT_MIN_MOTION for motion in nothing)

    if nothing and nothing_moving < len(nothing) / 2:
        print(
            f"AVISO: solo {nothing_moving} de {len(nothing)} muestras de {NOTHING_LABEL} "
            f"tienen movimiento. Graba también en {NOTHING_LABEL} movimientos que no sean "
            "señas (deletrear, saludar con el dorso, rascarte, mover las manos al azar) "
            "para que el modelo no tome cualquier movimiento como seña."
        )

    labels, raws = drop_small_classes(labels, raws, "señas")
    motions = [motion_amount(raw["frames"], raw["aspect_ratio"], WINDOW_MS) for raw in raws]
    min_motion, motion_by_class = compute_min_motion(labels, motions)
    face_location, face_share = decide_face_location(raws)

    # Formas de mano de cada seña (también reflejadas, si se entrena con
    # espejo). Solo informan, en el reporte: muestran qué letra se parece a
    # cada seña y por eso podría confundirse con ella (DEJAME_PENSAR y la K).
    profile_raws = raws + ([_mirror_raw(raw) for raw in raws] if MIRROR_HANDS else [])
    profile_labels = labels + (labels if MIRROR_HANDS else [])
    hand_shapes = hand_shape_profiles(profile_labels, profile_raws, NOTHING_LABEL)

    print(f"Filtro de movimiento: {min_motion} (movimiento por seña: {motion_by_class})")
    print(
        f"Muestras con cara: {face_share:.0%}. Ubicación de las manos respecto a la cara: "
        + ("sí" if face_location else "no (graba las señas viendo tu cara para activarla)")
    )
    if hand_shapes is None:
        print("AVISO: falta api/formas_letras.npz; no se guardan las formas de mano de cada seña.")
    else:
        print("Forma de mano principal de cada seña:", {
            sign: next(iter(shapes)) for sign, shapes in hand_shapes.items() if shapes
        })

    return train(
        SIGN_SPEC,
        labels,
        raws,
        builder=lambda frames, aspect: build_sequence_features(
            frames, aspect, WINDOW_MS, face_location
        ),
        augment_fn=lambda sequence, rng: augment(sequence, rng, face_location),
        speeds=FAST_SPEEDS,
        meta={
            "kind": SIGNS,
            "feature_version": FEATURE_VERSION,
            "min_motion": min_motion,
            "face_location": face_location,
        },
        report_extra={
            "transition_copies": TRANSITION_COPIES,
            "fingerspelling_copies": FINGERSPELLING_COPIES,
            "mirror_hands": MIRROR_HANDS,
            "min_motion": min_motion,
            "motion_by_class": motion_by_class,
            "face_location": face_location,
            "samples_with_face": round(face_share, 3),
            "hand_shapes": hand_shapes,
        },
        transitions=True,
        fingerspelling=True,
        mirror_fn=(lambda sequence: mirror(sequence, face_location)) if MIRROR_HANDS else None,
    )


def train_expressions(required: bool):
    directory = data_dir(EXPRESSION)
    print(f"\nLeyendo expresiones: {directory}")
    labels, raws = load_samples(
        EXPRESSION,
        lambda raw: build_expression_features(raw["frames"], raw["aspect_ratio"], WINDOW_MS),
    )

    try:
        if not raws:
            raise RuntimeError(
                f"No hay muestras de expresiones en {directory}. Grábalas desde "
                "'Grabar señas' > Expresiones."
            )

        labels, raws = drop_small_classes(labels, raws, "expresiones")
    except RuntimeError as exc:
        if required:
            raise

        print(f"{exc} Se omite el modelo de expresiones.")
        return None

    without_face = sum(
        face_ratio(raw["frames"], WINDOW_MS) < SAMPLE_MIN_FACE_RATIO for raw in raws
    )
    if without_face:
        print(f"AVISO: {without_face} muestras de expresiones casi no muestran la cara.")

    return train(
        EXPRESSION_SPEC,
        labels,
        raws,
        builder=lambda frames, aspect: build_expression_features(frames, aspect, WINDOW_MS),
        augment_fn=augment_expression,
        speeds=EXPRESSION_SPEEDS,
        meta={"kind": EXPRESSIONS, "feature_version": EXPRESSION_VERSION},
        report_extra={"mirror_faces": True},
    )


def main(args: list[str]):
    options = set(args)
    unknown = options - {"--senas", "--expresiones"}

    if unknown:
        raise SystemExit(
            f"Opción desconocida: {', '.join(sorted(unknown))}. Usa --senas o --expresiones."
        )

    only_signs = "--senas" in options and "--expresiones" not in options
    only_expressions = "--expresiones" in options and "--senas" not in options

    if not only_expressions:
        train_signs()

    if not only_signs:
        train_expressions(required=only_expressions)


if __name__ == "__main__":
    main(sys.argv[1:])
