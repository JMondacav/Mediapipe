# EnsenaVos App

Aplicacion web con frontend React/Vite, backend FastAPI, persistencia en base de datos remota mediante `DATABASE_URL` y modelo ML para clasificar landmarks de mano.

## Funcionalidades evaluables

1. Registro e inicio de sesion de usuarios.
2. Traductor en vivo con MediaPipe y prediccion del modelo ML.
3. Historial de sesiones guardado en base de datos.
4. Estadisticas de uso y feedback.
5. Tutorial de letras/senas para aprender antes de practicar.
6. Ubicación de cada seña respecto a la cara (frente, boca, mentón), con los puntos de la cara.

## Requisitos

- Docker y Docker Compose
- Camara habilitada en el navegador
- Base de datos PostgreSQL remota para entrega final

## Configurar BD remota

Crea una base de datos PostgreSQL remota, por ejemplo en Neon, Supabase, Render o Railway, y define la variable:

```bash
DATABASE_URL=postgresql://usuario:password@host:5432/nombre_bd
```

En PowerShell:

```powershell
$env:DATABASE_URL="postgresql://usuario:password@host:5432/nombre_bd"
```

Si no defines `DATABASE_URL`, Docker usara SQLite local para desarrollo.

## Levantar con Docker

Desde la raiz del proyecto:

```bash
docker compose up --build
```

Cuando termine de levantar:

- Frontend: http://localhost:5173
- Backend/API: http://localhost:8000/api
- Salud API: http://localhost:8000/api/health/
- Docs FastAPI: http://localhost:8000/docs

## Publicar contenedores

Ejemplo para Docker Hub:

```bash
docker build -t usuario/ensenavos-backend:latest ./backend
docker build -t usuario/ensenavos-frontend:latest ./frontend
docker push usuario/ensenavos-backend:latest
docker push usuario/ensenavos-frontend:latest
```

En el TXT de entrega puedes pegar los enlaces de esas imagenes.

Para probar desde un telefono en la misma red WiFi, abre la IP del computador:

```text
http://192.168.1.5:5173
```

## Crear usuario

Puedes registrarte desde la pantalla de la app. El backend crea automaticamente las tablas necesarias al iniciar.

## Apagar

```bash
docker compose down
```

## Levantar sin Docker

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend, en otra terminal:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Luego abre http://localhost:5173.

## Que mostrar en el video

- Registro/login.
- Crear una sesion en el traductor y guardar una traduccion/feedback.
- Abrir historial y estadisticas para demostrar lectura desde BD.
- Mostrar en la consola o panel de la BD remota que se crearon filas en `users`, `sessions`, `translations` y `feedback`.
- Ejecutar `docker compose up --build` y abrir la app desde el contenedor.
- Mostrar Aprender señas (videos de las frases) y Grabar señas con la cara a la vista.

## Reentrenar modelo LSCh desde Roboflow

El dataset Roboflow debe estar descomprimido en:

```text
backend/data/roboflow_lsch/
```

con estructura:

```text
train/A/*.jpg
valid/A/*.jpg
test/A/*.jpg
```

Para extraer landmarks con MediaPipe y entrenar un nuevo `modelo_lsch.pkl`:

```bash
docker compose exec backend python api/train_from_roboflow.py
```

Si ya existe `backend/api/landmarks_roboflow_lsch.csv` y solo quieres reentrenar sin volver a procesar imagenes:

```bash
docker compose exec backend sh -c "LSCH_REUSE_CSV=True python api/train_from_roboflow.py"
```

El reporte queda en:

```text
backend/api/model_report_roboflow_lsch.json
```

El entrenamiento usa además cada letra reflejada (la misma letra con la otra
mano), para reconocer igual a personas diestras y zurdas (`LSCH_MIRROR=False`
lo apaga), y guarda `backend/api/formas_letras.npz`: las formas de cada letra
que usa el entrenamiento de señas para aprender que deletrear no es una seña.
Si cambian el modelo de letras sin reentrenarlo así, regeneren ese archivo con
`docker compose exec backend python api/letter_shapes.py`.

## Señas dinámicas (con movimiento)

Las señas con movimiento (por ejemplo J, Z o palabras) usan un segundo modelo:
una CNN 1D que mira una ventana de 1,5 s (30 pasos) con ambas manos y la
trayectoria de las muñecas. Convive con el modelo de letras en un **modo único**:
el traductor decide solo, en cada momento, si la persona hace una seña con
movimiento o deletrea una letra con la mano quieta (`backend/api/live_translator.py`).

1. **Grabar muestras.** En la app, abre Aprender > Grabar señas. Escribe el nombre
   de la seña y graba al menos 30 repeticiones de cada una, idealmente con varias
   personas. Haz la seña una vez, a la velocidad con que conversas; no hace
   falta llenar la barra. El entrenamiento fabrica además ejemplos de señas
   aceleradas y encadenadas, así que después se puede señar rápido y de corrido
   (probado hasta ~0,7 s por seña). Graba también la clase `NADA` con movimientos que no sean señas
   (deletrear palabras letra por letra, saludar con el dorso, rascarse, mover las
   manos al azar, sacarlas del cuadro).
   Las manos quietas no hace falta grabarlas: el backend las descarta solo con un
   filtro de movimiento. Las muestras quedan en `backend/data/dynamic_signs/`.
   Esa carpeta no se sube a git; para compartirla entre el equipo, comprímela.
   Graba con la cara a la vista: el modelo aprende también dónde se hace la
   seña respecto a la cara (ver "La cara: dónde se hace la seña").

2. **Entrenar.** No hace falta instalar TensorFlow en el backend:

   ```bash
   docker compose --profile train run --rm trainer
   ```

   Entrena las señas y, si hay muestras de expresiones, también las
   expresiones. Para entrenar solo una de las dos, agrega el comando al final:
   `docker compose --profile train run --rm trainer python3 api/train_dynamic.py --senas`
   (o `--expresiones`).

   Sin Docker: `pip install -r backend/requirements-train.txt` y luego
   `python api/train_dynamic.py` desde `backend/`.

   El entrenamiento fabrica además, como `NADA`:
   - **Transiciones:** el final o el comienzo de una seña, con las manos abajo
     o quietas en el resto. Así no aparecen señas inventadas entre una seña y
     otra.
   - **Deletreo:** letras sostenidas y el paso de una a otra, armadas con las
     formas reales de `formas_letras.npz`. Sin esto el modelo confundía el
     deletreo con HOLA y las letras se perdían.

   Y aprende cada seña también **hecha con la otra mano** ("espejo"), así las
   personas zurdas la usan sin grabar sus propias muestras (`-e
   DYNAMIC_MIRROR=False` lo apaga). Resultados con las muestras actuales,
   solo con muestras que el modelo no vio y con el traductor nuevo (ver
   "Letras y señas juntas"):

   | Prueba | Modelo entrenado antes | Reentrenado así |
   |---|---|---|
   | Frases fluidas (diestro) | 37/40 | 40/40 |
   | 3 señas seguidas, persona zurda (1× y 2×) | 0/30 | 30/30 |
   | HOLA con el dorso (no debe ser HOLA) | 12/12 lo era | 0/12 |
   | Seña y luego palabra deletreada | 18/30 | 25/30 |
   | Palabra deletreada y luego seña | 16/30 | 25/30 |
   | Letra sola (subir, sostener 0,6 s, bajar) | 12/192 | 179/192 |
   | 3 señas muy rápidas (2,5×, ~0,66 s cada una) | 30/30 | 27/30 |
   | Palabra que empieza con K | 17/20 | 1/20 (sale DEJAME PENSAR) |

   La K tiene la misma forma de mano que DEJAME_PENSAR, que casi no se
   mueve: solo las distingue que DEJAME_PENSAR se hace en el mentón. Para
   que el modelo lo aprenda, graben las señas con la cara a la vista antes
   de reentrenar (ver "La cara: dónde se hace la seña").

   **Reentrenado el 29-10-2026** sin las señas con garabatos (se borraron sus
   muestras): el modelo actual reconoce AURA, DEJAME_PENSAR, HOLA y NADA, con
   espejo para personas zurdas. Accuracy 100 % en validación y prueba, y 100 %
   con señas rápidas encadenadas (1×, 1,5× y 2×), con las muestras grabadas.
   No graben señas con garabatos: todo lo que está en
   `backend/data/dynamic_signs/` entra al modelo.

3. **Usar.** El entrenamiento deja `backend/api/modelo_dinamico.npz` y el
   backend lo carga solo, sin reiniciar. El reporte con accuracy y matriz de
   confusión queda en `backend/api/model_report_dinamico.json`. Al final, el
   entrenamiento imprime también la precisión con señas rápidas encadenadas a
   1×, 1,5× y 2× (`fluency_accuracy`).

El backend ejecuta el modelo con numpy, así que no necesita TensorFlow.
También se guarda `modelo_dinamico.keras` por si más adelante quieren
convertirlo a TensorFlow Lite para correrlo en el celular.

## La cara: dónde se hace la seña

En lengua de señas importa dónde se hace cada seña: DEJAME_PENSAR se hace en
el mentón y la K, con la misma forma de mano, en cualquier lugar. La app lee
la cara con MediaPipe FaceLandmarker, en el navegador, y el modelo de señas
recibe la posición de cada mano (palma y punta del índice) respecto a la
nariz, medida en "altos de cara" (de la frente al mentón). Así distingue
señas parecidas hechas en la frente, la boca, el mentón o el pecho.

- **Se activa al reentrenar** cuando al menos el 80 % de las muestras de señas
  se grabó con la cara a la vista (en al menos la mitad de sus cuadros). El
  29-10-2026 solo 1 de 108 muestras la tenía: hay que volver a grabar.
- **Grabar señas exige la cara:** una muestra donde la cara se vio en menos
  del 60 % de los cuadros se descarta. Cada palabra muestra cuántas de sus
  muestras tienen cara, y la tarjeta "Modelo" dice si la ubicación está
  activa y qué porcentaje falta.
- **Para comprobarlo en vivo:** en Grabar señas, el panel "Lo que lee la
  cámara" marca en qué zona está la mano (frente, ojos, nariz, boca, mentón,
  cuello, pecho o al costado), con la misma cuenta que el backend; las zonas
  son aproximadas, solo para mostrar. "Ver los 478 puntos" dibuja la malla
  completa de la cara.
- **En Traducir la cara se lee siempre** (ya no hay interruptor).
- **Privacidad:** el navegador envía solo números (5 puntos de la cara y 52
  valores por cuadro), nunca la imagen.

**Expresiones faciales (quitadas de la app):** `frontend/` ya no graba ni
muestra expresiones (pregunta, negación, etc.). El código del modelo de
expresiones sigue en el backend (`train_dynamic.py --expresiones`,
`modelo_expresiones.npz`), pero no hay muestras ni modelo, así que no se usa.
La versión accesible (`frontend-accesible/`) conserva su pestaña antigua.

## Diseño de la app (EnSeñas)

`frontend/` usa el diseño **EnSeñas** del encargado de interfaz (su app Expo
`Ense-as-v3.0`), llevado a esta web. Solo cambió la pantalla: la cámara y el
reconocimiento son los mismos archivos de antes (`HandCamera.jsx`,
`useRecordingTranslator.js`, `FaceCheck.jsx`, `SignWords.jsx`,
`services/api.js`), y el backend no cambió.

- **Dos inicios:** *Uso señas* y *Hablo y escucho* (se cambian cuando se
  quiera, en Inicio o Perfil). Después se entra o se crea la cuenta.
- **5 pestañas**, siempre iguales: Inicio · Traducir · Aprender · Historial ·
  Perfil.
- **Traducir:** *Señas → texto* o *Voz → texto*. Un aviso de estado siempre
  visible, con ícono y texto (listo, grabando, traduciendo, resultado,
  error). Se toca *Empezar a señar*, se hacen las señas de corrido y
  *Terminar y traducir* (o bajar las manos 2 s). Las señas aparecen tal cual,
  con su expresión de la cara; se pueden mostrar en pantalla completa,
  escuchar, borrar la última o descartar. *Oír a la otra persona* escribe lo
  que dice la persona oyente. Todo queda en una conversación en burbujas
  (señas a la derecha, voz y frases a la izquierda). *Terminar conversación*
  pide la valoración con caritas.
- **Frases en señas (persona oyente):** en *Traducir > Voz* y en Inicio en
  modo Voz. Se toca una frase prehecha y se le muestra a la persona sorda, en
  grande, el video de su seña con el texto. Los videos van en
  `frontend/public/senas/frases/<id>.mp4` (lista de nombres en el `LEEME.txt`
  de esa carpeta); mientras no existan se ve "Video de la seña en LSCh:
  pendiente de contenido".
- **Aprender:** *Aprender señas* (los videos de las frases frecuentes, con
  opción de verlos más lento) y *Grabar señas*, herramienta del equipo (se
  escribe la palabra y se graban ejemplos de su seña, con la cara a la vista,
  para entrenar el modelo).
- **Mis frases** (en Inicio, modo Señas): frases propias, como la dirección o
  una alergia, para mostrarlas escritas en grande.
- **Historial:** cada conversación con sus señas y expresiones, para
  mostrarla o escucharla otra vez.
- **Perfil:** cómo me comunico, tamaño del texto, tema claro/oscuro, modo de
  poca lectura, vibración, leer en voz alta las señas, estadísticas de uso y
  cerrar sesión.

Diferencias con la app Expo del encargado de interfaz: no hay modo "sin
cuenta" (la traducción usa el servidor y guarda cada conversación en la
cuenta), no hay "Borrar historial" (el backend no tiene esa ruta) y la voz
de la persona oyente usa el reconocimiento de voz del navegador (Chrome o
Edge, con internet), sin guardarse en el historial. La paleta, los tamaños
(áreas táctiles de 48 px o más, texto de 16 px o más) y la tipografía
Atkinson Hyperlegible son los de su diseño; los colores que se agregaron para
las expresiones de la cara cumplen contraste AA en claro y oscuro.

## Versión accesible (prototipo)

`frontend-accesible/` es una copia del frontend rediseñada para personas sordas:
señas en video, íconos, colores por función y avisos visuales, sin párrafos. Se
entra tocando un animal y marcando un PIN de 4 números. Con
`docker compose up --build` queda en http://localhost:5174, usando el mismo
backend. Detalles en `frontend-accesible/README.md`.

Su traductor funciona en modo **grabar y después traducir**: la persona hace
todas sus señas de corrido y, al terminar, el backend analiza la grabación
completa (`backend/api/recording_decoder.py`, endpoint
`POST /api/translate/recording/`). Recorre la grabación con la ventana de
1,5 s cada 100 ms y busca los tramos donde una misma seña se mantiene, así que
no hace falta pausar entre señas.

**Después de actualizar el código, reentrenen el modelo de señas.** El
entrenamiento ahora calcula el umbral del filtro de movimiento según las señas
grabadas y lo guarda en el modelo; con un modelo antiguo se usa 0,5, que
bloquea señas casi quietas como DEJAME_PENSAR.

## Letras y señas juntas

Las letras (modelo estático) y las señas con movimiento se leen en **pistas
separadas**, así se pueden combinar sin esperar: por ejemplo `HOLA` y enseguida
deletrear `R-O-M-A`.

- **Cada letra basta sostenerla ~0,5 s** (0,3 s quieta y 2 posiciones con la
  misma letra en 3 cuadros seguidos). Antes hacía falta ~1 s por letra y,
  después de una seña, esperar 1 s más.
- La postura con que empieza o termina una seña no se escribe como letra: si
  una letra tiene la misma forma con que se movió la seña (HOLA se mueve con
  forma de B, AURA de M) y está pegada a ella, es parte de la seña.
- Si mientras se detectaba una "seña" hubo 2 o más letras sostenidas, era
  deletreo y no se escribe la seña.
- El modelo de señas se entrena con deletreo y con letras solas (la mano
  sube formando la letra, la sostiene y baja) como `NADA`. Con el modelo
  anterior, hacer una letra sola inventaba una seña (casi siempre HOLA) en
  180 de 192 pruebas; reentrenado, la letra sale bien en 179 de 192.
- Cada letra exige confianza 0,75, salvo la B, que exige 0,9: una mano
  abierta en reposo se lee como B.

Medido con formas reales de letras en deletreo simulado (letras de 0,5 s):
palabras exactas 0/30 antes y 26/30 ahora con el modelo actual (28/30 con el
modelo reentrenado).

**Consejo de uso:** una mano abierta y quieta se parece a la letra B. Para
descansar entre señas, baja la mano o ciérrala.

## Personas zurdas

No necesitan grabar nada:
- **Señas con movimiento:** el modelo se entrena también con cada seña
  reflejada (ver "Entrenar"). Hay que reentrenar una vez.
- **Letras:** el modelo de letras ya trae ejemplos de ambas manos (en sus
  ejemplos, el pulgar queda a la izquierda la mitad de las veces y a la
  derecha la otra mitad). Reconoce el 90% de sus propios ejemplos reflejados.
  Al volver a entrenarlo desde Roboflow se agrega el reflejo de cada imagen.
- **Expresiones:** se entrenan reflejadas desde el comienzo.

## Tiempo de respuesta

El traductor no espera a que termines para empezar a analizar: **mientras
grabas**, cada ~1 s manda lo nuevo al servidor (comprimido con gzip) y el
servidor lo va analizando. Al tocar Detener solo falta el último segundo, así
que la respuesta no depende de cuánto dure la grabación. El resultado es
idéntico al de analizar la grabación completa (probado en 120 grabaciones con
y sin cara).

Medido con un servidor real (uvicorn, en un computador de desarrollo), con la
cara activada, desde que se toca Detener:

| Grabación | Antes (todo al final) | Ahora (por trozos) |
|---|---|---|
| 5 s | 136 ms de análisis + subir 103 KB | ~14 ms + subir 13 KB |
| 30 s | 842 ms de análisis + subir 733 KB (~1,2 s en 4G) | ~12 ms + subir 17 KB |

A eso se suma la latencia de la red (en 4G, típicamente 50–100 ms). Además,
el análisis completo ahora es ~4 veces más rápido (cada grabación se convierte
a arrays una sola vez), y el navegador ajusta solo cada cuánto lee la cara si
el teléfono va justo: las manos se leen siempre en todos los cuadros.

## Qué muestra el traductor

Solo las señas reconocidas, tal como salen y en el orden en que salen (por
ejemplo `HOLA JUAN DEJAME PENSAR`). La app no interpreta, reordena ni convierte
las señas en una frase en español. Lo único que se junta son las letras
deletreadas seguidas, que forman una palabra (J-U-A-N → `JUAN`).

En `frontend/` ya no se marcan expresiones de la cara (ver "La cara: dónde se
hace la seña"). La versión accesible, si tiene un modelo de expresiones, todavía
muestra las palabras dichas con una misma expresión dentro de un recuadro con
la expresión arriba, como la marca sobre la glosa, y en el historial las guarda
como `NOMBRE|PREGUNTA_QU`.
