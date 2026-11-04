from fastapi import FastAPI

from app.errors import install_handlers
from app.routers import geo, health, me, memories, photos, trips

app = FastAPI(title="Huella API", version="0.4.0")
install_handlers(app)

# /health queda en la raíz para los healthchecks; las rutas de la app van bajo /api.
app.include_router(health.router)
app.include_router(geo.router)
app.include_router(me.router)
app.include_router(trips.router)
app.include_router(memories.router)
app.include_router(photos.router)
