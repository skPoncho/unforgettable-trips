from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuración leída de variables de entorno (las define docker-compose.yml)."""

    model_config = SettingsConfigDict(extra="ignore")

    database_url: str = "postgresql+psycopg://huella:huella@db:5432/huella"


@lru_cache
def get_settings() -> Settings:
    return Settings()
