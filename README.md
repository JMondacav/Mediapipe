# EnseñaVos App

Aplicacion web con frontend React/Vite, backend Django REST y modelo ML para clasificar landmarks de mano.

## Requisitos

- Docker y Docker Compose
- Camara habilitada en el navegador

## Levantar con Docker

Desde la raiz del proyecto:

```bash
docker compose up --build
```

Cuando termine de levantar:

- Frontend: https://localhost:5173
- Backend/API: http://localhost:8000/api
- Admin Django: http://localhost:8000/admin

Para probar desde un telefono en la misma red WiFi, abre la IP del computador:

```text
https://192.168.1.5:5173
```

El navegador puede mostrar una advertencia por el certificado local de desarrollo. En ese caso entra por "Avanzado" y continua al sitio.

El backend ejecuta las migraciones automaticamente al iniciar. La base de datos SQLite queda en `backend/db.sqlite3`.

## Crear usuario

Puedes registrarte desde la pantalla de la app. Si necesitas entrar al admin de Django:

```bash
docker compose exec backend python manage.py createsuperuser
```

## Apagar

```bash
docker compose down
```

Si quieres borrar tambien la base de datos local:

```bash
rm backend/db.sqlite3
```

## Levantar sin Docker

Backend:

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Frontend, en otra terminal:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Luego abre https://localhost:5173.

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
