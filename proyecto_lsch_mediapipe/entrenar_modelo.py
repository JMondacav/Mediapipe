import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import classification_report, accuracy_score
import joblib

DATASET_FILE = "dataset_lsch.csv"
MODEL_FILE = "modelo_lsch.pkl"

# Leer dataset
df = pd.read_csv(DATASET_FILE)

print("\nEtiquetas originales:")
print(df["label"].value_counts())

# Filtrar clases con pocas muestras
conteo = df["label"].value_counts()
clases_validas = conteo[conteo >= 2].index

df = df[df["label"].isin(clases_validas)]

print("\nEtiquetas usadas para entrenar:")
print(df["label"].value_counts())

# Verificar que queden al menos 2 clases
if df["label"].nunique() < 2:
    print("\nError: necesitas al menos 2 señas distintas con mínimo 2 muestras cada una.")
    exit()

# Separar entrada X y salida y
X = df.drop("label", axis=1)
y = df["label"]

# Separar entrenamiento y prueba
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.3,
    random_state=42,
    stratify=y
)

# Modelo simple para primera prueba
modelo = make_pipeline(
    StandardScaler(),
    KNeighborsClassifier(n_neighbors=3)
)

# Entrenar
modelo.fit(X_train, y_train)

# Evaluar
y_pred = modelo.predict(X_test)

print("\nResultados del modelo:")
print("Accuracy:", accuracy_score(y_test, y_pred))

print("\nReporte:")
print(classification_report(y_test, y_pred, zero_division=0))

# Guardar modelo
joblib.dump(modelo, MODEL_FILE)

print(f"\nModelo guardado como: {MODEL_FILE}")