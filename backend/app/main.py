from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy.orm import Session

from . import models, schemas
from .auth import create_token, get_current_user, hash_password, verify_password
from .database import Base, engine, get_db
from .gzip_request import GzipRequestMiddleware
from .tts import SpeechIn, TTSUnavailable, synthesize

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="EnsenaVos API",
    version="2.0.0",
    description="API FastAPI para traduccion de lengua de senas con MediaPipe.",
)

app.add_middleware(GzipRequestMiddleware)
# Respuestas comprimidas.
app.add_middleware(GZipMiddleware, minimum_size=2048)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def ensure_user_session(db: Session, session_id: int, user: models.User):
    db_session = (
        db.query(models.Session)
        .filter(
            models.Session.id == session_id,
            models.Session.user_id == user.id,
        )
        .first()
    )

    if not db_session:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")

    return db_session


@app.get("/api/health/")
def health():
    return {"status": "ok", "backend": "FastAPI"}


@app.post("/api/auth/register/", response_model=schemas.AuthResponse, status_code=201)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    username = payload.username.strip()
    email = str(payload.email or "").strip()

    if db.query(models.User).filter(models.User.username == username).first():
        raise HTTPException(
            status_code=400,
            detail="El usuario ya existe",
        )

    user = models.User(
        username=username,
        email=email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token(db, user)
    return {"user": user, "token": token}


@app.post("/api/auth/login/", response_model=schemas.AuthResponse)
def login(payload: schemas.LoginIn, db: Session = Depends(get_db)):
    user = (
        db.query(models.User)
        .filter(models.User.username == payload.username.strip())
        .first()
    )

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Credenciales incorrectas")

    token = create_token(db, user)
    return {"user": user, "token": token}


@app.get("/api/auth/me/", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@app.post("/api/auth/logout/")
def logout(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(models.AuthToken).filter(models.AuthToken.user_id == current_user.id).delete()
    db.commit()
    return {"message": "Sesion cerrada correctamente"}


@app.get("/api/sessions/", response_model=list[schemas.SessionOut])
def list_sessions(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Session)
        .filter(models.Session.user_id == current_user.id)
        .order_by(models.Session.started_at.desc())
        .all()
    )


@app.post("/api/sessions/", response_model=schemas.SessionOut, status_code=201)
def create_session(
    payload: schemas.SessionCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_session = models.Session(
        user_id=current_user.id,
        duration_seconds=payload.duration_seconds,
        translations_count=payload.translations_count,
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


@app.patch("/api/sessions/{session_id}/", response_model=schemas.SessionOut)
def update_session(
    session_id: int,
    payload: schemas.SessionUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db_session = ensure_user_session(db, session_id, current_user)
    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(db_session, field, value)

    db.commit()
    db.refresh(db_session)
    return db_session


@app.get("/api/translations/", response_model=list[schemas.TranslationOut])
def list_translations(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Translation)
        .join(models.Session)
        .filter(models.Session.user_id == current_user.id)
        .order_by(models.Translation.created_at.desc())
        .all()
    )


@app.post("/api/translations/", response_model=schemas.TranslationOut, status_code=201)
def create_translation(
    payload: schemas.TranslationCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_user_session(db, payload.session, current_user)
    translation = models.Translation(
        session_id=payload.session,
        text=payload.text,
        confidence=payload.confidence,
    )
    db.add(translation)
    db.commit()
    db.refresh(translation)
    return translation


@app.get("/api/feedback/", response_model=list[schemas.FeedbackOut])
def list_feedback(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Feedback)
        .join(models.Session)
        .filter(models.Session.user_id == current_user.id)
        .order_by(models.Feedback.created_at.desc())
        .all()
    )


@app.post("/api/feedback/", response_model=schemas.FeedbackOut, status_code=201)
def create_feedback(
    payload: schemas.FeedbackCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_user_session(db, payload.session, current_user)
    feedback = models.Feedback(session_id=payload.session, rating=payload.rating)
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return feedback


@app.get("/api/stats/")
def stats(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total_sessions = (
        db.query(models.Session)
        .filter(models.Session.user_id == current_user.id)
        .count()
    )
    total_translations = (
        db.query(models.Translation)
        .join(models.Session)
        .filter(models.Session.user_id == current_user.id)
        .count()
    )
    feedbacks = (
        db.query(models.Feedback)
        .join(models.Session)
        .filter(models.Session.user_id == current_user.id)
        .all()
    )
    total_feedbacks = len(feedbacks)
    average_rating = (
        round(sum(feedback.rating for feedback in feedbacks) / total_feedbacks, 2)
        if total_feedbacks
        else 0
    )

    return {
        "total_sessions": total_sessions,
        "total_translations": total_translations,
        "total_feedbacks": total_feedbacks,
        "average_rating": average_rating,
    }


@app.post("/api/predict/")
def predict(
    payload: schemas.PredictIn,
    current_user: models.User = Depends(get_current_user),
):
    if len(payload.landmarks) != 63:
        raise HTTPException(
            status_code=400,
            detail=f"Se esperan 63 valores, se recibieron {len(payload.landmarks)}",
        )

    try:
        from api.ml_predictor import predict_landmarks

        return predict_landmarks(payload.landmarks)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en prediccion: {exc}",
        ) from exc


@app.get("/api/dynamic/status/")
def dynamic_status(current_user: models.User = Depends(get_current_user)):
    from api.dynamic_predictor import EXPRESSIONS, model_status
    from api.dynamic_samples import (
        EXPRESSION,
        FACE_LOCATION_MIN_SHARE,
        count_samples,
        count_samples_with_face,
    )

    model_info = model_status()
    samples = count_samples()
    with_face = count_samples_with_face()
    total = sum(samples.values())
    return {
        "model": model_info,
        "window_ms": model_info["window_ms"],
        "samples": samples,
        # Para activar la ubicación de la mano respecto a la cara al reentrenar.
        "samples_with_face": with_face,
        "face_location_share": round(sum(with_face.values()) / total, 3) if total else 0.0,
        "face_location_min_share": FACE_LOCATION_MIN_SHARE,
        "expressions": {
            "model": model_status(EXPRESSIONS),
            "samples": count_samples(EXPRESSION),
        },
    }


# Para guardar una expresión, la cara debe verse en buena parte de la muestra.
MIN_FACE_RATIO_EXPRESSION = 0.6


@app.post("/api/dynamic/samples/", status_code=201)
def create_dynamic_sample(
    payload: schemas.DynamicSampleIn,
    current_user: models.User = Depends(get_current_user),
):
    from api.dynamic_samples import EXPRESSION, save_sample
    from api.sequence_features import (
        WINDOW_MS,
        build_expression_features,
        build_sequence_features,
        face_ratio,
    )

    frames = [frame.model_dump(exclude_none=True) for frame in payload.frames]

    try:
        # Se valida que la grabacion se pueda convertir antes de guardarla.
        if payload.kind == EXPRESSION:
            if face_ratio(frames) < MIN_FACE_RATIO_EXPRESSION:
                raise ValueError("No se vio bien la cara. Mira a la cámara y vuelve a grabar.")

            build_expression_features(frames, payload.aspect_ratio)
        else:
            build_sequence_features(frames, payload.aspect_ratio, face_location=True)

        return save_sample(
            payload.label,
            frames,
            payload.aspect_ratio,
            WINDOW_MS,
            current_user.id,
            payload.kind,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/dynamic/samples/{label}/")
def list_dynamic_samples(
    label: str,
    kind: Literal["sign", "expression"] = "sign",
    current_user: models.User = Depends(get_current_user),
):
    from api.dynamic_samples import list_samples

    try:
        return {"samples": list_samples(label, kind)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/dynamic/samples/{label}/{filename}/")
def get_dynamic_sample(
    label: str,
    filename: str,
    kind: Literal["sign", "expression"] = "sign",
    current_user: models.User = Depends(get_current_user),
):
    from api.dynamic_samples import read_sample

    try:
        return read_sample(label, filename, kind)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/dynamic/samples/{label}/{filename}/")
def delete_dynamic_sample(
    label: str,
    filename: str,
    kind: Literal["sign", "expression"] = "sign",
    current_user: models.User = Depends(get_current_user),
):
    from api.dynamic_samples import delete_sample

    try:
        delete_sample(label, filename, current_user.id, kind)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return {"message": "Muestra borrada"}


@app.post("/api/dynamic/predict/")
def predict_dynamic(
    payload: schemas.PredictSequenceIn,
    current_user: models.User = Depends(get_current_user),
):
    try:
        from api.dynamic_predictor import predict_sequence

        frames = [frame.model_dump() for frame in payload.frames]
        return predict_sequence(frames, payload.aspect_ratio)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en prediccion dinamica: {exc}",
        ) from exc


@app.post("/api/translate/")
def translate_live(
    payload: schemas.PredictSequenceIn,
    current_user: models.User = Depends(get_current_user),
):
    """Modo unico: decide si la ventana es una seña con movimiento o una letra."""
    try:
        from api.live_translator import translate_window

        frames = [frame.model_dump() for frame in payload.frames]
        return translate_window(frames, payload.aspect_ratio)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error en traduccion: {exc}",
        ) from exc


@app.post("/api/translate/recording/partial/")
def translate_recording_partial(
    payload: schemas.PartialRecordingIn,
    current_user: models.User = Depends(get_current_user),
):
    """Analiza un trozo de una grabacion en curso, para responder rapido al terminar."""
    try:
        from api.recording_decoder import analyze_partial

        frames = [frame.model_dump(exclude_none=True) for frame in payload.frames]
        return analyze_partial(frames, payload.aspect_ratio, payload.start_t, payload.after_t)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error analizando la grabacion: {exc}",
        ) from exc


@app.post("/api/translate/recording/")
def translate_recording(
    payload: schemas.RecordingIn,
    current_user: models.User = Depends(get_current_user),
):
    """
    Grabar primero, traducir despues: devuelve las señas en el orden en que
    salen. Si la grabacion ya se analizo por trozos mientras se grababa
    (start_t), solo se analiza el ultimo trozo.
    """
    try:
        from api.recording_decoder import decode_recording, decode_streamed

        frames = [frame.model_dump(exclude_none=True) for frame in payload.frames]

        if payload.start_t is None:
            return decode_recording(frames, payload.aspect_ratio)

        return decode_streamed(
            frames,
            payload.aspect_ratio,
            payload.start_t,
            payload.after_t,
            payload.end_t,
            [step.model_dump() for step in payload.steps],
            [step.model_dump() for step in payload.expression_steps],
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error traduciendo la grabacion: {exc}",
        ) from exc


@app.post("/api/tts/")
async def text_to_speech(
    payload: SpeechIn,
    current_user: models.User = Depends(get_current_user),
):
    """Lee el texto en voz alta con una voz natural, para la persona oyente (MP3)."""
    try:
        audio = await synthesize(payload.text, payload.voice)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TTSUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return Response(content=audio, media_type="audio/mpeg")
