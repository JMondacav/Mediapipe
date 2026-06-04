import cv2
import mediapipe as mp
import csv
import os
import time

# Nombre del archivo donde se guardará el dataset
DATASET_FILE = "dataset_lsch.csv"

# Inicializar MediaPipe
mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils
mp_styles = mp.solutions.drawing_styles

# Crear cabecera del CSV si no existe
def crear_csv_si_no_existe():
    if not os.path.exists(DATASET_FILE):
        with open(DATASET_FILE, mode="w", newline="") as file:
            writer = csv.writer(file)

            header = ["label"]

            # 21 landmarks * 3 coordenadas = 63 columnas
            for i in range(21):
                header.extend([f"x{i}", f"y{i}", f"z{i}"])

            writer.writerow(header)


def guardar_landmarks(label, hand_landmarks):
    fila = [label]

    for lm in hand_landmarks.landmark:
        fila.extend([lm.x, lm.y, lm.z])

    with open(DATASET_FILE, mode="a", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(fila)


def main():
    crear_csv_si_no_existe()

    label = input("Ingresa la etiqueta de la seña que vas a capturar. Ejemplo A, B, HOLA: ").strip().upper()

    if label == "":
        print("La etiqueta no puede estar vacía.")
        return

    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("No se pudo abrir la cámara.")
        return

    contador = 0
    ultimo_guardado = 0

    print("\nInstrucciones:")
    print("Presiona 's' para guardar una muestra.")
    print("Presiona 'q' para salir.")
    print(f"Guardando muestras para la etiqueta: {label}\n")

    with mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=1,
        min_detection_confidence=0.7,
        min_tracking_confidence=0.7
    ) as hands:

        while True:
            ret, frame = cap.read()

            if not ret:
                print("No se pudo leer la cámara.")
                break

            frame = cv2.flip(frame, 1)
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            results = hands.process(rgb_frame)

            hay_mano = False
            hand_landmarks_actual = None

            if results.multi_hand_landmarks:
                hay_mano = True
                hand_landmarks_actual = results.multi_hand_landmarks[0]

                mp_draw.draw_landmarks(
                    frame,
                    hand_landmarks_actual,
                    mp_hands.HAND_CONNECTIONS,
                    mp_styles.get_default_hand_landmarks_style(),
                    mp_styles.get_default_hand_connections_style()
                )

                # Numerar landmarks
                h, w, _ = frame.shape
                for idx, lm in enumerate(hand_landmarks_actual.landmark):
                    cx = int(lm.x * w)
                    cy = int(lm.y * h)

                    cv2.putText(
                        frame,
                        str(idx),
                        (cx, cy),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.4,
                        (255, 255, 255),
                        1
                    )

            # Textos en pantalla
            cv2.putText(
                frame,
                f"Etiqueta: {label}",
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 0),
                2
            )

            cv2.putText(
                frame,
                f"Muestras guardadas: {contador}",
                (10, 60),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 0),
                2
            )

            if hay_mano:
                cv2.putText(
                    frame,
                    "Mano detectada - Presiona S para guardar",
                    (10, 90),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 255, 0),
                    2
                )
            else:
                cv2.putText(
                    frame,
                    "No se detecta mano",
                    (10, 90),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 0, 255),
                    2
                )

            cv2.imshow("Captura Dataset LSCh", frame)

            key = cv2.waitKey(1) & 0xFF

            if key == ord("q"):
                break

            if key == ord("s"):
                if hay_mano and hand_landmarks_actual is not None:
                    tiempo_actual = time.time()

                    # Pequeño bloqueo para evitar guardar doble por error
                    if tiempo_actual - ultimo_guardado > 0.3:
                        guardar_landmarks(label, hand_landmarks_actual)
                        contador += 1
                        ultimo_guardado = tiempo_actual
                        print(f"Muestra {contador} guardada para {label}")
                else:
                    print("No se guardó porque no hay mano detectada.")

    cap.release()
    cv2.destroyAllWindows()

    print(f"\nCaptura terminada. Total guardado para {label}: {contador}")
    print(f"Archivo generado/actualizado: {DATASET_FILE}")


if __name__ == "__main__":
    main()