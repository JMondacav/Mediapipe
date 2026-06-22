from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import models, schemas
from .auth import create_token, get_current_user, hash_password, verify_password
from .database import Base, engine, get_db

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="EnsenaVos API",
    version="2.0.0",
    description="API FastAPI para traduccion de lengua de senas con MediaPipe.",
)

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
