# Tarea: señas dinámicas (CNN 1D), modo único, modo grabación y expresiones faciales para EnseñaVos

## Contexto

Proyecto EnseñaVos (carpeta `Mediapipe-main`): traductor de Lengua de Señas Chilena (LSCh) por cámara. Frontend React/Vite en `frontend/`, backend FastAPI en `backend/`, levantado con Docker Compose.

Meta final: que una persona se comunique rápido, mezclando señas con movimiento y letras deletreadas, sin tocar botones, y que la app muestre las señas reconocidas tal cual y en el orden en que salen, **sin interpretarlas ni convertirlas en una frase** (se probó armar frases con IA y se descartó a pedido). Reconocer señas encadenadas a velocidad natural, sin micro-pausas, queda **fuera de alcance**: es un problema sin resolver incluso en investigación.

Estado del código antes de este cambio:

- `frontend/src/components/HandCamera.jsx`: MediaPipe HandLandmarker (`@mediapipe/tasks-vision`) en el navegador, `runningMode: "VIDEO"`, `numHands: 1`. Llama a `onLandmarksDetected(landmarks)` por cada mano detectada. Lo usan `Translator.jsx` y `Tutorial.jsx`.
- `frontend/src/pages/Translator.jsx`: cada 650 ms manda **un solo frame** (63 números) a `POST /api/predict/`. Estabiliza con una votación de 4 predicciones (`PREDICTION_WINDOW_SIZE`), umbral 0.85 y reglas de cooldown por seña, y guarda las traducciones en la sesión.
- `backend/api/ml_predictor.py`: modelo scikit-learn (`modelo_lsch.pkl`) entrenado con **imágenes estáticas** de Roboflow (`train_from_roboflow.py`). Normaliza restando la muñeca y escalando por la norma máxima.
- El backend usa `python:3.12-slim`, sin TensorFlow, con `numpy==2.4.6` fijado.

Propuesta que traje de otra conversación y que quiero evaluar:

> CNN 1D temporal: filtros que se deslizan por el eje del tiempo y detectan patrones de movimiento. "Ya tienen lo que necesita (ventana de 30 frames)", "solo cambian unas pocas líneas", "es más rápida en el celular y pasa limpio a TensorFlow Lite".
> Arquitectura: entrada de 30 frames × características (forma de ambas manos + movimiento de las muñecas); 3 bloques iguales de Conv1D (64 filtros, kernel 5) + BatchNormalization + MaxPooling(2); cierre con GlobalAveragePooling, Dropout 0,3 y Dense softmax con una salida por seña, incluida la clase "nada".

## Paso 1: revisar y responder antes de programar

Lee el código y dime si la propuesta es compatible con la estructura actual. Verifícalo contra el código real, pero la conclusión esperada es esta: la idea sirve y encaja con la arquitectura (MediaPipe en el navegador → FastAPI → modelo), aunque la propuesta daba por hecho cosas que no existen:

- No hay ventana de 30 frames: se envía 1 frame cada 650 ms (la ventana de 4 es una votación, no una secuencia).
- Se detecta 1 sola mano.
- La normalización resta la muñeca, así que se pierde el movimiento.
- El modelo corre en el servidor, no en el celular, así que el argumento de TFLite no aplica por ahora.
- No hay datos con movimiento para entrenar (el dataset de Roboflow son fotos).

Si alguna parte de lo que sigue ya está implementada (porque se hizo antes), revísala y complétala o corrígela; no la dupliques.

## Paso 2: implementar

### Decisiones de diseño (mantenerlas)

1. **Modo único** en el traductor: no hay selector de modo. En cada ventana, el backend decide si hay una seña con movimiento (modelo CNN 1D) o una letra hecha con la mano quieta (modelo estático existente). El Tutorial no cambia.
2. La inferencia corre en el backend **con numpy**. TensorFlow solo se usa para entrenar, en un contenedor aparte. Así no se rompe el build, no hay choque con numpy 2.4.6 y la imagen del backend no crece.
3. El frontend envía frames crudos con su timestamp. Todo el preprocesamiento vive en un único módulo Python que se usa al guardar, al entrenar y al predecir, para que los datos siempre se preparen igual.
4. Las muestras se guardan crudas (JSON), para poder cambiar el preprocesamiento sin volver a grabar.
5. La ventana se define por tiempo (1500 ms → 30 pasos), así no depende de los fps de la cámara.
6. Las muestras se graban desde la misma app, con el mismo pipeline de MediaPipe que usa la inferencia.
7. **Salida fiel:** se muestran solo las glosas reconocidas, en orden. No se usa IA ni reglas para reformularlas; lo único que se junta son las letras deletreadas seguidas en una palabra.

### Backend

**`backend/api/sequence_features.py`** (solo numpy)

- Constantes: `FEATURE_VERSION = 1`, `SEQUENCE_LENGTH = 30`, `WINDOW_MS = 1500`, `DEFAULT_ASPECT_RATIO = 4/3`, `HAND_SLOTS = ("Left", "Right")`, `LANDMARK_VALUES = 63`, `TRAJECTORY_OFFSET = 63`, `PRESENCE_OFFSET = 65`, `FEATURES_PER_HAND = 66`, `FEATURE_SIZE = 132`.
- Formato de entrada: `frames = [{"t": ms, "hands": [{"handedness": "Left" | "Right" | "", "landmarks": [63 floats x, y, z]}]}]`.
- `sample_frame_indices(timestamps, window_ms)`: 30 instantes equiespaciados (`linspace`) en `[t_último − window_ms, t_último]`; para cada instante, el frame más cercano en el tiempo (con `searchsorted`). Si hay 1 solo frame, todos los índices son 0.
- `assign_hand_slots(hands)`: ubica cada mano según su handedness (máximo 2). Si las dos vienen con la misma etiqueta, la segunda va a la casilla libre.
- `build_sequence_features(frames, aspect_ratio, window_ms)` → array float32 de (30, 132):
  - Ordena por `t` y multiplica x y z por `aspect_ratio` (y no cambia).
  - Por cada mano presente: forma normalizada igual que el modelo estático (restar la muñeca y dividir por la norma máxima) en las columnas `[slot*66, slot*66+63)`, y presencia `1.0` en `slot*66+65`. Guarda la muñeca (x, y) y el tamaño de la mano (distancia xy entre los landmarks 0 y 9).
  - Después, por mano: trayectoria = (muñeca − media de las muñecas presentes) / mediana de los tamaños (si es ≤ 1e-6, usar 1), en las columnas `slot*66+63` y `slot*66+64`. Los frames sin mano quedan en 0.
  - Lanza `ValueError` si no hay frames o si una mano no trae 63 valores.
- `motion_amount(frames, aspect_ratio, window_ms)` → float: con los mismos 30 frames muestreados y las mismas casillas de manos, toma los 21 puntos en xy (x multiplicado por `aspect_ratio`). Por mano, calcula el recorrido de cada punto (norma de máximo − mínimo en la ventana) dividido por la mediana del tamaño de la mano (distancia entre los landmarks 0 y 9), y devuelve el mayor valor entre todas las manos. Devuelve 0 si no hay frames o si ninguna mano aparece en al menos 2 frames. Una mano quieta da ~0,1 y un saludo más de 2.

**`backend/api/dynamic_samples.py`**

- `DATA_DIR` = variable de entorno `DYNAMIC_DATA_DIR` o `backend/data/dynamic_signs`. `MAX_SAMPLES_PER_LABEL = 500`.
- `normalize_label`: mayúsculas, espacios y guiones → `_`, quitar `_` de los extremos, y validar con `^[A-Z0-9ÑÁÉÍÓÚÜ_]{1,30}$` (esto también evita path traversal).
- `save_sample` guarda `<DATA_DIR>/<SEÑA>/<ms epoch>_u<user_id>.json` con `{label, window_ms, aspect_ratio, user_id, created_at (ISO UTC), frames}` y devuelve `{label, file, count}`.
- `delete_sample`: el nombre de archivo debe cumplir `^\d+_u(\d+)\.json$` y pertenecer al mismo usuario (si no, `PermissionError`); si no existe, `FileNotFoundError`.
- `count_samples()` → `{SEÑA: cantidad}`. `iter_sample_paths()` entrega `(seña, ruta)`.

**`backend/api/dynamic_predictor.py`** (solo numpy)

- `MODEL_PATH = api/modelo_dinamico.npz`. Contiene `meta` (string JSON con `classes`, `window_ms`, `sequence_length`, `feature_size`, `feature_version`, `layers`, `created_at`) y los pesos con claves `l{i}_kernel`, `l{i}_bias`, `l{i}_gamma`, `l{i}_beta`, `l{i}_mean` y `l{i}_variance`.
- `SequenceModel`: carga con `np.load(allow_pickle=False)`. `predict_proba(batch (N, 30, 132))` recorre las capas:
  - `conv1d`: padding "same" (a la izquierda `(k−1)//2`, a la derecha el resto), stride 1, `einsum("ntkc,kcf->ntf")` + bias + activación.
  - `batch_norm`: `(x − mean) · gamma / sqrt(variance + eps) + beta`.
  - `max_pool1d`: padding valid, con `pool_size` y `strides`.
  - `global_avg_pool1d`: media sobre el eje del tiempo.
  - `dropout`: identidad.
  - `dense`: producto + bias + activación.
  - Activaciones soportadas: linear, relu y softmax.
- `check_compatible`: `feature_version`, `sequence_length` y `feature_size` deben coincidir; si no, `RuntimeError` pidiendo reentrenar.
- `classify(frames, aspect_ratio)` → `(label, confidence)`: construye las características con el `window_ms` del modelo y devuelve la clase más probable. La usan `predict_sequence` y `live_translator`.
- `get_model()`: caché que se recarga cuando cambia el mtime del archivo (así se puede reentrenar sin reiniciar). Si el archivo no existe, `FileNotFoundError` con un mensaje claro.
- `NOTHING_LABEL = "NADA"`. `MIN_MOTION` = variable de entorno `DYNAMIC_MIN_MOTION` o 0.5. Se eligió midiendo muestras reales: las manos quietas llegan a 0,4 y la seña con menos movimiento parte en 0,7.
- `model_status()` → `{ready, classes, window_ms, detail?}`.
- `predict_sequence(frames, aspect_ratio)` usa el `window_ms` guardado en el modelo:
  - **Filtro de movimiento:** primero calcula `motion_amount`. Si es menor que `MIN_MOTION`, devuelve `{label: "NADA", confidence: 1.0, motion, still: true}` sin consultar al modelo.
  - Si no, predice y devuelve `{label, confidence, motion, still: false}`.
- Los imports van como `from api.sequence_features import ...` (el backend corre `uvicorn app.main:app` desde `backend/`).

**`backend/api/live_translator.py`** (modo único)

- Constantes: `SIGN_MIN_CONFIDENCE = 0.9`, `LETTER_STILL_MS = 500`, `LETTER_MAX_MOTION = 0.2`. El 0.2 se eligió midiendo muestras reales en tramos de 0,5 s: una mano quieta llega a 0,08 y las señas nunca bajan de 0,35.
- `translate_window(frames, aspect_ratio)` (ordena los frames por `t`):
  1. Carga el modelo de señas con `get_model()`. Si no existe (`FileNotFoundError`), sigue sin él, porque las letras igual funcionan.
  2. Calcula `motion` (ventana del modelo) y `recent_motion` (últimos 500 ms) con `motion_amount`.
  3. Si ningún frame tiene manos → `{kind: "none", reason: "no_hands"}`.
  4. **Seña:** si hay modelo, la ventana cubre al menos el 90% de `window_ms` y `motion ≥ MIN_MOTION`, llama a `classify`.
     - Si la seña no es NADA y su confianza es ≥ 0.9 → `{kind: "sign", label, confidence}`.
     - Si no es NADA pero la confianza es menor, guarda `reason: "low_confidence"` junto a label y confidence.
  5. **Letra:** si el último frame tiene mano y `recent_motion < 0.2`, toma la mano más grande (distancia xy entre los landmarks 0 y 9) y llama a `predict_landmarks` del modelo estático → `{kind: "letter", label, confidence}`.
  6. Si no → `{kind: "none", reason: "moving" | "low_confidence"}`.
  - Toda respuesta incluye `motion`, `recent_motion` y `sign_model_ready`.

**`backend/app/schemas.py`**

- `HandLandmarksIn`: `handedness` str, por defecto `""`, máximo 10 caracteres; `landmarks` `list[float]` con exactamente 63 valores.
- `SequenceFrameIn`: `t` float; `hands` lista de máximo 2.
- `PredictSequenceIn`: `frames` entre 2 y 240; `aspect_ratio` por defecto 4/3, mayor que 0.2 y menor que 5.
- `DynamicSampleIn(PredictSequenceIn)`: `label` de 1 a 30 caracteres.

**`backend/app/main.py`** (imports perezosos dentro de cada función, como el `/api/predict/` existente; todos los endpoints con `get_current_user`)

- `GET /api/dynamic/status/` → `{model: model_status(), window_ms, samples: count_samples()}`.
- `POST /api/dynamic/samples/` (201): valida con `build_sequence_features` antes de guardar; `ValueError` → 400.
- `DELETE /api/dynamic/samples/{label}/{filename}/` → 400, 403 o 404 según el error.
- `POST /api/dynamic/predict/`: `FileNotFoundError` → 503, `ValueError` → 400, `RuntimeError` → 503, cualquier otro → 500. Queda para pruebas; el traductor usa `/api/translate/`.
- `POST /api/translate/` (body `PredictSequenceIn`) → `translate_window`. Mismos códigos de error que `/api/dynamic/predict/`.
- No uses `status` como nombre de variable: choca con `fastapi.status`.

**`backend/api/train_dynamic.py`** (TensorFlow/Keras y numpy; sin scikit-learn)

- Agrega `backend/` a `sys.path` para poder importar `api.*`.
- **Datos:**
  - Carga las muestras con `json.loads` dentro del `try`; las inválidas se omiten con un aviso.
  - Omite las señas con menos de 5 muestras y exige al menos 2 señas.
  - Avisa si falta la clase `NADA`.
- **Split** estratificado con seed 42: valid = `max(1, round(15%))`; test = `round(15%)`, solo si la seña tiene 10 o más muestras; el resto va a train.
- **Aumentación:** `AUGMENTED_COPIES = 10` copias (variable de entorno `DYNAMIC_AUGMENTED_COPIES`). En cada copia:
  - Time warp: velocidad entre 0.8 y 1.2, desplazamiento de ±3 pasos, índices redondeados y recortados.
  - Espejo con probabilidad 0.5: negar la x de la forma y de la trayectoria e intercambiar los bloques de las dos manos. **Viene apagado por defecto** y solo se activa con `DYNAMIC_MIRROR=True`. La razón: una mano derecha vista por el dorso tiene casi los mismos puntos que una izquierda vista por la palma. Con espejo, el modelo aprendía que un saludo con el dorso también era HOLA. La contra de apagarlo es que las personas zurdas tienen que grabar sus propias muestras.
  - Rotación de ±0.2 rad en el plano xy, tanto de la forma como de la trayectoria. Calcula desde la copia original para no pisar valores.
  - Ruido N(0, 0.01) en la forma, solo donde la mano está presente.
  - Escala de la trayectoria entre 0.8 y 1.2.
- **Modelo:** Input(30, 132) → 3× [Conv1D(64, 5, padding="same", activation="relu") → BatchNormalization → MaxPooling1D(2)] → GlobalAveragePooling1D → Dropout(0.3) → Dense(n, softmax).
- **Entrenamiento:**
  - Adam 1e-3, `sparse_categorical_crossentropy`, métrica accuracy, `class_weight` balanceado.
  - `EPOCHS = 150` (variable de entorno `DYNAMIC_EPOCHS`), batch 32.
  - EarlyStopping(val_loss, patience 20, restore_best_weights) y ReduceLROnPlateau(factor 0.5, patience 8, min_lr 1e-5).
  - `keras.utils.set_random_seed(42)`.
- **Exportación:** a `api/modelo_dinamico.tmp.npz`, recorriendo `model.layers` y saltando `InputLayer`. Valida las configuraciones soportadas (channels_last, Conv1D con padding same/stride 1/dilation 1/groups 1, pooling valid, BatchNormalization sobre el último eje, GlobalAveragePooling sin keepdims) y lanza error con cualquier otra capa.
- **Verificación de paridad:**
  - Carga el `.tmp.npz` con `SequenceModel` y compara con `model.predict` sobre valid + test.
  - Si la diferencia máxima es mayor que 1e-3, borra el tmp y falla sin tocar el modelo actual.
  - Si pasa: respalda el modelo anterior como `modelo_dinamico.backup.npz`, mueve el tmp a `modelo_dinamico.npz` y guarda `modelo_dinamico.keras` (para convertirlo a TFLite más adelante).
- **Reporte** en `api/model_report_dinamico.json`:
  - Clases, muestras por clase, tamaño de cada split, parámetros, épocas entrenadas, mejor val_accuracy y diferencia Keras/numpy.
  - Para valid y test: accuracy, recall por clase y matriz de confusión, calculados con la inferencia numpy.
  - También registra `mirror_hands`.
- **Aviso sobre NADA:** al cargar, cuenta cuántas muestras de NADA superan `MIN_MOTION`. Si son menos de la mitad, avisa que NADA debe incluir movimientos que no sean señas (saludar con el dorso, rascarse, mover las manos al azar), porque las manos quietas ya las descarta el filtro. `NOTHING_LABEL` y `MIN_MOTION` se importan desde `dynamic_predictor`.

**`backend/requirements-train.txt`**: `numpy` y `tensorflow>=2.16`. Solo sirve para entrenar; el backend no lo usa.

### Frontend

**`HandCamera.jsx`**

- Props nuevas: `onFrame` y `numHands = 1`. Con los valores por defecto, el Tutorial se comporta igual que antes.
- Crea el landmarker con `numHandsRef.current`. Cuando cambie `numHands`, llama a `landmarker.setOptions({ numHands })` sin reiniciar la cámara.
- En cada frame procesado, con o sin manos, llama a `onFrame({ timestamp, aspectRatio, hands })`:
  - `timestamp`: el mismo `performance.now()` que se pasa a `detectForVideo`.
  - `aspectRatio`: `videoWidth / videoHeight`.
  - `hands`: `[{ handedness, landmarks }]`, con `handedness` sacado de `(results.handedness ?? results.handednesses)[i]?.[0]?.categoryName ?? ""`.
- `onLandmarksDetected` sigue igual que antes.

**`frontend/src/utils/dynamicSigns.js`**

- `DEFAULT_WINDOW_MS = 1500` (solo se usa hasta que responde el status) y `NOTHING_LABEL = "NADA"`.
- `toSequenceFrame`: `t` redondeado a ms y landmarks aplanados en x, y, z, redondeados a 4 decimales.
- `framesDuration` y `handsRatio`.

**`frontend/src/services/api.js`**: `getDynamicStatus`, `translateWindow(frames, aspectRatio)` (body `{frames, aspect_ratio}` a `/api/translate/`), `saveDynamicSample(label, frames, aspectRatio)` y `deleteDynamicSample(label, file)` (con `encodeURIComponent`). Mismo estilo que las funciones existentes.

**`Translator.jsx`** (modo único, sin selector de modo)

- Extrae el bloque "agregar texto + contar + guardar traducción + mensaje" a `commitSign(label, confidence)`.
- HandCamera recibe siempre `numHands={2}` y `onFrame`; ya no usa `onLandmarksDetected` ni `/api/predict/`.
- Guarda un buffer de frames, recortado a `window_ms + 200 ms`. Como máximo cada **300 ms**, solo si no hay otra petición en curso y el buffer cubre al menos 500 ms (si ningún frame tiene manos, muestra "Sin seña" y no pide nada), envía el buffer a `/api/translate/`:
  - `kind: "sign"` → `processSign`: se acepta cuando la misma seña sale **2 veces seguidas**. Al aceptarla, vacía el buffer y la ventana de letras, y bloquea las letras durante 1000 ms, porque tras una seña la mano suele quedar quieta un momento.
  - `kind: "letter"` → `processLetter`, si no está bloqueado: las mismas reglas que tenía el modo Letras (`getSignRule`, umbral 0.85, 3 de las últimas 4 predicciones, `preventRepeatUntilChange`, cooldown por letra). Al ser cada 300 ms en vez de 650 ms, es más rápido.
  - `kind: "none"` → reinicia el candidato de seña y muestra "Sin seña", o "`LABEL` · x% · poca confianza" si `reason` es `low_confidence`.
- El texto grande muestra las glosas (`textBuffer`) tal cual, sin armar frases.
- Consulta `/api/dynamic/status/` al abrir y al iniciar o reanudar. Si el modelo de señas no está listo, avisa "Solo se reconocen letras…" con un botón "Grabar muestras" que lleva a `/dynamic-recorder`.
- Estilos inline, como el resto del archivo.

**Nueva página `frontend/src/pages/DynamicRecorder.jsx`** (ruta protegida `/dynamic-recorder` en `App.jsx`; entrada "Grabar señas" en `secondaryActions` de `Menu.jsx`, con el ícono `camera`)

- HandCamera siempre activa, con 2 manos.
- Campo para el nombre de la seña, selector de repeticiones (1/5/10/20) y botones Grabar/Cancelar y "Borrar última".
- En cada repetición:
  - Cuenta regresiva de 3 s (2 s en las siguientes).
  - Graba `window_ms + 150 ms` con una barra de progreso.
  - Descarta la muestra si tiene menos de 8 frames o, salvo en NADA, menos de un 60% de frames con mano.
  - La guarda y actualiza el contador.
- Chips con las muestras por seña (en verde desde 30). NADA aparece siempre y la página explica que es obligatoria: hay que grabar sobre todo movimientos que **no** sean señas: **deletrear palabras letra por letra** (en el modo único, las transiciones entre letras pasan por el modelo de señas), saludar con el dorso, rascarse, acomodarse el pelo, mover las manos al azar y sacarlas del cuadro. Las manos quietas ya las descarta el filtro de movimiento.
- Tarjeta con el estado del modelo y el comando para entrenar.
- Mismo estilo visual que el Translator.

### Docker, git y documentación

- `docker-compose.yml`: servicio `trainer` con `image: tensorflow/tensorflow:2.18.0`, `profiles: ["train"]`, `working_dir: /app`, volumen `./backend:/app` y `command: python3 api/train_dynamic.py`. No debe arrancar con `docker compose up`.
- `.gitignore`: agregar `backend/api/modelo_dinamico.backup.npz` y `backend/api/modelo_dinamico.tmp.npz` (`backend/data/` ya está ignorado).
- `README.md`:
  - Sección "Señas dinámicas" que explica el modo único, con 3 pasos:
    1. Grabar: al menos 30 muestras por seña, varias personas, cada seña una vez a velocidad de conversación (sin llenar la barra), y la clase NADA con deletreos y otros movimientos.
    2. Entrenar: `docker compose --profile train run --rm trainer`, o en local con `requirements-train.txt`.
    3. Usar: el backend carga el modelo solo; el reporte queda en `model_report_dinamico.json`.
  - Sección "Qué muestra el traductor": solo las señas reconocidas, tal como salen y en orden; no se interpretan ni se convierten en frase.

## Paso 3: filtro adaptativo, modo grabación y cámara fluida

**Filtro de movimiento calculado al entrenar** (antes era un 0,5 fijo, que bloqueaba señas casi quietas como DEJAME_PENSAR, de mediana 0,22).

- `train_dynamic.py`:
  - `load_dataset()` devuelve también el movimiento (`motion_amount`) de cada muestra.
  - `compute_min_motion(labels, motions)` = `clip(0.8 × min(p5 del movimiento de cada seña que no sea NADA), 0.05, 0.5)`.
  - Se guarda como `min_motion` en el meta del `.npz` y en el reporte, junto con `motion_by_class` (p5 y mediana por seña).
  - El aviso de NADA cuenta como "con movimiento" las muestras de 0,5 o más.
- `dynamic_predictor.py`: `DEFAULT_MIN_MOTION = 0.5`. `SequenceModel.min_motion` = variable de entorno `DYNAMIC_MIN_MOTION` si existe; si no, el `min_motion` del meta; si no, 0,5 (modelos antiguos). `predict_sequence`, `live_translator` y `recording_decoder` usan `model.min_motion`.

**Señado rápido y de corrido (aumentación en `train_dynamic.py`)**

- `load_dataset()` devuelve también las muestras crudas (`{frames, aspect_ratio}`).
- `retime(frames, speed, offset)`: acelera la grabación `speed` veces y la desplaza para que empiece en `offset`.
- `fluent_window(target, previous, following, speed, rng)` construye una ventana que termina donde termina la seña objetivo:
  - Pone `previous` acelerada al azar entre 1 y 2,2 veces.
  - Después pone `target` acelerada `speed` veces.
  - Si hay `following`, agrega hasta 250 ms del comienzo de esa otra seña.
- `build_fluent_set`: `FLUENCY_COPIES = 6` (variable de entorno `DYNAMIC_FLUENCY_COPIES`) por cada muestra de entrenamiento que no sea NADA.
  - `speed` al azar entre 1 y 2,2.
  - `previous` es de otra clase (NADA incluida); `following` se agrega con probabilidad 0,5.
  - A la mitad se le aplica además `augment()`.
- `fluency_accuracy`: exactitud del modelo numpy a 1×, 1,5× y 2× sobre ventanas de este tipo armadas con las muestras de validación y prueba. Se imprime al final y queda en el reporte como `fluency_accuracy`.
- Resultado medido con las muestras reales (frases de 3 señas no vistas): a ~0,8 s por seña, 2/60 antes y 60/60 después; a ~0,66 s por seña, 57/60.

**Modo grabar y después traducir** (`backend/api/recording_decoder.py`, endpoint `POST /api/translate/recording/` con `RecordingIn`: entre 2 y 1800 frames)

1. **Clasificar posiciones:** la ventana de `window_ms` recorre la grabación cada 100 ms, desde 500 ms después del primer frame. En cada posición:
   - **Seña:** se clasifica si hay suficiente historia y el movimiento es ≥ `min_motion`. Suficiente historia significa el 90% de `window_ms`, salvo en el primer `window_ms` de la grabación, donde basta `MIN_START_WINDOW_MS = 500`. Sin esa excepción, con señas rápidas se perdía la primera seña. La CNN clasifica la ventana. Todas las ventanas van en un solo lote. Se acepta si no es NADA y su confianza es ≥ 0,90.
   - **Letra:** si la mano principal estuvo quieta en los últimos 500 ms (movimiento < 0,2), el SVM la clasifica. Se acepta con confianza ≥ 0,90 (en vivo es 0,85: una mano en reposo se lee como "B").
   - Si hay seña, gana la seña.
2. **Suavizar:** una posición distinta entre dos iguales toma el valor de sus vecinas.
3. **Agrupar:** posiciones seguidas iguales forman un tramo.
4. **Filtrar tramos:**
   - Seña: al menos 2 posiciones, o 1 posición con confianza ≥ 0,95 si está al final de la grabación.
   - La misma seña con 10 posiciones o menos de separación se une en una sola.
   - Letra: al menos 4 posiciones, sin contar las que caen en el primer segundo después de una seña. (Reemplazado en el Paso 6 por pistas separadas y letras de ~0,5 s.)
5. **Palabras (`build_words`):** una entrada por seña, en orden (`_` → espacio). Las letras seguidas forman una palabra deletreada, salvo que entre ellas haya más de 1,2 s. Nada se interpreta ni se reordena.
6. **Respuesta:** `{words: [...], glosses: words unidas con espacio, tokens[{kind, label, start_ms, end_ms, confidence}], duration_ms, steps, sign_model_ready}`.

**Cámara (`HandCamera.jsx`, en los dos frontends)**

- Asignar `canvas.width` y `canvas.height` solo si cambia el tamaño.
- Borrar y redibujar solo cuando llega un cuadro nuevo de la cámara. Antes se borraba en cada refresco de pantalla y la mano parpadeaba.
- Delegado `"GPU"` con respaldo `"CPU"`.
- WASM fijado a `@mediapipe/tasks-vision@0.10.35`, la versión del package-lock.
- Cerrar el landmarker al desmontar y si el efecto se canceló.

**Frontend accesible (`frontend-accesible/`)**

Es una copia de `frontend/` con el diseño descrito en `frontend-accesible/README.md`: entrada con animal y PIN, menú de 3 tiles con video de la seña, ayuda con pasos en íconos, práctica con estrellas e historial en tarjetas.

Su traductor usa el hook `useRecordingTranslator`:
- Fases: `idle → recording → analyzing → result`.
- Corte automático a los 2 s sin manos o a los 30 s.
- Recorta 500 ms antes de la primera mano y después de la última; ignora grabaciones de menos de 800 ms.
- Guarda cada seña con `saveTranslation`.
- Muestra `words` como fichas grandes, una por seña y en orden, que aparecen una tras otra. 🔊 las lee con la voz del navegador y ⌫ quita la última.

Se agrega un servicio `frontend-accesible` en `docker-compose.yml`, en el puerto 5174.

**Rediseño del frontend original (`frontend/`)**

- **Estilos:** usa el mismo sistema visual (`src/ui.css`, copia de `accesible.css` más las clases para textos: `a-tabbar`, `a-page-head`, `a-btn`, `a-hero`, `a-nav-card`, `a-list-item`, `a-auth-card`, `a-input`, `a-stat-row`, `a-steps-list`, etc.). Se eliminaron `App.css`, `index.css`, `AppBottomNav.jsx` y `Stats.jsx`.
- **Navegación:**
  - `TabBar` con 4 secciones (Inicio, Traducir, Practicar, Historial), cada una con su color.
  - `PageHeader` común: ícono de la sección, título y una línea que dice qué hacer.
  - `/stats` redirige a `/history`.
- **Inicio:** tarjeta grande Traducir; tarjetas Practicar e Historial; "Grabar señas" en una sección "Para el equipo".
- **Traducir:** `useRecordingTranslator` (igual que la versión accesible):
  - El subtítulo cambia según el estado.
  - Fichas grandes con las señas en orden.
  - Botones con texto: Escuchar, Borrar última, Descartar.
  - Controles con etiqueta: Oír respuesta, Grabar/Detener, Terminar.
- **Practicar:** recorrido lineal: grilla de señas → "Así se hace" (pasos numerados y un consejo) → "Probar con la cámara" (estrellas) → Siguiente seña.
- **Historial:** resumen (`/api/stats/`) arriba y una tarjeta por conversación con fecha, hora, duración, señas (letras unidas) y botón Escuchar.
- **Entrar y Crear cuenta:** tarjeta con logo, campos con etiqueta y el error visible.
- **Grabar señas:** misma lógica, con el nuevo estilo.
- **`HandCamera` (en las dos versiones):** la cámara y el modelo de MediaPipe se cargan al mismo tiempo (`Promise.all`), así la cámara no queda en negro mientras se descarga el modelo.

## Paso 4: expresiones faciales y transiciones

Objetivo: que la cara complemente a la seña (cejas arriba = pregunta, negar con la cabeza, etc.) usando CNN 1D, sin romper los modelos ni las muestras que ya existen, y que no aparezcan señas inventadas entre una seña y otra.

**Cámara (`HandCamera.jsx`, idéntico en los dos frontends)**

- Prop `withFace`: crea un `FaceLandmarker` (modelo `face_landmarker/float16/latest`, `runningMode: "VIDEO"`, `numFaces: 1`, `outputFaceBlendshapes: true`, umbrales 0,5) en un efecto aparte, sin reiniciar la cámara. GPU con respaldo CPU. Si no carga, las manos siguen funcionando.
- `FilesetResolver` se carga una sola vez para manos y cara (promesa compartida que se reinicia si falla).
- La cara se detecta en uno de cada 2 cuadros (`FACE_EVERY_FRAMES`) y se reutiliza la última lectura si tiene menos de 250 ms.
- `onFrame` recibe además `face: {blendshapes: [52 valores en orden de índice], points: [x, y, z de los puntos 1, 10, 152, 234, 454]}` o `null`.
- Dibuja el óvalo y los ojos tenues, las cejas en ámbar y los labios en rosado, debajo de las manos.

**Frontend (compartido)**

- `toSequenceFrame` agrega `face` con blendshapes a 2 decimales y puntos a 4; `faceRatio(frames)`.
- `utils/expressions.js`: `EXPRESSIONS` (PREGUNTA 🤨, PREGUNTA_QU 🧐, NEGACION 🙅, AFIRMACION 🙆, INTENSIDAD 😤, con nombre, cómo se hace y color), `expressionInfo` (etiquetas desconocidas con 🙂), `groupByExpression` (palabras seguidas con la misma expresión van juntas; una expresión sin seña queda sola), `speechText` (pregunta → `¿…?`, intensidad → `¡…!`, negación/afirmación → ", no" / ", sí"; sin agregar otras palabras), y el formato del historial `TEXTO|EXPRESIÓN` (`|EXPRESIÓN` si va sola) con `joinHistoryItems`, que también junta las letras antiguas guardadas una por una.
- `components/SignWords.jsx`: fichas de palabras; cada grupo con expresión va en un recuadro de color con la etiqueta (emoji + nombre; en la versión accesible solo el emoji y `aria-label`). Con expresiones, las fichas sueltas se alinean con la línea de palabras de los recuadros.
- `useRecordingTranslator`: preferencia `faceEnabled` en `localStorage` (`ensenavos.leerCara`), `toggleFace`, `faceVisible`; si nunca hubo manos pero sí cara, envía la grabación igual (respuesta solo con la cara). El resultado usa `data.items` (con respaldo a `words` para un backend antiguo) y guarda en el historial una fila por palabra con su expresión.
- Original: interruptor "Expresiones de la cara" (`role="switch"`) bajo la cámara, insignia de cara junto a la de mano y aviso si la cara casi no se vio. Accesible: la carita sobre la cámara es el interruptor (`aria-pressed`) y la ayuda del traductor suma el paso de la cara.
- Grabar señas (las dos versiones, mismo componente; en la accesible con barra superior en vez de `PageHeader`/`TabBar`): pestañas Señas / Expresiones, cámara siempre con cara, fichas sugeridas con emoji, cómo se hace la expresión elegida, descarta expresiones con cara en menos del 60% de los cuadros, y estado de los dos modelos.

**Backend**

- `sequence_features.py` (FEATURE_VERSION sigue en 1; las manos no cambian):
  - `BLENDSHAPE_NAMES` (52), `FACE_POINT_IDS = (1, 10, 152, 234, 454)`, `read_face`, `has_face`, `face_ratio`.
  - `build_sequence_features(..., face_location=False)`: con `True` agrega 9 columnas (141 en total): por mano, palma (media de los puntos 0, 5, 9, 13, 17) e índice (8) respecto a la nariz, divididos por el alto de la cara (frente–mentón), con x por la relación de aspecto; y una columna de presencia de la cara. `sequence_feature_size(face_location)`.
  - `build_expression_features` (`EXPRESSION_VERSION = 1`, 52 columnas): 43 blendshapes (sin `_neutral` ni `eyeLook*`), `head_pose` (giro y ladeo con `atan2` de la profundidad y la altura del costado B menos el A sobre su ancho; inclinación con la profundidad del mentón menos la frente sobre su alto), esos ángulos menos su promedio en la ventana, movimiento de la nariz respecto a su promedio en altos de cara, y presencia.
- `dynamic_predictor.py`: `SequenceModel` lee `kind` (`signs` por defecto, `expressions`) y `face_location` del meta; `features()` arma la entrada correcta; `check_compatible` valida versión y tamaño según el tipo. `get_model()` y `get_expression_model()` (`modelo_expresiones.npz`, clase `NEUTRAL`) con cache por archivo; `model_status(kind)`.
- `recording_decoder.py`:
  - `classify_steps` usa `sign_model.features()`.
  - `classify_expressions`: mismas posiciones; solo si la cara se vio en ≥ 60% de la ventana; acepta lo que no sea NEUTRAL con confianza ≥ 0,80; se suaviza igual.
  - `build_items`: una entrada por palabra `{text, kind: sign|letters|expression, expression, expression_confidence, start_ms, end_ms, confidence}`.
  - `dominant_expression`: una palabra lleva la expresión que aparece en al menos 2 de sus posiciones (o todas si tiene 1) y en la mitad de ellas.
  - `standalone_expressions`: tramos de la misma expresión con ≥ 5 posiciones fuera de las palabras y confianza media ≥ 0,90; no cuenta si es la misma expresión de una palabra que se superpone o terminó hace ≤ 10 posiciones.
  - Respuesta: `items`, `words`, `glosses`, `tokens`, `duration_ms`, `steps`, `sign_model_ready`, `expression_model_ready`, `face_ratio`. Un modelo de expresiones ausente o incompatible no rompe la traducción.
- `schemas.py`: `FaceIn` (52 + 15 números exactos) y `face` opcional en cada frame; `DynamicSampleIn.kind: "sign" | "expression"`.
- `dynamic_samples.py`: carpetas por tipo (`data/dynamic_signs`, `data/expressions`, variable `EXPRESSION_DATA_DIR`); el JSON guarda `kind`.
- `main.py`: `/api/dynamic/status/` agrega `expressions: {model, samples}`; `POST /api/dynamic/samples/` valida la cara (≥ 60%) en expresiones y guarda con `model_dump(exclude_none=True)`; `DELETE` recibe `?kind=`.
- `train_dynamic.py`:
  - Sin opciones entrena señas y, si hay muestras, expresiones (`--senas` / `--expresiones` para una sola).
  - Flujo común `train(spec, ...)`: división, aumentación, señado rápido, exportación, verificación numpy, respaldo y reporte.
  - Señas: `face_location` automático si ≥ 80% de las muestras tiene cara en ≥ 50% de la ventana (`DYNAMIC_FACE_LOCATION=True/False` lo fuerza). `mirror` y `rotate` incluyen las columnas de la cara; 15% de los ejemplos sin cara y escala ×0,9–1,1.
  - **Transiciones como NADA** (`TRANSITION_COPIES = 2`): por cada muestra de seña, una ventana con solo el final de la seña saliendo (5–30% visible) y otra con solo el comienzo entrando (5–25%), aceleradas 1–1,5×, con manos abajo o una muestra de NADA en el resto. Medido con las muestras reales no vistas: frases fluidas 49/60 → 60/60, pausas con manos abajo 32/40 → 40/40, sin perder velocidad (con más porcentaje visible se perdían señas muy rápidas).
  - Expresiones: espejo izquierda/derecha en el 50%, intensidad ×0,8–1,2 con desplazamiento y ruido, postura base y amplitud del movimiento de cabeza al azar, cara perdida 2–4 pasos en el 20%, encadenadas a 1–1,8×.
  - `retime` conserva todos los campos del frame (incluida la cara).

## Paso 5: respuesta rápida y revisión de la cara

**Backend**

- `sequence_features.FrameArrays(frames, aspect_ratio)`: convierte la grabación una sola vez (forma normalizada, muñeca, tamaño, palma e índice de cada mano; expresiones, puntos, alto y postura de la cara). Métodos por ventana `start:stop`: `sign_features`, `expression_features`, `motion`, `face_ratio`, `has_hands`, `window(end_ms, window_ms)`. `build_sequence_features`, `build_expression_features`, `motion_amount` y `face_ratio` quedan como envoltorios: el resultado es idéntico bit a bit al cálculo anterior. `head_pose` acepta una o varias caras.
- `SequenceModel.window_features(recording, start, stop)`; `ml_predictor.predict_landmarks_batch` (mismas etiquetas y confianzas que una por una).
- `recording_decoder`: `step_ends(start_time, last_time, after)`, `analyze`, `finalize`, `decode_recording` (completa), `analyze_partial(frames, aspect, start_time, after)` → `{steps, expression_steps, until}` solo con las posiciones con algo, y `decode_streamed(frames, aspect, start_time, after, end_time, steps, expression_steps)`, que analiza el último trozo, ubica las posiciones en la grilla y arma las palabras.
- API: `POST /api/translate/recording/partial/` (`PartialRecordingIn`: hasta 900 frames, `start_t`, `after_t`); `RecordingIn` acepta `start_t`, `after_t`, `end_t`, `steps`, `expression_steps` (sin `start_t` analiza todo, como antes) y hasta 3600 frames. `app/gzip_request.py`: middleware que descomprime `Content-Encoding: gzip` (límites 5 MB comprimido y 25 MB descomprimido).

**Frontend**

- `api.js`: `jsonRequest` comprime con `CompressionStream("gzip")` los cuerpos de más de 4 KB (si el navegador no puede, se envían sin comprimir); `translateRecordingPartial`; `translateRecording(frames, aspect, stream)`; `saveDynamicSample` también comprime.
- `useRecordingTranslator`: el análisis empieza medio segundo antes de la primera mano (igual que el recorte final); cada 1 s, si no hay otro trozo en curso, envía los frames desde `afterT − 1,8 s`. Al detener espera el trozo en curso y envía el último con `end_t` = última mano + 0,5 s. Si nunca hubo manos o falla el envío por trozos, manda la grabación completa como antes. Muestra en consola el tiempo de respuesta.
- `HandCamera`: mide el tiempo de detección de manos y cara y los cuadros por segundo (`onStats` cada 1 s); lee la cara en 1 de cada 2 cuadros y pasa a 1 de cada 3 o 4 si el costo promedio supera 22 ms (vuelve bajo 12 ms); `faceMesh` dibuja los 478 puntos, la teselación y el iris.
- `FaceCheck.jsx` en Grabar señas (las dos versiones): "Lo que lee la cámara" con 8 expresiones principales y el giro e inclinación de la cabeza en barras, el rendimiento y el interruptor "Ver los 478 puntos".

## Paso 6: letras rápidas junto a las señas, y personas zurdas

**Decodificador (`recording_decoder.py`)**

- `classify_steps` devuelve tres pistas alineadas por posición:
  - **sign:** como antes.
  - **letter:** mano quieta los últimos `LETTER_STILL_MS = 300` ms (movimiento < 0,2), los últimos `LETTER_AGREE_FRAMES = 3` fotogramas con la misma letra y confianza media ≥ 0,9.
  - **shape:** si la mano se mueve, la letra más parecida con confianza ≥ 0,6.
- La grilla de posiciones sigue empezando a los 500 ms (`FIRST_STEP_MS`).
- Las letras se clasifican todas en un solo lote.
- `combine_signs_and_letters`:
  - Señas con `keep_sign_segments` (mínimo 2 posiciones, unión de repeticiones a ≤ 10 posiciones).
  - Letras con `LETTER_MIN_STEPS = 2`.
  - Se descarta una seña si empezaron 2 o más tramos de letra entre 12 posiciones antes de su primera detección y 3 antes de la última (era deletreo).
  - `sign_shape`: la forma más común en la pista *shape* entre 10 posiciones antes y 3 después de la primera detección (al menos 3, y la mitad de ellas).
  - Se descartan las letras con esa forma que toquen de 20 posiciones antes a 3 después de la seña (postura inicial o final).
  - Todo se ordena por primera posición. Ya no existe la regla de "letras bloqueadas 1 s después de una seña".
- Por trozos: las posiciones compactas llevan `kind` sign/letter/shape (`StepIn` acepta "shape"; hasta 4000) y `decode_streamed` las reparte por pista.

**Entrenamiento**

- `api/letter_shapes.py`:
  - Guarda y lee `formas_letras.npz`: hasta 80 formas normalizadas por letra quieta (sin J ni Z).
  - `train_from_roboflow.py` lo genera desde el conjunto de datos.
  - `python api/letter_shapes.py` lo saca de los vectores de soporte del SVM actual.
- `train_dynamic.py`:
  - **Deletreo como NADA** (`FINGERSPELLING_COPIES = 2` por muestra de seña): 3 a 6 letras sostenidas 150–600 ms, transiciones 100–300 ms, temblor 0,001, en la muñeca, tamaño, etiqueta de mano y cara de un fotograma real.
  - Espejo activado por defecto (`DYNAMIC_MIRROR`); las transiciones también se reflejan al 50%.
  - `TRANSITION_COPIES = 4` y `AUGMENTED_COPIES = 16`. Con espejo y menos copias aparecía un HOLA extra en 3/40 frases de diestros.
- `train_from_roboflow.py`: agrega cada fila reflejada (x negativo) al entrenamiento (`LSCH_MIRROR`).
- Practicar: una confirmación cada 400 ms (antes 700).

**Cómo se midió** (scripts de prueba fuera del proyecto):
- Deletreo simulado con formas reales del modelo de letras (mezcladas con el promedio de su letra hasta que el SVM las reconoce con ≥ 0,95) y temblor calibrado con muestras NADA reales.
- Zurdos: muestras no vistas reflejadas (x → 1 − x e intercambio de etiquetas).
- Palma vs dorso: cada mano girada 180° sobre su eje vertical (x y z relativos a la muñeca invertidos).

## Restricciones

- No toques el modelo estático, `/api/predict/` ni el Tutorial. Las reglas de aceptación de letras (`getSignRule`) se mantienen iguales dentro del modo único.
- No agregues TensorFlow ni otras dependencias nuevas al backend.
- Mantén el estilo del código existente: comentarios en español y estilos inline en las páginas tipo traductor.
- El formato JSON de las muestras y el cálculo de características deben quedar **exactamente** como se describe arriba, para que las muestras que ya estén grabadas sigan sirviendo. Si cambias las características, sube `FEATURE_VERSION`.

## Al terminar

- Revisa si hay Python, Node o Docker disponibles. Si los hay:
  - Compila los `.py` y corre `npm run lint` y `npm run build`.
  - Si puedes, haz una prueba sintética: genera muestras falsas, entrena con pocas épocas y predice con el backend.
  - Si no los hay, dilo claramente y revisa el código a mano.
- Resume qué cambió, cómo se usa y los riesgos:
  - El tag de la imagen de TensorFlow: si no existe, usar `latest`.
  - El accuracy sale optimista si todas las muestras son de una sola persona.
  - Sin la clase NADA, el modelo inventa señas.
  - El modelo corre en el servidor; pasarlo a TFLite para el celular queda para después, usando el `.keras`.
  - El modelo de letras no tiene clase "nada": una mano quieta en cuadro puede leerse como letra. Las reglas de 3 de 4 predicciones y el cooldown lo mitigan.
  - Si una persona deletrea dos palabras seguidas sin pausa, las letras se juntan en una sola palabra.
