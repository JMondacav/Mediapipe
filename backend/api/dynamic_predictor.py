"""
Predicción con las CNN 1D que entrena api/train_dynamic.py:

- modelo_dinamico.npz: señas con movimiento.
- modelo_expresiones.npz: expresiones faciales que acompañan a las señas
  (pregunta, negación, etc.).

El entrenamiento usa TensorFlow/Keras, pero los modelos se exportan como
pesos numpy y aquí se recorren capa por capa con numpy. Así el backend no
necesita instalar TensorFlow.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np

from api.sequence_features import (
    EXPRESSION_FEATURE_SIZE,
    EXPRESSION_VERSION,
    FEATURE_VERSION,
    SEQUENCE_LENGTH,
    WINDOW_MS,
    FrameArrays,
    motion_amount,
    sequence_feature_size,
)

API_DIR = Path(__file__).resolve().parent
MODEL_PATH = API_DIR / "modelo_dinamico.npz"
EXPRESSION_MODEL_PATH = API_DIR / "modelo_expresiones.npz"
NOTHING_LABEL = "NADA"
NEUTRAL_LABEL = "NEUTRAL"

SIGNS = "signs"
EXPRESSIONS = "expressions"

# Bajo este movimiento (en "tamaños de mano") no hay seña y ni se consulta al
# modelo. El entrenamiento calcula el valor según las señas grabadas y lo
# guarda en el modelo (hay señas casi quietas, como DEJAME_PENSAR); 0,5 es el
# valor para modelos antiguos y el máximo. DYNAMIC_MIN_MOTION lo fuerza.
DEFAULT_MIN_MOTION = 0.5
_MIN_MOTION_OVERRIDE = os.environ.get("DYNAMIC_MIN_MOTION")

# Cache por archivo: un modelo se vuelve a cargar solo si cambia (al reentrenar).
_cache = {}


def _activate(x: np.ndarray, activation: str | None) -> np.ndarray:
    if activation in (None, "linear"):
        return x

    if activation == "relu":
        return np.maximum(x, 0)

    if activation == "softmax":
        exp = np.exp(x - np.max(x, axis=-1, keepdims=True))
        return exp / np.sum(exp, axis=-1, keepdims=True)

    raise ValueError(f"Activación no soportada: {activation}")


class SequenceModel:
    """CNN 1D exportada desde Keras, ejecutada con numpy."""

    def __init__(self, path: Path):
        with np.load(path, allow_pickle=False) as data:
            self.meta = json.loads(data["meta"].item())
            self.weights = {key: data[key] for key in data.files if key != "meta"}

        # Los modelos antiguos no guardan "kind" ni "face_location": son de
        # señas y solo miran las manos.
        self.kind = self.meta.get("kind", SIGNS)
        self.face_location = bool(self.meta.get("face_location", False))
        self.classes = list(self.meta["classes"])
        self.window_ms = float(self.meta["window_ms"])
        self.layers = self.meta["layers"]
        self.min_motion = float(
            _MIN_MOTION_OVERRIDE or self.meta.get("min_motion", DEFAULT_MIN_MOTION)
        )

    @property
    def feature_size(self) -> int:
        if self.kind == EXPRESSIONS:
            return EXPRESSION_FEATURE_SIZE

        return sequence_feature_size(self.face_location)

    def check_compatible(self):
        version = EXPRESSION_VERSION if self.kind == EXPRESSIONS else FEATURE_VERSION

        if (
            self.kind not in (SIGNS, EXPRESSIONS)
            or self.meta.get("feature_version") != version
            or self.meta.get("sequence_length") != SEQUENCE_LENGTH
            or self.meta.get("feature_size") != self.feature_size
        ):
            name = "de expresiones" if self.kind == EXPRESSIONS else "dinámico"
            raise RuntimeError(
                f"El modelo {name} se entrenó con otras características. "
                "Vuelve a entrenarlo con api/train_dynamic.py"
            )

    def features(self, frames, aspect_ratio: float) -> np.ndarray:
        """Matriz de entrada del modelo para los frames crudos de una ventana."""
        return self.window_features(FrameArrays(frames, aspect_ratio))

    def window_features(self, recording: FrameArrays, start: int = 0, stop: int | None = None) -> np.ndarray:
        """Matriz de entrada para la ventana start:stop de una grabación ya preparada."""
        if self.kind == EXPRESSIONS:
            return recording.expression_features(start, stop, self.window_ms)

        return recording.sign_features(start, stop, self.window_ms, self.face_location)

    def predict_proba(self, batch) -> np.ndarray:
        """batch: (N, SEQUENCE_LENGTH, feature_size) -> probabilidades (N, clases)"""
        x = np.asarray(batch, dtype=np.float32)

        for index, layer in enumerate(self.layers):
            x = self._run_layer(f"l{index}_", layer, x)

        return x

    def classify(self, frames, aspect_ratio: float) -> tuple[str, float]:
        """Clase más probable (y su confianza) para los frames crudos de una ventana."""
        probabilities = self.predict_proba(self.features(frames, aspect_ratio)[np.newaxis])[0]
        best = int(np.argmax(probabilities))
        return self.classes[best], float(probabilities[best])

    def _run_layer(self, prefix: str, layer: dict, x: np.ndarray) -> np.ndarray:
        kind = layer["type"]
        weights = self.weights

        if kind == "conv1d":
            # Conv1D de Keras con padding="same" y stride 1.
            kernel = weights[prefix + "kernel"]  # (ancho, entradas, filtros)
            width = kernel.shape[0]
            steps = x.shape[1]
            pad_before = (width - 1) // 2
            padded = np.pad(x, ((0, 0), (pad_before, width - 1 - pad_before), (0, 0)))
            windows = np.stack([padded[:, i : i + steps] for i in range(width)], axis=2)
            output = np.einsum("ntkc,kcf->ntf", windows, kernel) + weights[prefix + "bias"]
            return _activate(output, layer["activation"])

        if kind == "batch_norm":
            scale = weights[prefix + "gamma"] / np.sqrt(
                weights[prefix + "variance"] + layer["epsilon"]
            )
            return (x - weights[prefix + "mean"]) * scale + weights[prefix + "beta"]

        if kind == "max_pool1d":
            size, stride = layer["pool_size"], layer["strides"]
            count = (x.shape[1] - size) // stride + 1
            return np.stack(
                [x[:, i * stride : i * stride + size].max(axis=1) for i in range(count)],
                axis=1,
            )

        if kind == "global_avg_pool1d":
            return x.mean(axis=1)

        if kind == "dropout":
            return x

        if kind == "dense":
            output = x @ weights[prefix + "kernel"] + weights[prefix + "bias"]
            return _activate(output, layer["activation"])

        raise ValueError(f"Capa no soportada: {kind}")


def _load(path: Path, kind: str, missing_message: str) -> SequenceModel:
    if not path.exists():
        raise FileNotFoundError(missing_message)

    mtime = path.stat().st_mtime
    cached = _cache.get(path)

    if cached is None or cached[0] != mtime:
        model = SequenceModel(path)

        if model.kind != kind:
            expected = "expresiones" if kind == EXPRESSIONS else "señas"
            raise RuntimeError(f"{path.name} no es un modelo de {expected}")

        model.check_compatible()
        cached = (mtime, model)
        _cache[path] = cached

    return cached[1]


def get_model() -> SequenceModel:
    """Modelo de señas con movimiento."""
    return _load(
        MODEL_PATH,
        SIGNS,
        "Modelo dinámico no encontrado. Graba muestras en la app y "
        "entrénalo con api/train_dynamic.py",
    )


def get_expression_model() -> SequenceModel:
    """Modelo de expresiones faciales."""
    return _load(
        EXPRESSION_MODEL_PATH,
        EXPRESSIONS,
        "Modelo de expresiones no encontrado. Graba expresiones en la app y "
        "entrénalo con api/train_dynamic.py",
    )


def model_status(kind: str = SIGNS) -> dict:
    loader = get_expression_model if kind == EXPRESSIONS else get_model
    empty = {"ready": False, "classes": [], "window_ms": WINDOW_MS}

    try:
        model = loader()
    except FileNotFoundError:
        name = "de expresiones" if kind == EXPRESSIONS else "dinámico"
        return {**empty, "detail": f"Aún no hay un modelo {name} entrenado"}
    except Exception as exc:
        return {**empty, "detail": str(exc)}

    status = {"ready": True, "classes": model.classes, "window_ms": model.window_ms}

    if kind == SIGNS:
        status["face_location"] = model.face_location

    return status


def predict_sequence(frames, aspect_ratio: float) -> dict:
    """
    Recibe los frames crudos de la ventana más reciente.
    Devuelve dict: { 'label': 'J', 'confidence': 0.93, 'motion': 2.4, 'still': False }
    """
    model = get_model()
    motion = motion_amount(frames, aspect_ratio, model.window_ms)

    # Mano quieta: no puede ser una seña con movimiento.
    if motion < model.min_motion:
        return {"label": NOTHING_LABEL, "confidence": 1.0, "motion": motion, "still": True}

    label, confidence = model.classify(frames, aspect_ratio)
    return {"label": label, "confidence": confidence, "motion": motion, "still": False}
