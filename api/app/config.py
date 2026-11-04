from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración leída de variables de entorno (las define docker-compose.yml)."""

    model_config = SettingsConfigDict(extra="ignore")

    database_url: str = "postgresql+psycopg://huella:huella@db:5432/huella"
    # Descargas de Natural Earth y GeoNames (montada desde ~/.cache/huella/geo).
    geo_cache_dir: Path = Path("/cache")
    # Fotos (volumen photos-data). En la fase 8 se podrá apuntar a S3.
    storage_dir: Path = Path("/data/photos")
    # Límites de la subida de fotos.
    max_photo_bytes: int = 30 * 1024 * 1024
    max_photos_per_upload: int = 50
    # Hasta la fase 8 (cuentas) todas las peticiones actúan como este usuario (make seed).
    current_user_handle: str = "carlos"


@lru_cache
def get_settings() -> Settings:
    return Settings()
