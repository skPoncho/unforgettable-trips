"""Catálogo de monumentos (global). El catálogo completo llega en la fase 6; las semillas
cargan solo los de las maquetas. Los sellos se derivan de los recuerdos (vista user_stamps)."""

import enum

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import Enum, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MonumentKind(enum.StrEnum):
    unesco = "unesco"
    archaeological = "archaeological"
    other = "other"


class Monument(Base):
    __tablename__ = "monuments"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    name_es: Mapped[str] = mapped_column(Text)
    # Iniciales del sello: TEO, CHI, MA…
    stamp_code: Mapped[str] = mapped_column(Text)
    kind: Mapped[MonumentKind] = mapped_column(Enum(MonumentKind, name="monument_kind"))
    country_id: Mapped[int] = mapped_column(ForeignKey("countries.id"), index=True)
    subdivision_id: Mapped[int | None] = mapped_column(ForeignKey("subdivisions.id"), index=True)
    city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"))
    location: Mapped[WKBElement] = mapped_column(
        Geometry("POINT", srid=4326, spatial_index=False), nullable=False
    )
    source: Mapped[str] = mapped_column(Text)
    source_ref: Mapped[str | None] = mapped_column(Text)
