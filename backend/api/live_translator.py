"""
Traductor en modo único: en cada ventana decide si la persona está haciendo
una seña con movimiento o deletreando una letra con la mano quieta, sin que
tenga que elegir el modo a mano.

- Hubo movimiento en la ventana: se consulta el modelo de señas (CNN 1D).
- La mano está quieta en el último medio segundo: se consulta el modelo de letras.
- La seña con movimiento tiene prioridad: si se reconoce con confianza, no se
  lee una letra.
"""

from __future__ import annotations

from api.dynamic_predictor import NOTHING_LABEL, get_model
from api.ml_predictor import predict_landmarks
from api.sequence_features import DEFAULT_ASPECT_RATIO, WINDOW_MS, main_hand, motion_amount

# Confianza mínima para aceptar una seña con movimiento.
SIGN_MIN_CONFIDENCE = 0.9

# Para leer una letra, la mano debe estar quieta en este último tramo.
# En las muestras grabadas, una mano quieta se mueve hasta 0,08 en medio
# segundo, y las señas nunca bajan de 0,35.
LETTER_STILL_MS = 500
LETTER_MAX_MOTION = 0.2


def translate_window(frames, aspect_ratio: float = DEFAULT_ASPECT_RATIO) -> dict:
    """
    Recibe los frames crudos más recientes y devuelve uno de estos:
        {'kind': 'sign', 'label': 'HOLA', 'confidence': 0.97, ...}
        {'kind': 'letter', 'label': 'A', 'confidence': 0.91, ...}
        {'kind': 'none', 'reason': 'no_hands' | 'moving' | 'low_confidence', ...}
    """
    if not frames:
        raise ValueError("La secuencia no tiene frames")

    frames = sorted(frames, key=lambda frame: frame["t"])

    try:
        sign_model = get_model()
    except FileNotFoundError:
        # Sin modelo de señas entrenado igual se pueden leer letras.
        sign_model = None

    window_ms = sign_model.window_ms if sign_model else WINDOW_MS
    motion = motion_amount(frames, aspect_ratio, window_ms)
    recent_motion = motion_amount(frames, aspect_ratio, LETTER_STILL_MS)
    result = {
        "kind": "none",
        "reason": "moving",
        "motion": motion,
        "recent_motion": recent_motion,
        "sign_model_ready": sign_model is not None,
    }

    if not any(frame.get("hands") for frame in frames):
        return {**result, "reason": "no_hands"}

    # 1) Seña con movimiento: necesita la ventana casi completa.
    window_complete = frames[-1]["t"] - frames[0]["t"] >= 0.9 * window_ms

    if sign_model is not None and window_complete and motion >= sign_model.min_motion:
        label, confidence = sign_model.classify(frames, aspect_ratio)

        if label != NOTHING_LABEL:
            if confidence >= SIGN_MIN_CONFIDENCE:
                return {**result, "kind": "sign", "label": label, "confidence": confidence}

            result.update(reason="low_confidence", label=label, confidence=confidence)

    # 2) Letra: la mano está quieta en el último tramo.
    hand = main_hand(frames[-1])

    if hand is not None and recent_motion < LETTER_MAX_MOTION:
        letter = predict_landmarks(hand)
        return {
            **result,
            "kind": "letter",
            "label": str(letter["label"]),
            "confidence": float(letter["confidence"]),
        }

    return result
