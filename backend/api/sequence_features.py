"""
Convierte una grabación de landmarks en las matrices que usan los modelos CNN 1D:

- Señas: SEQUENCE_LENGTH pasos x sequence_feature_size() características
  (las manos y, si el modelo lo usa, dónde están respecto a la cara).
- Expresiones faciales: SEQUENCE_LENGTH pasos x EXPRESSION_FEATURE_SIZE
  (cejas, ojos, boca, mejillas y movimiento de la cabeza).

El mismo código se usa al guardar muestras, al entrenar y al predecir, para
que los modelos siempre reciban los datos preparados de la misma forma.

Formato de entrada (lo que envía el frontend):
    frames = [
        {
            "t": 1234.5,
            "hands": [{"handedness": "Right", "landmarks": [x0, y0, z0, ... z20]}],
            "face": {"blendshapes": [52 valores], "points": [15 valores]},  # opcional
        },
        ...
    ]
"""

from __future__ import annotations

import numpy as np

# Súbelo si cambias cómo se calculan las características: obliga a reentrenar.
FEATURE_VERSION = 1

SEQUENCE_LENGTH = 30
WINDOW_MS = 1500
DEFAULT_ASPECT_RATIO = 4 / 3

HAND_SLOTS = ("Left", "Right")
LANDMARK_VALUES = 63
# Por mano: forma (63) + trayectoria de la muñeca (x, y) + presencia (1)
TRAJECTORY_OFFSET = LANDMARK_VALUES
PRESENCE_OFFSET = LANDMARK_VALUES + 2
FEATURES_PER_HAND = LANDMARK_VALUES + 3
FEATURE_SIZE = FEATURES_PER_HAND * len(HAND_SLOTS)

# ---------------------------------------------------------------- cara
#
# "blendshapes": las 52 expresiones de MediaPipe FaceLandmarker (0 a 1), en el
# orden de su índice. "points": x, y, z de los puntos FACE_POINT_IDS de la
# malla de 478 puntos. No se envía ni se guarda ninguna imagen de la cara.
BLENDSHAPE_NAMES = (
    "_neutral", "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft",
    "browOuterUpRight", "cheekPuff", "cheekSquintLeft", "cheekSquintRight",
    "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight",
    "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight",
    "eyeLookUpLeft", "eyeLookUpRight", "eyeSquintLeft", "eyeSquintRight",
    "eyeWideLeft", "eyeWideRight", "jawForward", "jawLeft", "jawOpen", "jawRight",
    "mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft",
    "mouthFrownRight", "mouthFunnel", "mouthLeft", "mouthLowerDownLeft",
    "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight", "mouthPucker",
    "mouthRight", "mouthRollLower", "mouthRollUpper", "mouthShrugLower",
    "mouthShrugUpper", "mouthSmileLeft", "mouthSmileRight", "mouthStretchLeft",
    "mouthStretchRight", "mouthUpperUpLeft", "mouthUpperUpRight", "noseSneerLeft",
    "noseSneerRight",
)
# Punta de la nariz, frente, mentón y los dos costados de la cara.
FACE_POINT_IDS = (1, 10, 152, 234, 454)
FACE_POINT_VALUES = 3 * len(FACE_POINT_IDS)
NOSE, FOREHEAD, CHIN, SIDE_A, SIDE_B = range(len(FACE_POINT_IDS))

# Ubicación de las manos respecto a la cara (solo si el modelo de señas la
# usa): por mano, el centro de la palma y la punta del índice respecto a la
# nariz, medidos en "altos de cara"; al final, una columna que indica si se
# vio la cara. Así se distinguen señas iguales hechas en la frente o en el mentón.
PALM_POINTS = (0, 5, 9, 13, 17)
INDEX_TIP = 8
FACE_LOCATION_PER_HAND = 4
FACE_LOCATION_OFFSET = FEATURE_SIZE
FACE_LOCATION_SIZE = FACE_LOCATION_PER_HAND * len(HAND_SLOTS) + 1
FACE_PRESENCE_COLUMN = FACE_LOCATION_OFFSET + FACE_LOCATION_SIZE - 1

# Expresiones: se descartan "_neutral" y hacia dónde miran los ojos
# (eyeLook*), que cambian con la mirada y no con la expresión.
EXPRESSION_VERSION = 1
EXPRESSION_BLENDSHAPES = tuple(
    name for name in BLENDSHAPE_NAMES
    if name != "_neutral" and not name.startswith("eyeLook")
)
EXPRESSION_BLENDSHAPE_INDICES = np.array(
    [BLENDSHAPE_NAMES.index(name) for name in EXPRESSION_BLENDSHAPES]
)
# Después de las expresiones: giro, inclinación y ladeo de la cabeza (en
# radianes), los mismos ángulos respecto al promedio de la ventana (asentir,
# negar), el movimiento de la nariz y si se vio la cara.
POSE_OFFSET = len(EXPRESSION_BLENDSHAPES)
POSE_MOTION_OFFSET = POSE_OFFSET + 3
NOSE_TRAJECTORY_OFFSET = POSE_MOTION_OFFSET + 3
FACE_PRESENT_OFFSET = NOSE_TRAJECTORY_OFFSET + 2
EXPRESSION_FEATURE_SIZE = FACE_PRESENT_OFFSET + 1


def sequence_feature_size(face_location: bool = False) -> int:
    """Columnas por paso del modelo de señas, con o sin la ubicación respecto a la cara."""
    return FEATURE_SIZE + (FACE_LOCATION_SIZE if face_location else 0)


def has_face(frame) -> bool:
    face = frame.get("face")
    return bool(face) and len(face.get("points") or []) == FACE_POINT_VALUES


def read_face(frame, aspect_ratio: float):
    """
    (puntos, expresiones, alto de la cara) de un frame, o None si no trae cara.
    Los puntos quedan con x y z en unidades de alto, igual que las manos.
    """
    face = frame.get("face")

    if not face:
        return None

    try:
        points = np.asarray(face["points"], dtype=np.float64)
        blendshapes = np.asarray(face["blendshapes"], dtype=np.float64)
    except (KeyError, TypeError, ValueError):
        return None

    if points.size != FACE_POINT_VALUES or blendshapes.size != len(BLENDSHAPE_NAMES):
        return None

    points = points.reshape(-1, 3) * np.array([aspect_ratio, 1.0, aspect_ratio])
    height = float(np.linalg.norm(points[CHIN, :2] - points[FOREHEAD, :2]))

    if not np.isfinite(height) or height <= 1e-6:
        return None

    return points, np.clip(blendshapes, 0.0, 1.0), height


def main_hand(frame) -> list | None:
    """La mano más grande del frame (la más cercana a la cámara)."""
    best, best_size = None, -1.0

    for hand in frame.get("hands") or []:
        points = np.asarray(hand["landmarks"], dtype=np.float64).reshape(21, 3)
        size = float(np.linalg.norm(points[9, :2] - points[0, :2]))

        if size > best_size:
            best, best_size = hand["landmarks"], size

    return best


def sample_frame_indices(timestamps, window_ms: float = WINDOW_MS) -> np.ndarray:
    """
    Elige SEQUENCE_LENGTH frames equiespaciados en el tiempo dentro de la
    ventana que termina en el último frame. Así la secuencia dura siempre lo
    mismo, aunque la cámara vaya a 10 o a 30 fps.
    """
    timestamps = np.asarray(timestamps, dtype=np.float64)

    if len(timestamps) == 1:
        return np.zeros(SEQUENCE_LENGTH, dtype=int)

    targets = np.linspace(timestamps[-1] - window_ms, timestamps[-1], SEQUENCE_LENGTH)
    right = np.clip(np.searchsorted(timestamps, targets), 1, len(timestamps) - 1)
    left = right - 1
    use_left = (targets - timestamps[left]) <= (timestamps[right] - targets)

    return np.where(use_left, left, right)


def assign_hand_slots(hands) -> list:
    """Ubica cada mano en su casilla (izquierda / derecha) según MediaPipe."""
    slots = [None] * len(HAND_SLOTS)
    unassigned = []

    for hand in hands[: len(HAND_SLOTS)]:
        name = str(hand.get("handedness") or "").strip().capitalize()

        if name in HAND_SLOTS and slots[HAND_SLOTS.index(name)] is None:
            slots[HAND_SLOTS.index(name)] = hand["landmarks"]
        else:
            unassigned.append(hand["landmarks"])

    # Si MediaPipe etiqueta las dos manos igual, la segunda va a la casilla libre.
    for landmarks in unassigned:
        for slot, current in enumerate(slots):
            if current is None:
                slots[slot] = landmarks
                break

    return slots


def head_pose(points: np.ndarray) -> np.ndarray:
    """
    Giro (yaw), inclinación (pitch) y ladeo (roll) aproximados de la cabeza, en
    radianes, a partir de la profundidad de los costados, la frente y el mentón.
    Recibe los puntos de una cara (5, 3) o de varias (N, 5, 3).
    """
    side = points[..., SIDE_B, :] - points[..., SIDE_A, :]
    vertical = points[..., CHIN, :] - points[..., FOREHEAD, :]
    width = np.maximum(np.abs(side[..., 0]), 1e-6)

    yaw = np.arctan2(side[..., 2], width)
    pitch = np.arctan2(vertical[..., 2], np.maximum(vertical[..., 1], 1e-6))
    roll = np.arctan2(side[..., 1], width)
    return np.stack([yaw, pitch, roll], axis=-1)


class FrameArrays:
    """
    Una grabación convertida a arrays una sola vez: la forma, la muñeca y el
    tamaño de cada mano y la cara de cada frame. Las ventanas se arman después
    tomando filas, sin volver a leer los frames; así el análisis de una
    grabación larga, donde cada frame cae en ~15 ventanas, es mucho más rápido.

    start y stop (índices de frame) delimitan una ventana; la ventana termina
    en el frame stop - 1, igual que si se le pasaran solo esos frames.
    """

    def __init__(self, frames, aspect_ratio: float = DEFAULT_ASPECT_RATIO):
        if not frames:
            raise ValueError("La secuencia no tiene frames")

        self.frames = sorted(frames, key=lambda frame: frame["t"])
        self.times = np.array([frame["t"] for frame in self.frames], dtype=np.float64)
        count = len(self.frames)
        slots = len(HAND_SLOTS)

        # MediaPipe entrega x e y entre 0 y 1 respecto al ancho y alto del
        # video. Se pasa x (y z, que usa la misma escala) a unidades de alto
        # para que un círculo no se vea como elipse según la orientación de la
        # cámara.
        axis_scale = np.array([aspect_ratio, 1.0, aspect_ratio])
        points = np.zeros((count, slots, 21, 3))
        self.hand_present = np.zeros((count, slots), dtype=bool)

        face_points = np.zeros((count, len(FACE_POINT_IDS), 3))
        self.blendshapes = np.zeros((count, len(BLENDSHAPE_NAMES)))
        self.face_heights = np.ones(count)
        self.face_present = np.zeros(count, dtype=bool)
        self.face_listed = np.zeros(count, dtype=bool)

        for index, frame in enumerate(self.frames):
            for slot, landmarks in enumerate(assign_hand_slots(frame.get("hands") or [])):
                if landmarks is None:
                    continue

                values = np.asarray(landmarks, dtype=np.float64)

                if values.size != LANDMARK_VALUES:
                    raise ValueError(
                        f"Cada mano debe tener {LANDMARK_VALUES} valores, "
                        f"se recibieron {values.size}"
                    )

                points[index, slot] = values.reshape(21, 3) * axis_scale
                self.hand_present[index, slot] = True

            self.face_listed[index] = has_face(frame)
            face = read_face(frame, aspect_ratio)

            if face is not None:
                face_points[index], self.blendshapes[index], self.face_heights[index] = face
                self.face_present[index] = True

        # Forma normalizada igual que el modelo estático: centrada en la
        # muñeca y escalada al tamaño de la mano.
        centered = points - points[:, :, :1]
        scale = np.max(np.linalg.norm(centered, axis=3), axis=2)
        # Largo de la mano (muñeca al punto más lejano, en 3D): con la mano de
        # perfil hacia la cámara (por ejemplo la X) no se achica como la palma.
        self.hand_lengths = scale
        scale = np.where(scale > 0, scale, 1.0)
        self.shapes = (centered / scale[..., None, None]).reshape(count, slots, LANDMARK_VALUES)
        self.hand_xy = points[..., :2]
        self.wrists = points[:, :, 0, :2]
        self.hand_sizes = np.linalg.norm(points[:, :, 9, :2] - points[:, :, 0, :2], axis=2)
        self.palms = points[:, :, list(PALM_POINTS), :2].mean(axis=2)
        self.tips = points[:, :, INDEX_TIP, :2]

        self.noses = face_points[:, NOSE, :2]
        self.poses = head_pose(face_points)

    def __len__(self) -> int:
        return len(self.frames)

    def window(self, end_ms: float, window_ms: float) -> tuple[int, int]:
        """Frames de la ventana que termina en end_ms (con 200 ms de margen)."""
        start = int(np.searchsorted(self.times, end_ms - window_ms - 200, side="left"))
        stop = int(np.searchsorted(self.times, end_ms, side="right"))
        return start, stop

    def has_hands(self, start: int = 0, stop: int | None = None) -> bool:
        return bool(self.hand_present[start:stop].any())

    def sample(self, start: int = 0, stop: int | None = None, window_ms: float = WINDOW_MS) -> np.ndarray:
        """Índices (de toda la grabación) de los SEQUENCE_LENGTH pasos de la ventana."""
        stop = len(self) if stop is None else stop
        return start + sample_frame_indices(self.times[start:stop], window_ms)

    def sign_features(
        self,
        start: int = 0,
        stop: int | None = None,
        window_ms: float = WINDOW_MS,
        face_location: bool = False,
    ) -> np.ndarray:
        """Array (SEQUENCE_LENGTH, sequence_feature_size(face_location)) para el modelo de señas."""
        indices = self.sample(start, stop, window_ms)
        features = np.zeros(
            (SEQUENCE_LENGTH, sequence_feature_size(face_location)), dtype=np.float32
        )
        face = self.face_present[indices] if face_location else None

        if face_location:
            features[face, FACE_PRESENCE_COLUMN] = 1.0

        for slot in range(len(HAND_SLOTS)):
            mask = self.hand_present[indices, slot]

            if not mask.any():
                continue

            rows = indices[mask]
            offset = slot * FEATURES_PER_HAND
            features[mask, offset : offset + LANDMARK_VALUES] = self.shapes[rows, slot]
            features[mask, offset + PRESENCE_OFFSET] = 1.0

            # Trayectoria de la muñeca: posición respecto al centro del
            # movimiento, medida en "tamaños de mano" para no depender de la
            # distancia a la cámara.
            wrists = self.wrists[rows, slot]
            hand_size = float(np.median(self.hand_sizes[rows, slot]))

            if hand_size <= 1e-6:
                hand_size = 1.0

            offset = slot * FEATURES_PER_HAND + TRAJECTORY_OFFSET
            features[mask, offset : offset + 2] = (wrists - wrists.mean(axis=0)) / hand_size

            if face_location:
                both = mask & face
                rows = indices[both]
                nose = self.noses[rows]
                height = self.face_heights[rows][:, None]
                offset = FACE_LOCATION_OFFSET + slot * FACE_LOCATION_PER_HAND
                features[both, offset : offset + 2] = (self.palms[rows, slot] - nose) / height
                features[both, offset + 2 : offset + 4] = (self.tips[rows, slot] - nose) / height

        return features

    def motion(
        self,
        start: int = 0,
        stop: int | None = None,
        window_ms: float = WINDOW_MS,
        robust_size: bool = False,
    ) -> float:
        """
        Cuánto se movió la mano más activa en la ventana, en "tamaños de mano":
        el mayor recorrido (máximo menos mínimo) de cualquiera de sus 21 puntos.
        Una mano quieta da cerca de 0,1; un saludo da más de 2.
        Con robust_size, el tamaño de la mano no se achica cuando está de
        perfil (para saber si una letra está quieta; el filtro de las señas
        usa la medida de siempre, con la que se entrenaron los modelos).
        """
        indices = self.sample(start, stop, window_ms)
        amount = 0.0

        for slot in range(len(HAND_SLOTS)):
            rows = indices[self.hand_present[indices, slot]]

            if len(rows) < 2:
                continue

            sizes = self.hand_sizes[rows, slot]

            if robust_size:
                sizes = np.maximum(sizes, 0.5 * self.hand_lengths[rows, slot])

            hand_size = float(np.median(sizes))

            if hand_size <= 1e-6:
                continue

            positions = self.hand_xy[rows, slot]  # (frames, 21 puntos, x-y)
            extent = np.linalg.norm(positions.max(axis=0) - positions.min(axis=0), axis=1)
            amount = max(amount, float(extent.max()) / hand_size)

        return amount

    def face_ratio(self, start: int = 0, stop: int | None = None, window_ms: float = WINDOW_MS) -> float:
        """En qué fracción de los pasos de la ventana se vio la cara."""
        return float(np.mean(self.face_listed[self.sample(start, stop, window_ms)]))

    def expression_features(
        self, start: int = 0, stop: int | None = None, window_ms: float = WINDOW_MS
    ) -> np.ndarray:
        """Array (SEQUENCE_LENGTH, EXPRESSION_FEATURE_SIZE) para el modelo de expresiones."""
        indices = self.sample(start, stop, window_ms)
        features = np.zeros((SEQUENCE_LENGTH, EXPRESSION_FEATURE_SIZE), dtype=np.float32)
        present = self.face_present[indices]

        if not present.any():
            return features

        rows = indices[present]
        features[present, :POSE_OFFSET] = self.blendshapes[rows][:, EXPRESSION_BLENDSHAPE_INDICES]
        features[present, FACE_PRESENT_OFFSET] = 1.0

        # Postura (cabeza ladeada o hacia atrás) y movimiento respecto al
        # promedio de la ventana (asentir, negar), medido en "altos de cara".
        poses = self.poses[rows]
        features[present, POSE_OFFSET : POSE_OFFSET + 3] = poses
        features[present, POSE_MOTION_OFFSET : POSE_MOTION_OFFSET + 3] = poses - poses.mean(axis=0)
        noses = self.noses[rows]
        face_height = float(np.median(self.face_heights[rows]))
        features[present, NOSE_TRAJECTORY_OFFSET : NOSE_TRAJECTORY_OFFSET + 2] = (
            noses - noses.mean(axis=0)
        ) / face_height

        return features


def build_sequence_features(
    frames,
    aspect_ratio: float = DEFAULT_ASPECT_RATIO,
    window_ms: float = WINDOW_MS,
    face_location: bool = False,
) -> np.ndarray:
    """
    Devuelve un array (SEQUENCE_LENGTH, sequence_feature_size(face_location))
    listo para el modelo de señas.
    """
    return FrameArrays(frames, aspect_ratio).sign_features(
        window_ms=window_ms, face_location=face_location
    )


def motion_amount(
    frames,
    aspect_ratio: float = DEFAULT_ASPECT_RATIO,
    window_ms: float = WINDOW_MS,
) -> float:
    """Movimiento de la mano más activa en la ventana (ver FrameArrays.motion)."""
    if not frames:
        return 0.0

    return FrameArrays(frames, aspect_ratio).motion(window_ms=window_ms)


# ---------------------------------------------------------------- expresiones

def face_ratio(frames, window_ms: float = WINDOW_MS) -> float:
    """En qué fracción de los pasos de la ventana se vio la cara."""
    if not frames:
        return 0.0

    return FrameArrays(frames).face_ratio(window_ms=window_ms)


def build_expression_features(
    frames,
    aspect_ratio: float = DEFAULT_ASPECT_RATIO,
    window_ms: float = WINDOW_MS,
) -> np.ndarray:
    """Devuelve un array (SEQUENCE_LENGTH, EXPRESSION_FEATURE_SIZE) para el modelo de expresiones."""
    return FrameArrays(frames, aspect_ratio).expression_features(window_ms=window_ms)
