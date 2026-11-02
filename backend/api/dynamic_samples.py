"""
Guarda y lee las muestras grabadas desde la app (pantalla "Grabar señas").

Cada muestra es un JSON con los frames crudos (landmarks + tiempo) en:
    backend/data/dynamic_signs/<SEÑA>/<milisegundos>_u<usuario>.json
    backend/data/expressions/<EXPRESIÓN>/<milisegundos>_u<usuario>.json

Se guardan crudos (no las características) para poder cambiar el
preprocesamiento más adelante sin tener que volver a grabar.
"""

from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("DYNAMIC_DATA_DIR", BASE_DIR / "data" / "dynamic_signs"))
EXPRESSION_DATA_DIR = Path(
    os.environ.get("EXPRESSION_DATA_DIR", BASE_DIR / "data" / "expressions")
)
MAX_SAMPLES_PER_LABEL = 500

SIGN = "sign"
EXPRESSION = "expression"
DATA_DIRS = {SIGN: DATA_DIR, EXPRESSION: EXPRESSION_DATA_DIR}

_LABEL_PATTERN = re.compile(r"^[A-Z0-9ÑÁÉÍÓÚÜ_]{1,30}$")
_FILE_PATTERN = re.compile(r"^\d+_u(\d+)\.json$")


def data_dir(kind: str = SIGN) -> Path:
    if kind not in DATA_DIRS:
        raise ValueError(f"Tipo de muestra desconocido: {kind}")

    return DATA_DIRS[kind]


def normalize_label(label: str) -> str:
    """'te quiero' -> 'TE_QUIERO'. También evita nombres de carpeta peligrosos."""
    clean = re.sub(r"[\s\-]+", "_", str(label or "").strip().upper()).strip("_")

    if not _LABEL_PATTERN.match(clean):
        raise ValueError(
            "Nombre inválido: usa solo letras, números y espacios (máximo 30)."
        )

    return clean


def _count(label_dir: Path) -> int:
    return sum(1 for _ in label_dir.glob("*.json"))


def count_samples(kind: str = SIGN) -> dict[str, int]:
    directory = data_dir(kind)

    if not directory.exists():
        return {}

    return {
        label_dir.name: _count(label_dir)
        for label_dir in sorted(directory.iterdir())
        if label_dir.is_dir()
    }


# Mismos criterios que el entrenamiento (train_dynamic.py): una muestra "tiene
# cara" si la cara se vio en al menos la mitad de sus cuadros, y la ubicación
# de la mano respecto a la cara se activa cuando el 80% de las muestras la tiene.
SAMPLE_MIN_FACE_RATIO = 0.5
FACE_LOCATION_MIN_SHARE = 0.8

# Las muestras no cambian después de guardarse: basta leer cada archivo una vez.
_face_cache: dict[str, bool] = {}


def _has_face(path: Path) -> bool:
    key = str(path)

    if key not in _face_cache:
        try:
            frames = json.loads(path.read_text(encoding="utf-8")).get("frames") or []
        except (OSError, ValueError):
            return False

        seen = sum(1 for frame in frames if frame.get("face"))
        _face_cache[key] = bool(frames) and seen / len(frames) >= SAMPLE_MIN_FACE_RATIO

    return _face_cache[key]


def count_samples_with_face(kind: str = SIGN) -> dict[str, int]:
    """Cuántas muestras de cada etiqueta se grabaron con la cara a la vista."""
    directory = data_dir(kind)

    if not directory.exists():
        return {}

    return {
        label_dir.name: sum(_has_face(path) for path in label_dir.glob("*.json"))
        for label_dir in sorted(directory.iterdir())
        if label_dir.is_dir()
    }


def save_sample(
    label, frames, aspect_ratio: float, window_ms: float, user_id: int, kind: str = SIGN
) -> dict:
    label = normalize_label(label)
    label_dir = data_dir(kind) / label
    label_dir.mkdir(parents=True, exist_ok=True)
    current = _count(label_dir)

    if current >= MAX_SAMPLES_PER_LABEL:
        raise ValueError(
            f"{label} ya tiene {current} muestras (máximo {MAX_SAMPLES_PER_LABEL})."
        )

    path = label_dir / f"{int(time.time() * 1000)}_u{user_id}.json"
    sample = {
        "label": label,
        "kind": kind,
        "window_ms": window_ms,
        "aspect_ratio": aspect_ratio,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "frames": frames,
    }
    path.write_text(json.dumps(sample, ensure_ascii=False), encoding="utf-8")

    return {"label": label, "kind": kind, "file": path.name, "count": current + 1}


def delete_sample(label: str, filename: str, user_id: int, kind: str = SIGN) -> None:
    label = normalize_label(label)
    match = _FILE_PATTERN.match(filename)

    if not match or int(match.group(1)) != user_id:
        raise PermissionError("Solo puedes borrar tus propias muestras")

    path = data_dir(kind) / label / filename

    if not path.exists():
        raise FileNotFoundError("La muestra no existe")

    path.unlink()


def iter_sample_paths(kind: str = SIGN):
    """Entrega (etiqueta, ruta) de cada muestra guardada."""
    directory = data_dir(kind)

    if not directory.exists():
        return

    for label_dir in sorted(directory.iterdir()):
        if not label_dir.is_dir():
            continue

        for path in sorted(label_dir.glob("*.json")):
            yield label_dir.name.upper(), path
