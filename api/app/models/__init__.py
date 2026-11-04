"""Modelos de SQLAlchemy. Importar aquí cada módulo para que Alembic vea su metadata."""

from app.models.base import Base
from app.models.geo import City, Continent, Country, Subdivision
from app.models.monument import Monument, MonumentKind
from app.models.user_data import (
    Memory,
    Photo,
    Stop,
    Theme,
    Trip,
    User,
    Visibility,
    VisitType,
    WishlistItem,
)

__all__ = [
    "Base",
    "City",
    "Continent",
    "Country",
    "Memory",
    "Monument",
    "MonumentKind",
    "Photo",
    "Stop",
    "Subdivision",
    "Theme",
    "Trip",
    "User",
    "Visibility",
    "VisitType",
    "WishlistItem",
]
