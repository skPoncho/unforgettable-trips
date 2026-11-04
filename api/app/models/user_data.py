"""Datos del usuario: todo lleva user_id y toda consulta filtra por él. Ver docs/MODELO-DATOS.md."""

import enum
import uuid
from datetime import date, datetime

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import CITEXT
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Visibility(enum.StrEnum):
    """El orden importa: de más privada a más abierta (igual que el enum de Postgres)."""

    private = "private"
    link = "link"
    public = "public"

    @property
    def rank(self) -> int:
        return list(Visibility).index(self)


class VisitType(enum.StrEnum):
    stay = "stay"
    stopover = "stopover"


class Theme(enum.StrEnum):
    system = "system"
    dark = "dark"
    light = "light"


VISIBILITY = Enum(Visibility, name="visibility")
VISIT_TYPE = Enum(VisitType, name="visit_type")

_uuid_pk = {"primary_key": True, "default": uuid.uuid4}
_now = {"server_default": func.now()}


def _user_fk() -> Mapped[uuid.UUID]:
    return mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(**_uuid_pk)
    # Obligatorio desde la fase 8 (cuentas).
    email: Mapped[str | None] = mapped_column(CITEXT, unique=True)
    handle: Mapped[str] = mapped_column(Text, unique=True)
    display_name: Mapped[str] = mapped_column(Text)
    # La ciudad de casa, su estado y su país cuentan como visitados.
    home_city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"))
    theme: Mapped[Theme] = mapped_column(Enum(Theme, name="theme"), default=Theme.system)
    profile_public: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **_now)


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[uuid.UUID] = mapped_column(**_uuid_pk)
    user_id: Mapped[uuid.UUID] = _user_fk()
    title: Mapped[str] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    visibility: Mapped[Visibility] = mapped_column(VISIBILITY, default=Visibility.private)
    share_token: Mapped[str | None] = mapped_column(Text, unique=True)
    # Ciclos trips → photos/memories → stops → trips: las FK se agregan al final.
    cover_photo_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("photos.id", ondelete="SET NULL", use_alter=True)
    )
    favorite_memory_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("memories.id", ondelete="SET NULL", use_alter=True)
    )
    is_auto: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Stop(Base):
    __tablename__ = "stops"
    __table_args__ = (
        # Diferida para poder reordenar dentro de una transacción.
        UniqueConstraint(
            "trip_id",
            "position",
            name="uq_stops_trip_position",
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("departed_on >= arrived_on", name="ck_stops_dates"),
    )

    id: Mapped[uuid.UUID] = mapped_column(**_uuid_pk)
    trip_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trips.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = _user_fk()
    position: Mapped[int] = mapped_column(Integer)
    visit_type: Mapped[VisitType] = mapped_column(VISIT_TYPE, default=VisitType.stay)
    place_name: Mapped[str] = mapped_column(Text)
    city_id: Mapped[int | None] = mapped_column(ForeignKey("cities.id"), index=True)
    # País y estado se calculan desde el punto (app/geo/locate.py).
    country_id: Mapped[int] = mapped_column(ForeignKey("countries.id"), index=True)
    subdivision_id: Mapped[int | None] = mapped_column(ForeignKey("subdivisions.id"), index=True)
    location: Mapped[WKBElement] = mapped_column(
        Geometry("POINT", srid=4326, spatial_index=False), nullable=False
    )
    arrived_on: Mapped[date] = mapped_column(Date)
    departed_on: Mapped[date] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text)


class Memory(Base):
    __tablename__ = "memories"

    id: Mapped[uuid.UUID] = mapped_column(**_uuid_pk)
    user_id: Mapped[uuid.UUID] = _user_fk()
    stop_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stops.id", ondelete="CASCADE"), index=True
    )
    monument_id: Mapped[int | None] = mapped_column(
        ForeignKey("monuments.id", ondelete="SET NULL"), index=True
    )
    body: Mapped[str] = mapped_column(Text, default="")
    occurred_on: Mapped[date | None] = mapped_column(Date)
    # None = hereda la del viaje. Nunca más abierta que la del viaje (se valida al guardar).
    visibility: Mapped[Visibility | None] = mapped_column(VISIBILITY)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Photo(Base):
    __tablename__ = "photos"
    __table_args__ = (UniqueConstraint("user_id", "sha256", name="uq_photos_user_sha256"),)

    id: Mapped[uuid.UUID] = mapped_column(**_uuid_pk)
    user_id: Mapped[uuid.UUID] = _user_fk()
    # Nula mientras se sube; las huérfanas de más de 24 h se borran (fase 4).
    memory_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("memories.id", ondelete="SET NULL"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    # Prefijo en el StorageBackend; variantes original, display y thumb.
    storage_key: Mapped[str] = mapped_column(Text)
    mime: Mapped[str] = mapped_column(Text)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(Text)
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    location: Mapped[WKBElement | None] = mapped_column(
        Geometry("POINT", srid=4326, spatial_index=False)
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **_now)


class WishlistItem(Base):
    __tablename__ = "wishlist_items"
    __table_args__ = (UniqueConstraint("user_id", "country_id", name="uq_wishlist_user_country"),)

    id: Mapped[uuid.UUID] = mapped_column(**_uuid_pk)
    user_id: Mapped[uuid.UUID] = _user_fk()
    country_id: Mapped[int] = mapped_column(ForeignKey("countries.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), **_now)
