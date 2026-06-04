import cv2
import mediapipe as mp
import joblib
import numpy as np
import pandas as pd
import time
import os

MODEL_FILE = "modelo_lsch.pkl"

if not os.path.exists(MODEL_FILE):
    print(f"No se encontró el modelo: {MODEL_FILE}")
    print("Primero ejecuta: python entrenar_modelo.py")
    exit()

# Cargar modelo entrenado
modelo = joblib.load(MODEL_FILE)

# Crear nombres de columnas iguales a los usados en entrenamiento
columnas = []

for i in range(21):
    columnas.extend([f"x{i}", f"y{i}", f"z{i}"])

# Inicializar MediaPipe
mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils
mp_styles = mp.solutions.drawing_styles

cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("No se pudo abrir la cámara.")
    exit()

with mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
) as hands:

    prev_time = 0

    while True:
        ret, frame = cap.read()

        if not ret:
            print("No se pudo leer la cámara.")
            break

        frame = cv2.flip(frame, 1)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        results = hands.process(rgb_frame)

        prediccion = "Sin mano"
        confianza = 0.0

        if results.multi_hand_landmarks:
            hand_landmarks = results.multi_hand_landmarks[0]

            # Dibujar mano
            mp_draw.draw_landmarks(
                frame,
                hand_landmarks,
                mp_hands.HAND_CONNECTIONS,
                mp_styles.get_default_hand_landmarks_style(),
                mp_styles.get_default_hand_connections_style()
            )

            # Extraer los 63 valores: x0,y0,z0...x20,y20,z20
            fila = []

            for lm in hand_landmarks.landmark:
                fila.extend([lm.x, lm.y, lm.z])

            # Convertir a DataFrame con los mismos nombres de columnas del entrenamiento
            X = pd.DataFrame([fila], columns=columnas)

            # Predecir clase
            prediccion = modelo.predict(X)[0]

            # Obtener confianza aproximada
            if hasattr(modelo, "predict_proba"):
                probabilidades = modelo.predict_proba(X)[0]
                confianza = np.max(probabilidades)
            else:
                confianza = 0.0

        # Calcular FPS
        current_time = time.time()
        fps = 1 / (current_time - prev_time) if prev_time != 0 else 0
        prev_time = current_time

        # Mostrar predicción en pantalla
        cv2.putText(
            frame,
            f"Prediccion: {prediccion}",
            (10, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (0, 255, 0),
            2
        )

        cv2.putText(
            frame,
            f"Confianza: {confianza:.2f}",
            (10, 80),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (0, 255, 0),
            2
        )

        cv2.putText(
            frame,
            f"FPS: {int(fps)}",
            (10, 120),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.8,
            (255, 0, 0),
            2
        )

        cv2.imshow("Probar Modelo LSCh", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

cap.release()
cv2.destroyAllWindows()