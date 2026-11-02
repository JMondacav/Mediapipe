"""
Traducción por grabación: la persona hace todas sus señas de corrido y, al
terminar, se analiza la grabación completa en vez de decidir palabra por
palabra en vivo.

Por qué es más fluido: en vivo hay que confirmar cada seña antes de seguir,
lo que obliga a hacer micro-pausas. Con la grabación entera se sabe qué pasó
antes y después de cada momento, así que basta con encontrar los tramos donde
una misma seña se mantiene.

1. La ventana de 1,5 s recorre la grabación cada 100 ms ("posiciones").
2. En cada posición, en pistas separadas: seña con movimiento (CNN 1D) si
   hubo movimiento, y letra (SVM) si la mano estuvo quieta los últimos 0,3 s.
   Así una letra puede ir justo antes o después de una seña sin esperar.
3. Varias posiciones seguidas con la misma seña forman una palabra; las letras
   seguidas forman una palabra deletreada. La postura con que empieza o
   termina una seña no se lee como letra.
4. Si la cámara también leyó la cara, el modelo de expresiones (otra CNN 1D)
   mira las mismas posiciones. La expresión que se mantiene durante una
   palabra la acompaña (cejas arriba = pregunta); una expresión sostenida sin
   ninguna seña (negar con la cabeza) aparece sola.

Para responder rápido, el frontend manda la grabación por trozos MIENTRAS se
graba (analyze_partial): cada posición se analiza una sola vez, apenas hay
frames para su ventana. Al terminar solo falta el último trozo y armar las
palabras (decode_streamed), así la espera no depende del largo de la
grabación. decode_recording analiza una grabación completa de una vez y da
el mismo resultado.
"""

from __future__ import annotations

import numpy as np

from api.dynamic_predictor import (
    NEUTRAL_LABEL,
    NOTHING_LABEL,
    get_expression_model,
    get_model,
)
from api.letter_shapes import nearest_letters
from api.live_translator import LETTER_MAX_MOTION, SIGN_MIN_CONFIDENCE
from api.ml_predictor import predict_landmarks_batch
from api.sequence_features import DEFAULT_ASPECT_RATIO, WINDOW_MS, FrameArrays, main_hand

STEP_MS = 100
# La primera posición, medio segundo después del comienzo de la grabación.
FIRST_STEP_MS = 500
# Al comienzo de la grabación todavía no hay 1,5 s de historia. Con señas
# rápidas la primera termina antes (~0,8 s), así que ahí basta con 0,5 s.
MIN_START_WINDOW_MS = 500
# Una seña debe repetirse en al menos 2 posiciones (200 ms) para contar.
SIGN_MIN_STEPS = 2
# La misma seña detectada dos veces con menos de 1 s entre medio es una sola
# palabra (la ventana de 1,5 s no puede separar repeticiones tan seguidas).
SAME_SIGN_MERGE_STEPS = 10

# Letras (modelo estático). Van en su propia pista, a la par de las señas
# con movimiento, así se pueden combinar sin esperar: basta con sostener la
# letra ~0,4 s (0,3 s quieta y 2 posiciones seguidas).
LETTER_STILL_MS = 300
# Los últimos 3 cuadros deben dar la misma letra, con confianza media ≥ 0,75.
# Con 0,9 para todas, varias letras casi nunca salían (S nunca; H, P, Q y X
# en menos del 11% de sus formas). La excepción es la B: una mano abierta en
# reposo se lee como B (95% de los cuadros en reposo), así que la B exige 0,9
# (con eso, solo un 4% de esos cuadros pasa).
LETTER_AGREE_FRAMES = 3
LETTER_MIN_CONFIDENCE = 0.75
REST_LIKE_LETTERS = {"B": 0.9}
LETTER_MIN_STEPS = 2
# Una pausa larga entre letras empieza una palabra deletreada nueva.
LETTER_WORD_GAP_MS = 1200
# Forma de la mano mientras se mueve, como la letra más parecida (ver
# letter_shapes.nearest_letters). Con las muestras grabadas, HOLA se mueve
# con forma de B, AURA de M y DEJAME_PENSAR de K. Sirve
# para reconocer la postura con que empieza o termina una seña, que no es una
# letra aunque se parezca a una.
# La forma de una seña se mide en sus posiciones de movimiento (desde 1 s
# antes de reconocerla hasta 0,3 s después): al menos 3 y la mitad de ellas.
# No sirve para descartar una "seña" hecha con una forma que esa seña no usa:
# se probó, y con señas rápidas la forma medida es la de la seña vecina, así
# que se perdían señas casi quietas como DEJAME_PENSAR (a 2,5x, 22/30 frases
# exactas en vez de 27/30).
SIGN_SHAPE_BEFORE_STEPS = 10
SIGN_SHAPE_AFTER_STEPS = 3
SIGN_SHAPE_MIN_STEPS = 3
SIGN_SHAPE_MIN_SHARE = 0.5
# Una letra con esa forma se descarta si está pegada a la seña: hasta 2 s
# antes (postura inicial) o 0,3 s después de su última detección (postura final).
SIGN_POSE_BEFORE_STEPS = 20
SIGN_POSE_AFTER_STEPS = 3
# Si mientras se detectaba una "seña" (desde 1,2 s antes y hasta 0,3 s antes
# de su última detección) empezaron 2 o más letras sostenidas, era deletreo y
# no una seña: una seña real no tiene letras quietas en medio de su movimiento.
FINGERSPELLING_BEFORE_STEPS = 12
FINGERSPELLING_END_MARGIN_STEPS = 3
FINGERSPELLING_LETTERS = 2

# Expresiones faciales.
EXPRESSION_MIN_CONFIDENCE = 0.8
# La ventana debe ver la cara en al menos el 60% de sus pasos.
EXPRESSION_MIN_FACE_RATIO = 0.6
# Para acompañar a una palabra, la expresión debe aparecer en al menos 2 de
# sus posiciones y en la mitad de ellas.
EXPRESSION_MIN_STEPS = 2
EXPRESSION_MIN_SHARE = 0.5
# Una expresión sin seña debe sostenerse ~0,5 s fuera de las palabras y ser
# muy segura.
EXPRESSION_ALONE_MIN_STEPS = 5
EXPRESSION_ALONE_MIN_CONFIDENCE = 0.9
# La ventana de 1,5 s sigue viendo la expresión de una palabra hasta ~1 s
# después: si la misma expresión sigue ahí, es la de esa palabra.
EXPRESSION_CONTINUES_STEPS = 10


def step_ends(start_time: float, last_time: float, after: float | None = None) -> np.ndarray:
    """
    Dónde termina la ventana en cada posición: cada STEP_MS desde medio
    segundo después del comienzo de la grabación. Con `after`, solo las
    posiciones posteriores (lo que falta analizar de una grabación en curso).
    """
    first_end = min(start_time + FIRST_STEP_MS, last_time)
    ends = np.arange(first_end, last_time + 1e-6, STEP_MS)
    return ends if after is None else ends[ends > after + 1e-6]


def _enough_history(recording: FrameArrays, start: int, stop: int, end: float, start_time: float, window_ms: float) -> bool:
    at_start = end - start_time < window_ms
    needed = MIN_START_WINDOW_MS if at_start else 0.9 * window_ms
    return recording.times[stop - 1] - recording.times[start] >= needed


def _empty_step(end: float) -> dict:
    return {"end": float(end), "kind": None, "label": None, "confidence": 0.0}


def classify_steps(recording: FrameArrays, sign_model, ends, start_time: float):
    """
    Qué hay en cada posición, en tres pistas alineadas: seña con movimiento,
    letra (mano quieta) y forma de la mano mientras se mueve.
    """
    window_ms = sign_model.window_ms if sign_model else WINDOW_MS

    signs, letters, shapes = [], [], []
    sign_inputs = []
    letter_inputs = []  # (posición, manos de los últimos cuadros)
    shape_inputs = []  # (posición, mano)

    for end in ends:
        for track in (signs, letters, shapes):
            track.append(_empty_step(end))

        start, stop = recording.window(end, window_ms)

        if stop == start or not recording.has_hands(start, stop):
            continue

        index = len(signs) - 1

        if sign_model is not None and _enough_history(recording, start, stop, end, start_time, window_ms):
            if recording.motion(start, stop, window_ms) >= sign_model.min_motion:
                sign_inputs.append((index, sign_model.window_features(recording, start, stop)))

        hand = main_hand(recording.frames[stop - 1])

        if hand is None:
            continue

        if recording.motion(start, stop, LETTER_STILL_MS, robust_size=True) < LETTER_MAX_MOTION:
            recent = recording.frames[max(start, stop - LETTER_AGREE_FRAMES) : stop]
            hands = [found for found in map(main_hand, recent) if found is not None]
            letter_inputs.append((index, hands))
        else:
            shape_inputs.append((index, hand))

    # Todas las manos quietas van al modelo de letras de una sola vez.
    predictions = predict_landmarks_batch([hand for _, hands in letter_inputs for hand in hands])
    position = 0

    for index, hands in letter_inputs:
        found = predictions[position : position + len(hands)]
        position += len(hands)
        labels = {str(prediction["label"]) for prediction in found}
        confidence = float(np.mean([prediction["confidence"] for prediction in found]))

        if len(labels) == 1:
            label = labels.pop()

            if confidence >= REST_LIKE_LETTERS.get(label, LETTER_MIN_CONFIDENCE):
                letters[index].update(kind="letter", label=label, confidence=confidence)

    for (index, _), (label, distance) in zip(
        shape_inputs, nearest_letters([hand for _, hand in shape_inputs]) or []
    ):
        shapes[index].update(kind="shape", label=label, confidence=round(1.0 / (1.0 + distance), 3))

    if sign_inputs:
        # Todas las ventanas con movimiento van al modelo de señas de una vez.
        probabilities = sign_model.predict_proba(np.stack([item[1] for item in sign_inputs]))

        for (index, _), probs in zip(sign_inputs, probabilities):
            best = int(np.argmax(probs))
            label, confidence = sign_model.classes[best], float(probs[best])

            if label != NOTHING_LABEL and confidence >= SIGN_MIN_CONFIDENCE:
                signs[index].update(kind="sign", label=label, confidence=confidence)

    return signs, letters, shapes


def classify_expressions(recording: FrameArrays, expression_model, ends, start_time: float) -> list[dict]:
    """Expresión (que no sea NEUTRAL) en cada posición de la ventana, o nada."""
    window_ms = expression_model.window_ms

    steps = []
    inputs = []

    for end in ends:
        steps.append(_empty_step(end))
        start, stop = recording.window(end, window_ms)

        if (
            stop > start
            and _enough_history(recording, start, stop, end, start_time, window_ms)
            and recording.face_ratio(start, stop, window_ms) >= EXPRESSION_MIN_FACE_RATIO
        ):
            inputs.append((len(steps) - 1, expression_model.window_features(recording, start, stop)))

    if inputs:
        probabilities = expression_model.predict_proba(np.stack([item[1] for item in inputs]))

        for (index, _), probs in zip(inputs, probabilities):
            best = int(np.argmax(probs))
            label, confidence = expression_model.classes[best], float(probs[best])

            if label != NEUTRAL_LABEL and confidence >= EXPRESSION_MIN_CONFIDENCE:
                steps[index].update(kind="expression", label=label, confidence=confidence)

    return steps


def _same(a: dict, b: dict) -> bool:
    return a["kind"] is not None and a["kind"] == b["kind"] and a["label"] == b["label"]


def smooth_steps(steps: list[dict]) -> None:
    """Una posición distinta entre dos iguales es un parpadeo: se corrige."""
    for index in range(1, len(steps) - 1):
        previous, current, following = steps[index - 1], steps[index], steps[index + 1]

        if _same(previous, following) and not _same(previous, current):
            current.update(
                kind=previous["kind"],
                label=previous["label"],
                confidence=min(previous["confidence"], following["confidence"]),
            )


def find_segments(steps: list[dict]) -> list[dict]:
    """Agrupa posiciones seguidas con la misma seña, letra o expresión."""
    segments = []

    for index, step in enumerate(steps):
        if step["kind"] is None:
            continue

        last = segments[-1] if segments else None

        if last and last["last"] == index - 1 and _same(last, step):
            last["last"] = index
            last["confidences"].append(step["confidence"])
        else:
            segments.append({
                "kind": step["kind"],
                "label": step["label"],
                "first": index,
                "last": index,
                "confidences": [step["confidence"]],
            })

    return segments


def keep_sign_segments(segments: list[dict], steps: list[dict]) -> list[dict]:
    """Descarta señas demasiado cortas y une repeticiones muy seguidas de la misma seña."""
    kept = []

    for segment in segments:
        at_end = segment["last"] == len(steps) - 1
        supported = segment["last"] - segment["first"] + 1 >= SIGN_MIN_STEPS
        # Si la grabación se cortó justo al terminar la seña, basta una
        # posición muy segura.
        if not (supported or (at_end and max(segment["confidences"]) >= 0.95)):
            continue

        previous = kept[-1] if kept else None
        if (
            previous is not None
            and _same(previous, segment)
            and segment["first"] - previous["last"] - 1 <= SAME_SIGN_MERGE_STEPS
        ):
            previous["last"] = segment["last"]
            previous["confidences"] = previous["confidences"] + segment["confidences"]
        else:
            kept.append(segment)

    return kept


def _overlaps(segment: dict, first: int, last: int) -> bool:
    return segment["first"] <= last and first <= segment["last"]


def sign_shape(sign: dict, shapes: list[dict]):
    """La forma de la mano con que se movió una seña (la letra a la que más se parece), o None."""
    first = max(0, sign["first"] - SIGN_SHAPE_BEFORE_STEPS)
    moving = [step["label"] for step in shapes[first : sign["first"] + SIGN_SHAPE_AFTER_STEPS + 1] if step["kind"]]

    if not moving:
        return None

    label = max(set(moving), key=moving.count)
    count = moving.count(label)
    return label if count >= SIGN_SHAPE_MIN_STEPS and count >= SIGN_SHAPE_MIN_SHARE * len(moving) else None


def combine_signs_and_letters(signs: list[dict], letters: list[dict], shapes: list[dict]):
    """
    Junta las dos pistas:
    - Una "seña" cuyo movimiento tuvo 2 o más letras sostenidas era deletreo.
    - Una letra con la misma forma que una seña, pegada a ella, es la postura
      con que empieza o termina esa seña (no se escribe). Las demás letras se
      escriben aunque estén justo antes o después de la seña.
    """
    sign_segments = keep_sign_segments(find_segments(signs), signs)
    letter_segments = [
        segment
        for segment in find_segments(letters)
        if segment["last"] - segment["first"] + 1 >= LETTER_MIN_STEPS
    ]

    sign_segments = [
        sign
        for sign in sign_segments
        if sum(
            sign["first"] - FINGERSPELLING_BEFORE_STEPS
            <= letter["first"]
            <= sign["last"] - FINGERSPELLING_END_MARGIN_STEPS
            for letter in letter_segments
        ) < FINGERSPELLING_LETTERS
    ]

    for sign in sign_segments:
        shape = sign_shape(sign, shapes)

        if shape is None:
            continue

        letter_segments = [
            letter
            for letter in letter_segments
            if not (
                letter["label"] == shape
                and _overlaps(
                    letter,
                    sign["first"] - SIGN_POSE_BEFORE_STEPS,
                    sign["last"] + SIGN_POSE_AFTER_STEPS,
                )
            )
        ]

    return sorted(sign_segments + letter_segments, key=lambda segment: (segment["first"], segment["last"]))


def build_items(tokens: list[dict]) -> list[dict]:
    """
    Una entrada por seña, en el orden en que salieron. Lo único que se junta
    son las letras deletreadas seguidas ("J","U","A","N" -> "JUAN"); nada se
    interpreta ni se reordena.
    """
    items = []
    previous = None

    for token in tokens:
        label = token["label"].replace("_", " ")
        is_letter = token["kind"] == "letter" and len(label) == 1
        continues_word = (
            is_letter
            and previous is not None
            and previous["kind"] == "letter"
            and len(previous["label"]) == 1
            and token["start_ms"] - previous["end_ms"] <= LETTER_WORD_GAP_MS
        )

        if continues_word:
            item = items[-1]
            item["text"] += label
            item["end_ms"] = token["end_ms"]
            item["last_step"] = token.get("last_step")
            item["confidences"].append(token["confidence"])
        else:
            items.append({
                "text": label,
                "kind": "sign" if token["kind"] == "sign" else "letters",
                "expression": None,
                "start_ms": token["start_ms"],
                "end_ms": token["end_ms"],
                "first_step": token.get("first_step"),
                "last_step": token.get("last_step"),
                "confidences": [token["confidence"]],
            })

        previous = token

    return items


def build_words(tokens: list[dict]) -> list[str]:
    return [item["text"] for item in build_items(tokens)]


def dominant_expression(expression_steps: list[dict], first: int, last: int):
    """La expresión que se mantiene entre las posiciones first y last, o None."""
    span = expression_steps[first : last + 1]
    by_label = {}

    for step in span:
        if step["kind"] is not None:
            by_label.setdefault(step["label"], []).append(step["confidence"])

    if not by_label:
        return None

    label, confidences = max(by_label.items(), key=lambda item: len(item[1]))
    needed = max(min(EXPRESSION_MIN_STEPS, len(span)), EXPRESSION_MIN_SHARE * len(span))

    if len(confidences) < needed:
        return None

    return label, float(np.mean(confidences))


def standalone_expressions(expression_steps: list[dict], items: list[dict]) -> list[dict]:
    """
    Tramos con una expresión sostenida que no pertenece a ninguna palabra
    (por ejemplo, negar con la cabeza sin hacer una seña).
    """
    standalone = []

    for segment in find_segments(expression_steps):
        # La misma expresión de una palabra que se superpone o recién terminó.
        continues_word = any(
            item["expression"] == segment["label"]
            and segment["first"] <= item["last_step"] + EXPRESSION_CONTINUES_STEPS
            and item["first_step"] <= segment["last"]
            for item in items
        )
        if continues_word:
            continue

        free = [
            index
            for index in range(segment["first"], segment["last"] + 1)
            if not any(item["first_step"] <= index <= item["last_step"] for item in items)
        ]
        confidences = [expression_steps[index]["confidence"] for index in free]

        if (
            len(free) >= EXPRESSION_ALONE_MIN_STEPS
            and float(np.mean(confidences)) >= EXPRESSION_ALONE_MIN_CONFIDENCE
        ):
            standalone.append({
                **segment,
                "first": free[0],
                "last": free[-1],
                "confidences": confidences,
            })

    return standalone


def decode_recording(frames, aspect_ratio: float = DEFAULT_ASPECT_RATIO) -> dict:
    """
    Recibe todos los frames de una grabación y devuelve las señas tal cual:
        {'items': [{'text': 'HOLA', 'kind': 'sign', 'expression': 'PREGUNTA', ...}],
         'words': ['HOLA'], 'glosses': 'HOLA', 'tokens': [...], ...}
    """
    if not frames:
        raise ValueError("La grabación no tiene frames")

    recording = FrameArrays(frames, aspect_ratio)
    sign_model, expression_model = _models()
    start_time = float(recording.times[0])
    _, tracks, expression_steps = analyze(recording, start_time, None, sign_model, expression_model)

    return finalize(
        tracks,
        expression_steps,
        start_time,
        float(recording.times[-1]),
        sign_model,
        expression_model,
        float(np.mean(recording.face_listed)),
    )


def _models():
    try:
        sign_model = get_model()
    except FileNotFoundError:
        # Sin modelo de señas entrenado igual se pueden leer letras.
        sign_model = None

    try:
        expression_model = get_expression_model()
    except (FileNotFoundError, RuntimeError):
        # Sin modelo de expresiones (o uno antiguo) se traducen solo las manos.
        expression_model = None

    return sign_model, expression_model


def analyze(recording: FrameArrays, start_time: float, after, sign_model, expression_model):
    """
    Clasifica las posiciones de la grabación que terminan después de `after`.
    Devuelve las pistas {"sign", "letter", "shape"} y la de expresiones.
    """
    ends = step_ends(start_time, float(recording.times[-1]), after)
    signs, letters, shapes = classify_steps(recording, sign_model, ends, start_time)
    tracks = {"sign": signs, "letter": letters, "shape": shapes}

    if expression_model is not None and recording.face_listed.any():
        expression_steps = classify_expressions(recording, expression_model, ends, start_time)
    else:
        expression_steps = [_empty_step(end) for end in ends]

    return ends, tracks, expression_steps


def _compact(steps: list[dict]) -> list[dict]:
    return [step for step in steps if step["kind"] is not None]


def _compact_tracks(tracks: dict) -> list[dict]:
    return [step for track in tracks.values() for step in _compact(track)]


def analyze_partial(frames, aspect_ratio: float, start_time: float, after: float | None) -> dict:
    """
    Analiza un trozo de una grabación en curso: las posiciones que terminan
    después de `after` (la última ya analizada). El trozo debe traer al menos
    1,7 s de frames antes de `after`, para que las ventanas queden completas.
    Devuelve solo las posiciones con algo y hasta dónde llegó.
    """
    recording = FrameArrays(frames, aspect_ratio)

    # Todavía no hay medio segundo de grabación: no hay posiciones.
    if recording.times[-1] < start_time + FIRST_STEP_MS:
        return {"steps": [], "expression_steps": [], "until": after}

    sign_model, expression_model = _models()
    ends, tracks, expression_steps = analyze(recording, start_time, after, sign_model, expression_model)

    return {
        "steps": _compact_tracks(tracks),
        "expression_steps": _compact(expression_steps),
        "until": float(ends[-1]) if len(ends) else after,
    }


def decode_streamed(
    frames,
    aspect_ratio: float,
    start_time: float,
    after: float | None,
    end_time: float | None,
    known_steps: list[dict],
    known_expression_steps: list[dict],
) -> dict:
    """
    Termina una grabación analizada por trozos: analiza el último trozo,
    junta todas las posiciones y arma las palabras. `end_time` recorta el
    final (medio segundo después de la última mano), como decode_recording
    con la grabación recortada.
    """
    frames = sorted(frames, key=lambda frame: frame["t"])

    if end_time is not None:
        frames = [frame for frame in frames if frame["t"] <= end_time]

    # La grabación termina en su último frame (como en decode_recording).
    last_time = float(frames[-1]["t"]) if frames else float(end_time)

    sign_model, expression_model = _models()
    ends = step_ends(start_time, last_time)
    tracks = {kind: [_empty_step(end) for end in ends] for kind in ("sign", "letter", "shape")}
    expression_steps = [_empty_step(end) for end in ends]

    def place(found: list[dict], expression: bool = False):
        for step in found:
            index = int(round((step["end"] - ends[0]) / STEP_MS)) if len(ends) else -1
            target = expression_steps if expression else tracks.get(step["kind"])

            if target is not None and 0 <= index < len(target) and step["end"] <= last_time + 1e-6:
                target[index].update(kind=step["kind"], label=step["label"], confidence=step["confidence"])

    place(known_steps)
    place(known_expression_steps, expression=True)
    face_ratio = 0.0

    if frames:
        recording = FrameArrays(frames, aspect_ratio)
        _, new_tracks, new_expression_steps = analyze(
            recording, start_time, after, sign_model, expression_model
        )
        place(_compact_tracks(new_tracks))
        place(_compact(new_expression_steps), expression=True)
        face_ratio = float(np.mean(recording.face_listed))

    return finalize(
        tracks, expression_steps, start_time, last_time, sign_model, expression_model, face_ratio
    )


def finalize(
    tracks: dict,
    expression_steps: list[dict],
    start_time: float,
    last_time: float,
    sign_model,
    expression_model,
    face_ratio: float,
) -> dict:
    """Arma las palabras (con su expresión) a partir de las posiciones clasificadas."""
    window_ms = sign_model.window_ms if sign_model else WINDOW_MS
    expression_window_ms = expression_model.window_ms if expression_model else WINDOW_MS
    steps = tracks["sign"]
    smooth_steps(tracks["sign"])
    smooth_steps(tracks["letter"])
    segments = combine_signs_and_letters(tracks["sign"], tracks["letter"], tracks["shape"])

    tokens = []
    for segment in segments:
        lookback = window_ms if segment["kind"] == "sign" else LETTER_STILL_MS
        tokens.append({
            "kind": segment["kind"],
            "label": segment["label"],
            "start_ms": max(0, round(steps[segment["first"]]["end"] - lookback - start_time)),
            "end_ms": round(steps[segment["last"]]["end"] - start_time),
            "confidence": round(float(np.mean(segment["confidences"])), 3),
            "first_step": segment["first"],
            "last_step": segment["last"],
        })

    items = build_items(tokens)

    if any(step["kind"] for step in expression_steps):
        smooth_steps(expression_steps)

        for item in items:
            found = dominant_expression(expression_steps, item["first_step"], item["last_step"])

            if found is not None:
                item["expression"], item["expression_confidence"] = found[0], round(found[1], 3)

        for segment in standalone_expressions(expression_steps, items):
            confidence = round(float(np.mean(segment["confidences"])), 3)
            items.append({
                "text": "",
                "kind": "expression",
                "expression": segment["label"],
                "expression_confidence": confidence,
                "start_ms": max(
                    0, round(expression_steps[segment["first"]]["end"] - expression_window_ms - start_time)
                ),
                "end_ms": round(expression_steps[segment["last"]]["end"] - start_time),
                "first_step": segment["first"],
                "last_step": segment["last"],
                "confidences": [confidence],
            })

        items.sort(key=lambda item: item["first_step"])

    for item in items:
        item["confidence"] = round(float(np.mean(item.pop("confidences"))), 3)
        item.pop("first_step")
        item.pop("last_step")
        item.setdefault("expression_confidence", None)

    for token in tokens:
        token.pop("first_step")
        token.pop("last_step")

    words = [item["text"] for item in items if item["kind"] != "expression"]

    return {
        "items": items,
        "words": words,
        "glosses": " ".join(words),
        "tokens": tokens,
        "duration_ms": round(last_time - start_time),
        "steps": len(steps),
        "sign_model_ready": sign_model is not None,
        "expression_model_ready": expression_model is not None,
        "face_ratio": round(face_ratio, 3),
    }
