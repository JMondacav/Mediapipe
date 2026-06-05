import os
import numpy as np
import pandas as pd

# Cache del modelo: se carga una sola vez al primer request
_model = None

COLUMNAS = []
for _i in range(21):
    COLUMNAS.extend([f"x{_i}", f"y{_i}", f"z{_i}"])


def normalize_landmarks(flat_landmarks):
    """Normaliza la forma de la mano para depender menos de tamaño/encuadre."""
    points = np.array(flat_landmarks, dtype=np.float32).reshape(21, 3)
    points = points - points[0]
    scale = np.max(np.linalg.norm(points, axis=1))

    if scale > 0:
        points = points / scale

    return points.reshape(-1).tolist()


def get_model():
    """Carga el modelo .pkl una sola vez y lo guarda en memoria."""
    global _model
    if _model is None:
        import joblib
        model_path = os.path.join(os.path.dirname(__file__), "modelo_lsch.pkl")
        if not os.path.exists(model_path):
            raise FileNotFoundError(
                f"Modelo no encontrado en: {model_path}\n"
                "Copia modelo_lsch.pkl dentro de backend/api/"
            )
        _model = joblib.load(model_path)
    return _model


def predict_landmarks(flat_landmarks):
    """
    Recibe 63 floats [x0,y0,z0, x1,y1,z1 ... x20,y20,z20]
    Devuelve dict: { 'label': 'A', 'confidence': 0.97 }
    """
    model = get_model()
    normalized_landmarks = normalize_landmarks(flat_landmarks)
    X = pd.DataFrame([normalized_landmarks], columns=COLUMNAS)

    label = model.predict(X)[0]

    confidence = 0.0
    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(X)[0]
        confidence = float(np.max(probs))

    return {"label": label, "confidence": confidence}
