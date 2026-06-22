from datetime import datetime

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
