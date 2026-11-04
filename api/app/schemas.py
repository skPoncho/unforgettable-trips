"""Esquemas de entrada y salida de la API del usuario (viajes, paradas, recuerdos, progreso)."""

import uuid
from datetime import date, datetime
from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator

from app.models import Continent, MonumentKind, Theme, Visibility, VisitType


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


# --- Fotos -----------------------------------------------------------------------------


class PhotoOut(BaseModel):
    id: uuid.UUID
    memory_id: uuid.UUID | None = Field(description="Nula mientras no se guarda el recuerdo")
    position: int
    width: int
    height: int
    taken_at: datetime | None
    taken_on: date | None = Field(description="Fecha local de la toma (reloj de la cámara)")
    location: LonLat | None


class UploadedPhoto(PhotoOut):
    filename: str
    duplicate: bool = Field(description="Ya la habías subido: se devuelve la existente")


class UploadError(BaseModel):
    filename: str
    detail: str


class PhotoUploadOut(BaseModel):
    photos: list[UploadedPhoto]
    errors: list[UploadError] = Field(description="Archivos rechazados (los demás sí se suben)")


# --- Recuerdos -------------------------------------------------------------------------


class MemoryIn(BaseModel):
    """Va en una parada existente (`stop_id`) o en un lugar nuevo (`place`).

    Con `place` y `trip_id` va a la parada del viaje con la misma ciudad y fechas que se
    cruzan, o a una parada nueva. Con `place` solo, se crea un viaje automático de una
    parada ("Kioto · mar 2025").
    """

    stop_id: uuid.UUID | None = None
    place: PlaceIn | None = None
    trip_id: uuid.UUID | None = Field(None, description="Solo con `place`")
    monument_id: int | None = None
    body: str = Field("", max_length=20_000)
    occurred_on: date | None = Field(None, description="Por omisión, la de la primera foto")
    visibility: Visibility | None = Field(None, description="Nula = hereda la del viaje")
    photo_ids: list[uuid.UUID] = Field(
        default_factory=list,
        max_length=200,
        description="Fotos subidas y aún sin recuerdo, en orden (la primera es la portada)",
    )

    @model_validator(mode="after")
    def _one_place(self) -> Self:
        if (self.stop_id is None) == (self.place is None):
            raise ValueError("Indica stop_id o place, uno de los dos")
        if self.trip_id is not None and self.place is None:
            raise ValueError("trip_id solo va con place")
        if len(set(self.photo_ids)) != len(self.photo_ids):
            raise ValueError("Hay fotos repetidas")
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


class TripPhoto(BaseModel):
    id: uuid.UUID
    width: int
    height: int


class TripMemoryOut(MemoryOut):
    photos: list[TripPhoto] = Field(description="En orden; la primera es la portada")


class TripStopOut(StopOut):
    memories: list[TripMemoryOut]


class TripDetailOut(TripOut):
    """Lo que muestra el detalle de viaje: paradas con sus recuerdos y fotos."""

    stops: list[TripStopOut]
    route_km: float = Field(
        description="Línea geodésica entre las estancias, en orden (las escalas no cuentan)"
    )
    trip_number: int = Field(description="Lugar del viaje en tu historia: 1 es el más antiguo")
    trip_total: int
    continent: Continent | None = Field(description="Del primer país con estancia")


class LitPlaces(BaseModel):
    """Lo que se encendió (o pasó de escala a visitado) con este recuerdo."""

    countries: list[str] = Field(description="ISO3")
    subdivisions: list[str] = Field(description="Códigos de estado, p. ej. MX-OAX")
    cities: list[int]


class MemoryCreatedOut(MemoryOut):
    lit: LitPlaces


class SuggestIn(BaseModel):
    """Fotos ya subidas. Con `location` (al cambiar de lugar) se ignora el GPS de las fotos;
    con `arrived_on` y `departed_on`, sus fechas."""

    photo_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    location: LonLat | None = None
    arrived_on: date | None = None
    departed_on: date | None = None


class SuggestedPlace(BaseModel):
    place_name: str
    location: LonLat
    city: CityBrief | None
    subdivision: SubdivisionBrief | None
    country: CountryBrief


class SuggestedMonument(MonumentBrief):
    distance_km: float


class SuggestedTrip(BaseModel):
    id: uuid.UUID
    title: str
    visibility: Visibility
    is_auto: bool
    starts_on: date
    ends_on: date
    stop_id: uuid.UUID | None = Field(
        description="Parada de la misma ciudad en esas fechas: el recuerdo se guardará ahí"
    )


class MemorySuggestion(BaseModel):
    photo_count: int
    located_count: int = Field(description="Cuántas fotos traen GPS")
    place: SuggestedPlace | None = Field(description="Nulo si ninguna foto trae GPS")
    arrived_on: date | None
    departed_on: date | None
    monuments: list[SuggestedMonument] = Field(description="A menos de 5 km, el más cercano antes")
    trips: list[SuggestedTrip] = Field(
        description="Tus viajes cuyas fechas se cruzan; primero los que tienen parada en la ciudad"
    )


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


class MePatch(BaseModel):
    """Cambios al perfil. `home_city_id` nulo quita la ciudad de casa."""

    home_city_id: int | None = None


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


class CityStatus(BaseModel):
    id: int
    name_es: str
    country_iso3: str
    location: LonLat
    status: PlaceStatus
    first_visited_on: date | None
    is_home: bool


class MonumentStamp(BaseModel):
    """Monumento sellado: tiene al menos un recuerdo ligado."""

    id: int
    slug: str
    name_es: str
    country_iso3: str
    location: LonLat
    first_stamped_on: date


class MapOut(BaseModel):
    countries: list[CountryStatus]
    subdivisions: list[SubdivisionStatus]
    cities: list[CityStatus]
    monuments: list[MonumentStamp]
    wishlist: list[str] = Field(description="ISO3 de la lista de deseos")


class CountryTrip(BaseModel):
    """Un viaje que pasó por el país, con las fechas de lo que estuvo ahí."""

    id: uuid.UUID
    title: str
    visibility: Visibility
    visit_type: VisitType = Field(description="stay si hubo al menos una estancia en el país")
    starts_on: date
    ends_on: date


class StopoverBrief(BaseModel):
    place_name: str
    note: str | None
    arrived_on: date


class CountrySummaryOut(BaseModel):
    """Lo que muestra la tarjeta de país en Mi mapa."""

    iso3: str
    name_es: str
    status: PlaceStatus
    is_home: bool
    counts_in_progress: bool
    first_visited_on: date | None
    last_visited_on: date | None = Field(description="Llegada más reciente; nula si solo es casa")
    days: int = Field(description="Días distintos con estancia en el país")
    cities: int
    monuments: int
    photos: int
    photo_ids: list[uuid.UUID] = Field(description="Hasta 3 fotos, del viaje más reciente")
    trips: list[CountryTrip] = Field(description="Del más reciente al más antiguo")
    stopovers: list[StopoverBrief]


class WishlistEntry(BaseModel):
    iso3: str
    name_es: str
    continent: Continent
    created_at: datetime


# --- Mi país: estados, ciudades y pasaporte de monumentos -----------------------------


class SubdivisionOverview(BaseModel):
    """Un estado del país con lo que el usuario lleva en él."""

    code: str
    name_es: str
    status: PlaceStatus | None = Field(description="Nulo si está por descubrir")
    is_home: bool
    first_visited_on: date | None


class CityOverview(BaseModel):
    id: int
    name_es: str
    subdivision_code: str | None
    subdivision_name: str | None
    status: PlaceStatus
    is_home: bool
    trips: int = Field(description="Viajes distintos con una parada en la ciudad")
    last_visited_on: date | None


class PassportMonument(MonumentBrief):
    kind: MonumentKind
    subdivision_code: str | None
    subdivision_name: str | None
    location: LonLat


class StampTrip(BaseModel):
    """Viaje del primer recuerdo del monumento; adonde lleva "Ver recuerdos de este lugar"."""

    id: uuid.UUID
    title: str
    stop_number: int | None = Field(
        description="Número de estancia en el viaje (el ?parada= del detalle); nulo si fue escala"
    )


class PassportStamp(PassportMonument):
    first_stamped_on: date
    memories: int
    photo_count: int
    photo_ids: list[uuid.UUID] = Field(description="Hasta 3 fotos de sus recuerdos")
    trip: StampTrip


class SuggestedStamp(PassportMonument):
    near: str = Field(description="Parada o casa más cercana")
    distance_km: float


class PassportOut(BaseModel):
    country_iso3: str
    stamps: list[PassportStamp] = Field(description="Del primero que sellaste al más reciente")
    suggested: list[SuggestedStamp] = Field(
        description="Sin sellar, los más cercanos a tus paradas o a tu casa; uno por estado"
    )
