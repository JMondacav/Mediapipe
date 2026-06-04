import csv
import os

DATASET_FILE = "dataset_lsch.csv"
TEMP_FILE = "dataset_lsch_temp.csv"

header = ["label"]

for i in range(21):
    header.extend([f"x{i}", f"y{i}", f"z{i}"])

with open(DATASET_FILE, "r", newline="") as file:
    rows = list(csv.reader(file))

if not rows:
    print("El dataset está vacío.")
    exit()

# Si ya tiene header, no hacer nada
if rows[0][0] == "label":
    print("El dataset ya tiene cabecera. No se modificó.")
    exit()

# Si no tiene header, agregarla arriba
with open(TEMP_FILE, "w", newline="") as file:
    writer = csv.writer(file)
    writer.writerow(header)
    writer.writerows(rows)

os.replace(TEMP_FILE, DATASET_FILE)

print("Cabecera agregada correctamente a dataset_lsch.csv")
