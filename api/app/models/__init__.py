"""Modelos de SQLAlchemy. Importar aquí cada módulo para que Alembic vea su metadata."""

from app.models.base import Base
from app.models.geo import City, Continent, Country, Subdivision

__all__ = ["Base", "City", "Continent", "Country", "Subdivision"]
