"""
Entrena el clasificador LSCh desde un dataset Roboflow tipo clasificación.

Uso dentro del contenedor backend:
    python api/train_from_roboflow.py

El dataset esperado vive por defecto en:
    backend/data/roboflow_lsch/{train,valid,test}/{CLASE}/*.jpg
"""

from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path

import joblib
import mediapipe as mp
import numpy as np
import pandas as pd
from PIL import Image
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC


BASE_DIR = Path(__file__).resolve().parent.parent
API_DIR = Path(__file__).resolve().parent
DATASET_DIR = Path(os.environ.get("LSCH_DATASET_DIR", BASE_DIR / "data" / "roboflow_lsch"))
MODEL_PATH = API_DIR / "modelo_lsch.pkl"
CSV_PATH = API_DIR / "landmarks_roboflow_lsch.csv"
REPORT_PATH = API_DIR / "model_report_roboflow_lsch.json"
HAND_MODEL_PATH = API_DIR / "hand_landmarker.task"
HAND_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/latest/hand_landmarker.task"
)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
SPLITS = ("train", "valid", "test")
COLUMNAS = [axis for i in range(21) for axis in (f"x{i}", f"y{i}", f"z{i}")]


def normalize_landmarks(flat_landmarks: list[float]) -> list[float]:
    points = np.array(flat_landmarks, dtype=np.float32).reshape(21, 3)
    points = points - points[0]
    scale = np.max(np.linalg.norm(points, axis=1))

    if scale > 0:
        points = points / scale

    return points.reshape(-1).tolist()


def iter_images(dataset_dir: Path):
    for split in SPLITS:
        split_dir = dataset_dir / split
        if not split_dir.exists():
            continue

        for label_dir in sorted(path for path in split_dir.iterdir() if path.is_dir()):
            label = label_dir.name.strip().upper()

            if label == "EMPTY":
                continue

            for image_path in sorted(label_dir.rglob("*")):
                if image_path.suffix.lower() in IMAGE_EXTENSIONS:
                    yield split, label, image_path


def extract_dataset(dataset_dir: Path) -> tuple[pd.DataFrame, dict]:
    rows = []
    stats = {
        "dataset_dir": str(dataset_dir),
        "processed": 0,
        "with_hand": 0,
        "without_hand": 0,
        "per_split_label": {},
    }

    if not HAND_MODEL_PATH.exists():
        print(f"Descargando modelo MediaPipe: {HAND_MODEL_URL}")
        urllib.request.urlretrieve(HAND_MODEL_URL, HAND_MODEL_PATH)

    BaseOptions = mp.tasks.BaseOptions
    HandLandmarker = mp.tasks.vision.HandLandmarker
    HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
    RunningMode = mp.tasks.vision.RunningMode

    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(HAND_MODEL_PATH)),
        running_mode=RunningMode.IMAGE,
        num_hands=1,
        min_hand_detection_confidence=0.25,
        min_hand_presence_confidence=0.25,
        min_tracking_confidence=0.25,
    )

    with HandLandmarker.create_from_options(options) as hands:
        for split, label, image_path in iter_images(dataset_dir):
            stats["processed"] += 1
            key = f"{split}/{label}"
            stats["per_split_label"].setdefault(key, {"images": 0, "with_hand": 0})
            stats["per_split_label"][key]["images"] += 1

            try:
                image_rgb = np.array(Image.open(image_path).convert("RGB"))
            except Exception:
                stats["without_hand"] += 1
                continue

            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
            results = hands.detect(mp_image)

            if not results.hand_landmarks:
                stats["without_hand"] += 1
                continue

            landmarks = results.hand_landmarks[0]
            flat_landmarks = []

            for landmark in landmarks:
                flat_landmarks.extend([landmark.x, landmark.y, landmark.z])

            row = {
                "split": split,
                "label": label,
                "image": str(image_path.relative_to(dataset_dir)),
            }
            row.update(dict(zip(COLUMNAS, normalize_landmarks(flat_landmarks))))
            rows.append(row)

            stats["with_hand"] += 1
            stats["per_split_label"][key]["with_hand"] += 1

    return pd.DataFrame(rows), stats


def train_and_select_model(df: pd.DataFrame) -> tuple[Pipeline, dict]:
    feature_columns = COLUMNAS
    train_df = df[df["split"] == "train"].copy()
    valid_df = df[df["split"] == "valid"].copy()
    test_df = df[df["split"] == "test"].copy()

    if train_df.empty:
        raise RuntimeError("No hay datos de entrenamiento con mano detectada.")

    X_train = train_df[feature_columns]
    y_train = train_df["label"]

    X_valid = valid_df[feature_columns] if not valid_df.empty else X_train
    y_valid = valid_df["label"] if not valid_df.empty else y_train

    candidates = {
        "extra_trees": ExtraTreesClassifier(
            n_estimators=700,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
            min_samples_leaf=1,
        ),
        "random_forest": RandomForestClassifier(
            n_estimators=500,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
            min_samples_leaf=1,
        ),
        "svc_rbf": Pipeline(
            steps=[
                ("scaler", StandardScaler()),
                (
                    "svc",
                    SVC(
                        C=12,
                        gamma="scale",
                        probability=True,
                        class_weight="balanced",
                        random_state=42,
                    ),
                ),
            ]
        ),
    }

    scores = {}
    selection_scores = {}
    fitted = {}

    for name, model in candidates.items():
        model.fit(X_train, y_train)
        predictions = model.predict(X_valid)
        probabilities = model.predict_proba(X_valid)
        confidences = np.max(probabilities, axis=1)
        accuracy = accuracy_score(y_valid, predictions)
        confidence_coverage = float(np.mean(confidences >= 0.85))
        average_confidence = float(np.mean(confidences))

        scores[name] = {
            "accuracy": accuracy,
            "confidence_coverage_85": confidence_coverage,
            "average_confidence": average_confidence,
        }
        selection_scores[name] = accuracy + (0.15 * confidence_coverage) + (
            0.05 * average_confidence
        )
        fitted[name] = model

    best_name = max(selection_scores, key=selection_scores.get)
    best_model = fitted[best_name]

    report = {
        "best_model": best_name,
        "validation_by_model": scores,
        "selection_score_by_model": selection_scores,
        "train_samples": len(train_df),
        "valid_samples": len(valid_df),
        "test_samples": len(test_df),
        "classes": sorted(y_train.unique().tolist()),
    }

    for split_name, split_df in (("valid", valid_df), ("test", test_df)):
        if split_df.empty:
            continue

        y_true = split_df["label"]
        y_pred = best_model.predict(split_df[feature_columns])
        report[f"{split_name}_accuracy"] = accuracy_score(y_true, y_pred)
        report[f"{split_name}_classification_report"] = classification_report(
            y_true,
            y_pred,
            output_dict=True,
            zero_division=0,
        )
        report[f"{split_name}_confusion_matrix"] = confusion_matrix(
            y_true,
            y_pred,
            labels=report["classes"],
        ).tolist()

    return best_model, report


def main():
    if not DATASET_DIR.exists():
        raise FileNotFoundError(f"No existe el dataset: {DATASET_DIR}")

    reuse_csv = os.environ.get("LSCH_REUSE_CSV", "False") == "True"

    if reuse_csv and CSV_PATH.exists():
        print(f"Reutilizando landmarks existentes: {CSV_PATH}")
        df = pd.read_csv(CSV_PATH)
        extraction_stats = {
            "dataset_dir": str(DATASET_DIR),
            "processed": None,
            "with_hand": len(df),
            "without_hand": None,
            "per_split_label": {},
            "reused_csv": True,
        }
    else:
        print(f"Leyendo dataset: {DATASET_DIR}")
        df, extraction_stats = extract_dataset(DATASET_DIR)

    if df.empty:
        raise RuntimeError("MediaPipe no detectó manos en ninguna imagen.")

    if not reuse_csv:
        df.to_csv(CSV_PATH, index=False)
        print(f"Landmarks guardados en: {CSV_PATH}")
    print(f"Imagenes procesadas: {extraction_stats['processed']}")
    print(f"Con mano detectada: {extraction_stats['with_hand']}")
    print(f"Sin mano detectada: {extraction_stats['without_hand']}")

    model, model_report = train_and_select_model(df)
    report = {
        "extraction": extraction_stats,
        "model": model_report,
    }

    if MODEL_PATH.exists():
        backup_path = MODEL_PATH.with_suffix(".backup.pkl")
        MODEL_PATH.replace(backup_path)
        print(f"Modelo anterior respaldado en: {backup_path}")

    joblib.dump(model, MODEL_PATH)
    REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False))

    print(f"Modelo nuevo guardado en: {MODEL_PATH}")
    print(f"Reporte guardado en: {REPORT_PATH}")
    print(json.dumps(model_report, indent=2, ensure_ascii=False)[:4000])


if __name__ == "__main__":
    main()
