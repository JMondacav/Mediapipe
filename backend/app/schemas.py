from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: str = ""
    password: str = Field(min_length=6)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str


class AuthResponse(BaseModel):
    user: UserOut
    token: str


class LoginIn(BaseModel):
    username: str
    password: str


class SessionCreate(BaseModel):
    duration_seconds: int = 0
    translations_count: int = 0


class SessionUpdate(BaseModel):
    duration_seconds: int | None = None
    translations_count: int | None = None
    ended_at: datetime | None = None


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: int
    translations_count: int


class TranslationCreate(BaseModel):
    session: int
    text: str = Field(min_length=1, max_length=100)
    confidence: float = 0


class TranslationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    text: str
    confidence: float
    created_at: datetime


class FeedbackCreate(BaseModel):
    session: int
    rating: int = Field(ge=1, le=5)


class FeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    rating: int
    created_at: datetime


class PredictIn(BaseModel):
    landmarks: list[float]


class HandLandmarksIn(BaseModel):
    handedness: str = Field(default="", max_length=10)
    landmarks: list[float] = Field(min_length=63, max_length=63)


class FaceIn(BaseModel):
    # Las 52 expresiones de MediaPipe FaceLandmarker (0 a 1), en orden de índice.
    blendshapes: list[float] = Field(min_length=52, max_length=52)
    # x, y, z de 5 puntos de la cara (nariz, frente, mentón y los dos costados).
    points: list[float] = Field(min_length=15, max_length=15)


class SequenceFrameIn(BaseModel):
    t: float
    hands: list[HandLandmarksIn] = Field(default_factory=list, max_length=2)
    face: FaceIn | None = None


class PredictSequenceIn(BaseModel):
    frames: list[SequenceFrameIn] = Field(min_length=2, max_length=240)
    aspect_ratio: float = Field(default=4 / 3, gt=0.2, lt=5)


class DynamicSampleIn(PredictSequenceIn):
    label: str = Field(min_length=1, max_length=30)
    # "sign": seña con movimiento; "expression": expresión facial.
    kind: Literal["sign", "expression"] = "sign"


class StepIn(BaseModel):
    """Una posición ya analizada de una grabación en curso."""

    end: float
    # "shape": forma de la mano mientras se mueve (para la postura de las señas).
    kind: Literal["sign", "letter", "shape", "expression"]
    label: str = Field(min_length=1, max_length=30)
    confidence: float = Field(ge=0, le=1)


class PartialRecordingIn(BaseModel):
    """Un trozo de una grabación en curso (la parte nueva más ~1,8 s antes)."""

    # ~3 s (1 s nuevo + 1,8 s anteriores) incluso con cámaras de 120 fps.
    frames: list[SequenceFrameIn] = Field(min_length=2, max_length=900)
    aspect_ratio: float = Field(default=4 / 3, gt=0.2, lt=5)
    start_t: float
    after_t: float | None = None


class RecordingIn(BaseModel):
    # Hasta ~60 s de grabación a 60 fps.
    frames: list[SequenceFrameIn] = Field(min_length=2, max_length=3600)
    aspect_ratio: float = Field(default=4 / 3, gt=0.2, lt=5)
    # Si la grabación se analizó por trozos: comienzo, última posición
    # analizada, dónde termina (medio segundo después de la última mano) y lo
    # que ya se encontró. Sin start_t se analiza la grabación completa.
    start_t: float | None = None
    after_t: float | None = None
    end_t: float | None = None
    steps: list[StepIn] = Field(default_factory=list, max_length=4000)
    expression_steps: list[StepIn] = Field(default_factory=list, max_length=1200)
