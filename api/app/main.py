from fastapi import FastAPI

from app.routers import health

app = FastAPI(title="Huella API", version="0.1.0")

# /health queda en la raíz para los healthchecks; las rutas de la app irán bajo /api.
app.include_router(health.router)
