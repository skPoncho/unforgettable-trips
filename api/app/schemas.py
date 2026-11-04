"""Esquemas de entrada y salida de la API del usuario (viajes, paradas, recuerdos, progreso)."""

import uuid
from datetime import date, datetime
from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator

from app.models import Continent, Theme, Visibility, VisitType


class LonLat(BaseModel):
    lon: float = Field(ge=-180, le=180)
    lat: float = Field(ge=-90, le=90)


class CountryBrief(BaseModel):
    iso3: str
    name_es: str


class SubdivisionBrief(BaseModel):
    code: str
    name_es: str


class CityBrief(BaseModel):
    id: int
    name_es: str


# --- Paradas ---------------------------------------------------------------------------


class PlaceIn(BaseModel):
    """Un lugar con fechas. País y estado se calculan desde `location`.

    Si no se manda `city_id`, una estancia toma la ciudad más cercana y una escala se queda
    sin ciudad (aeropuertos). Mandar `city_id: null` deja la parada sin ciudad.
    """

    place_name: str = Field(min_length=1, max_length=200)
    location: LonLat
    visit_type: VisitType = VisitType.stay
    arrived_on: date
    departed_on: date | None = Field(None, description="Por omisión, el mismo día de llegada")
    city_id: int | None = None

    @model_validator(mode="after")
    def _dates(self) -> Self:
        if self.departed_on is not None and self.departed_on < self.arrived_on:
            raise ValueError("La salida no puede ser antes de la llegada")
        return self


class StopIn(PlaceIn):
    note: str | None = Field(None, max_length=2000)
    position: int | None = Field(None, ge=0, description="Por omisión, al final")


class StopPatch(BaseModel):
    place_name: str | None = Field(None, min_length=1, max_length=200)
    location: LonLat | None = None
    visit_type: VisitType | None = None
    arrived_on: date | None = None
    departed_on: date | None = None
    city_id: int | None = None
    note: str | None = Field(None, max_length=2000)


class StopOut(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    position: int
    visit_type: VisitType
    place_name: str
    city: CityBrief | None
    country: CountryBrief
    subdivision: SubdivisionBrief | None
    location: LonLat
    arrived_on: date
    departed_on: date
    note: str | None


class StopOrderIn(BaseModel):
    stop_ids: list[uuid.UUID]


# --- Viajes ----------------------------------------------------------------------------


class TripIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str | None = Field(None, max_length=2000)
    visibility: Visibility = Visibility.private


class TripPatch(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    summary: str | None = Field(None, max_length=2000)
    visibility: Visibility | None = None
    cover_photo_id: uuid.UUID | None = None
    favorite_memory_id: uuid.UUID | None = None


class TripOut(BaseModel):
    """Fechas, días y conteos se calculan desde las paradas; no se guardan."""

    id: uuid.UUID
    title: str
    summary: str | None
    visibility: Visibility
    share_token: str | None
    is_auto: bool
    cover_photo_id: uuid.UUID | None = Field(
        description="La elegida o, si no hay, la primera foto del viaje"
    )
    favorite_memory_id: uuid.UUID | None
    starts_on: date | None
    ends_on: date | None
    days: int
    stop_count: int
    city_count: int
    memory_count: int
    photo_count: int
    monument_count: int
    countries: list[str] = Field(description="ISO3 de los países con estancia, en orden")
    stopover_countries: list[str] = Field(description="ISO3 de los países con solo escalas")
    created_at: datetime
    updated_at: datetime


class TripDetailOut(TripOut):
    stops: list[StopOut]


# --- Recuerdos -------------------------------------------------------------------------


class MemoryIn(BaseModel):
    """Va en una parada existente (`stop_id`) o en un lugar nuevo (`place`).

    Con `place` se crea un viaje automático de una parada ("Kioto · mar 2025").
    """

    stop_id: uuid.UUID | None = None
    place: PlaceIn | None = None
    monument_id: int | None = None
    body: str = Field("", max_length=20_000)
    occurred_on: date | None = None
    visibility: Visibility | None = Field(None, description="Nula = hereda la del viaje")

    @model_validator(mode="after")
    def _one_place(self) -> Self:
        if (self.stop_id is None) == (self.place is None):
            raise ValueError("Indica stop_id o place, uno de los dos")
        return self


class MemoryPatch(BaseModel):
    stop_id: uuid.UUID | None = None
    monument_id: int | None = None
    body: str | None = Field(None, max_length=20_000)
    occurred_on: date | None = None
    visibility: Visibility | None = None


class MonumentBrief(BaseModel):
    id: int
    slug: str
    name_es: str
    stamp_code: str


class MemoryOut(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    stop_id: uuid.UUID
    monument: MonumentBrief | None
    body: str
    occurred_on: date | None
    visibility: Visibility | None
    effective_visibility: Visibility = Field(
        description="La más restrictiva entre la del recuerdo y la del viaje"
    )
    photo_count: int
    created_at: datetime
    updated_at: datetime


# --- Yo: perfil, progreso, mapa y deseos -----------------------------------------------


class HomeCity(BaseModel):
    id: int
    name_es: str
    country_iso3: str
    subdivision_code: str | None


class MeOut(BaseModel):
    id: uuid.UUID
    handle: str
    display_name: str
    home_city: HomeCity | None
    theme: Theme
    profile_public: bool


class Count(BaseModel):
    visited: int
    total: int


class CountriesProgress(Count):
    stopover_only: int = Field(description="Cuántos de los visitados son solo escala")


class ContinentProgress(Count):
    continent: Continent


class SubdivisionsProgress(Count):
    country_iso3: str


class ProgressOut(BaseModel):
    countries: CountriesProgress
    continents: list[ContinentProgress]
    subdivisions: SubdivisionsProgress
    cities: int
    monuments: int
    trips: int
    photos: int
    wishlist: int


PlaceStatus = Literal["visited", "stopover"]


class CountryStatus(BaseModel):
    iso3: str
    status: PlaceStatus
    first_visited_on: date | None = Field(description="Nula para la casa (cuenta desde siempre)")
    is_home: bool
    counts_in_progress: bool


class SubdivisionStatus(BaseModel):
    code: str
    status: PlaceStatus
    first_visited_on: date | None
    is_home: bool


class MapOut(BaseModel):
    countries: list[CountryStatus]
    subdivisions: list[SubdivisionStatus]
    wishlist: list[str] = Field(description="ISO3 de la lista de deseos")


class WishlistEntry(BaseModel):
    iso3: str
    name_es: str
    continent: Continent
    created_at: datetime
