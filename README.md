# EnsenaVos App

Aplicacion web con frontend React/Vite, backend FastAPI, persistencia en base de datos remota mediante `DATABASE_URL` y modelo ML para clasificar landmarks de mano.

## Funcionalidades evaluables

1. Registro e inicio de sesion de usuarios.
2. Traductor en vivo con MediaPipe y prediccion del modelo ML.
3. Historial de sesiones guardado en base de datos.
4. Estadisticas de uso y feedback.
5. Tutorial de letras/senas para aprender antes de practicar.

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
- Mostrar el tutorial de letras.

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
