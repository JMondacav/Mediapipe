import cv2
import mediapipe as mp
import csv
import os

DATASET_FILE = "dataset_lsch.csv"
IMAGES_FOLDER = "imagenes_dataset"

mp_hands = mp.solutions.hands


def crear_csv_si_no_existe():
    if not os.path.exists(DATASET_FILE):
        with open(DATASET_FILE, mode="w", newline="") as file:
            writer = csv.writer(file)

            header = ["label"]

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


def procesar_imagenes():
    crear_csv_si_no_existe()

    if not os.path.exists(IMAGES_FOLDER):
        print(f"No existe la carpeta: {IMAGES_FOLDER}")
        print("Créala con: mkdir -p imagenes_dataset")
        return

    total_imagenes = 0
    total_guardadas = 0
    total_fallidas = 0

    with mp_hands.Hands(
        static_image_mode=True,
        max_num_hands=1,
        min_detection_confidence=0.6
    ) as hands:

        for label in os.listdir(IMAGES_FOLDER):
            label_path = os.path.join(IMAGES_FOLDER, label)

            if not os.path.isdir(label_path):
                continue

            label = label.upper()

            print(f"\nProcesando etiqueta: {label}")

            for filename in os.listdir(label_path):
                if not filename.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                    continue

                image_path = os.path.join(label_path, filename)
                total_imagenes += 1

                image = cv2.imread(image_path)

                if image is None:
                    print(f"No se pudo leer: {image_path}")
                    total_fallidas += 1
                    continue

                rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                results = hands.process(rgb_image)

                if results.multi_hand_landmarks:
                    hand_landmarks = results.multi_hand_landmarks[0]
                    guardar_landmarks(label, hand_landmarks)
                    total_guardadas += 1
                    print(f"Guardada: {label}/{filename}")
                else:
                    total_fallidas += 1
                    print(f"No se detectó mano: {label}/{filename}")

    print("\nProceso terminado.")
    print(f"Imágenes revisadas: {total_imagenes}")
    print(f"Muestras guardadas: {total_guardadas}")
    print(f"Fallidas: {total_fallidas}")
    print(f"Dataset actualizado: {DATASET_FILE}")


if __name__ == "__main__":
    procesar_imagenes()
