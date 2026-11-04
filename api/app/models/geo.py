"""Catálogos geográficos (globales, sin user_id). Ver docs/MODELO-DATOS.md."""

import enum

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import CHAR, Boolean, Enum, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Continent(enum.StrEnum):
    america = "america"
    europe = "europe"
    asia = "asia"
    africa = "africa"
    oceania = "oceania"


class Country(Base):
    __tablename__ = "countries"

    id: Mapped[int] = mapped_column(primary_key=True)
    iso2: Mapped[str] = mapped_column(CHAR(2), unique=True)
    iso3: Mapped[str] = mapped_column(CHAR(3), unique=True)
    iso_numeric: Mapped[str | None] = mapped_column(CHAR(3))
    name_es: Mapped[str] = mapped_column(Text)
    continent: Mapped[Continent] = mapped_column(Enum(Continent, name="continent"))
    # Solo los 195 suman al progreso; los territorios se pintan pero no cuentan.
    counts_in_progress: Mapped[bool] = mapped_column(Boolean)
    sovereign_id: Mapped[int | None] = mapped_column(ForeignKey("countries.id"))
    geom: Mapped[WKBElement | None] = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326, spatial_index=False)
    )
    label_point: Mapped[WKBElement | None] = mapped_column(
        Geometry("POINT", srid=4326, spatial_index=False)
    )


class Subdivision(Base):
    __tablename__ = "subdivisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    country_id: Mapped[int] = mapped_column(ForeignKey("countries.id"), index=True)
    code: Mapped[str] = mapped_column(Text, unique=True)
    name_es: Mapped[str] = mapped_column(Text)
    geonames_admin1: Mapped[str] = mapped_column(Text)
    geom: Mapped[WKBElement | None] = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326, spatial_index=False)
    )


class City(Base):
    __tablename__ = "cities"

    # geonameid de GeoNames.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(Text)
    name_es: Mapped[str] = mapped_column(Text)
    country_id: Mapped[int] = mapped_column(ForeignKey("countries.id"), index=True)
    subdivision_id: Mapped[int | None] = mapped_column(ForeignKey("subdivisions.id"), index=True)
    location: Mapped[WKBElement] = mapped_column(
        Geometry("POINT", srid=4326, spatial_index=False), nullable=False
    )
    population: Mapped[int] = mapped_column(Integer)
