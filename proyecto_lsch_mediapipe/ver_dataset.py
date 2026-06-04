import pandas as pd

DATASET_FILE = "dataset_lsch.csv"

df = pd.read_csv(DATASET_FILE)

print("\nPrimeras filas del dataset:")
print(df.head())

print("\nCantidad total de muestras:")
print(len(df))

print("\nCantidad de muestras por etiqueta:")
print(df["label"].value_counts().sort_index())

print("\nCantidad de columnas:")
print(len(df.columns))

print("\nColumnas:")
print(df.columns.tolist())

