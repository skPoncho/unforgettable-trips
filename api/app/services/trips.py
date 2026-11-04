"""Viajes y paradas del usuario."""

import secrets
import uuid
from datetime import date
from typing import Any

from geoalchemy2 import WKTElement
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.errors import InvalidError, NotFoundError
from app.geo.locate import locate
from app.models import City, Memory, Photo, Stop, Trip, User, Visibility, VisitType
from app.schemas import (
    CityBrief,
    CountryBrief,
    LonLat,
    PlaceIn,
    StopIn,
    StopOut,
    StopPatch,
    SubdivisionBrief,
    TripIn,
    TripOut,
    TripPatch,
)
from app.services.photos import photos_of_stops, photos_of_trip, purge_photos
from app.storage import StorageBackend


def point(location: LonLat) -> WKTElement:
    return WKTElement(f"POINT({location.lon} {location.lat})", srid=4326)


# --- Lectura (SQL: conteos y coordenadas salen calculados) ------------------------------

_TRIPS_SQL = """
WITH st AS (
    SELECT trip_id, min(arrived_on) AS starts_on, max(departed_on) AS ends_on,
           count(*) AS stop_count, count(DISTINCT city_id) AS city_count
    FROM stops WHERE user_id = :uid GROUP BY trip_id
), mem AS (
    SELECT s.trip_id, count(*) AS memory_count, count(DISTINCT m.monument_id) AS monument_count
    FROM memories m JOIN stops s ON s.id = m.stop_id
    WHERE m.user_id = :uid GROUP BY s.trip_id
), ph AS (
    SELECT s.trip_id, count(*) AS photo_count
    FROM photos p JOIN memories m ON m.id = p.memory_id JOIN stops s ON s.id = m.stop_id
    WHERE p.user_id = :uid GROUP BY s.trip_id
), cover AS (
    SELECT DISTINCT ON (s.trip_id) s.trip_id, p.id AS photo_id
    FROM photos p JOIN memories m ON m.id = p.memory_id JOIN stops s ON s.id = m.stop_id
    WHERE p.user_id = :uid
    ORDER BY s.trip_id, s.position, m.created_at, m.id, p.position, p.created_at
), co AS (
    SELECT trip_id,
           array_agg(iso3 ORDER BY first_position) FILTER (WHERE has_stay) AS countries,
           array_agg(iso3 ORDER BY first_position) FILTER (WHERE NOT has_stay)
               AS stopover_countries
    FROM (
        SELECT s.trip_id, c.iso3::text AS iso3, min(s.position) AS first_position,
               bool_or(s.visit_type = 'stay') AS has_stay
        FROM stops s JOIN countries c ON c.id = s.country_id
        WHERE s.user_id = :uid GROUP BY s.trip_id, c.iso3
    ) per_country
    GROUP BY trip_id
)
SELECT t.id, t.title, t.summary, t.visibility, t.share_token, t.is_auto,
       COALESCE(t.cover_photo_id, cover.photo_id) AS cover_photo_id, t.favorite_memory_id,
       st.starts_on, st.ends_on,
       COALESCE(st.stop_count, 0) AS stop_count, COALESCE(st.city_count, 0) AS city_count,
       COALESCE(mem.memory_count, 0) AS memory_count,
       COALESCE(mem.monument_count, 0) AS monument_count,
       COALESCE(ph.photo_count, 0) AS photo_count,
       COALESCE(co.countries, '{}') AS countries,
       COALESCE(co.stopover_countries, '{}') AS stopover_countries,
       t.created_at, t.updated_at
FROM trips t
LEFT JOIN st ON st.trip_id = t.id
LEFT JOIN mem ON mem.trip_id = t.id
LEFT JOIN ph ON ph.trip_id = t.id
LEFT JOIN cover ON cover.trip_id = t.id
LEFT JOIN co ON co.trip_id = t.id
WHERE t.user_id = :uid AND (CAST(:trip_id AS uuid) IS NULL OR t.id = CAST(:trip_id AS uuid))
ORDER BY st.starts_on DESC NULLS LAST, t.created_at DESC
"""

_STOPS_SQL = """
SELECT s.id, s.trip_id, s.position, s.visit_type, s.place_name, s.arrived_on, s.departed_on,
       s.note, ST_X(s.location) AS lon, ST_Y(s.location) AS lat,
       ci.id AS city_id, ci.name_es AS city_name,
       c.iso3::text AS country_iso3, c.name_es AS country_name,
       sd.code AS subdivision_code, sd.name_es AS subdivision_name
FROM stops s
JOIN countries c ON c.id = s.country_id
LEFT JOIN cities ci ON ci.id = s.city_id
LEFT JOIN subdivisions sd ON sd.id = s.subdivision_id
WHERE s.user_id = :uid
  AND (CAST(:trip_id AS uuid) IS NULL OR s.trip_id = CAST(:trip_id AS uuid))
  AND (CAST(:stop_id AS uuid) IS NULL OR s.id = CAST(:stop_id AS uuid))
ORDER BY s.trip_id, s.position
"""


def _trip_out(row: dict[str, Any]) -> TripOut:
    days = (row["ends_on"] - row["starts_on"]).days + 1 if row["starts_on"] else 0
    return TripOut(**row, days=days)


def _stop_out(row: dict[str, Any]) -> StopOut:
    return StopOut(
        id=row["id"],
        trip_id=row["trip_id"],
        position=row["position"],
        visit_type=row["visit_type"],
        place_name=row["place_name"],
        arrived_on=row["arrived_on"],
        departed_on=row["departed_on"],
        note=row["note"],
        location=LonLat(lon=row["lon"], lat=row["lat"]),
        city=CityBrief(id=row["city_id"], name_es=row["city_name"]) if row["city_id"] else None,
        country=CountryBrief(iso3=row["country_iso3"], name_es=row["country_name"]),
        subdivision=SubdivisionBrief(code=row["subdivision_code"], name_es=row["subdivision_name"])
        if row["subdivision_code"]
        else None,
    )


def list_trips(session: Session, user: User) -> list[TripOut]:
    rows = session.execute(text(_TRIPS_SQL), {"uid": user.id, "trip_id": None}).mappings()
    return [_trip_out(dict(r)) for r in rows]


def list_stops(
    session: Session,
    user: User,
    *,
    trip_id: uuid.UUID | None = None,
    stop_id: uuid.UUID | None = None,
) -> list[StopOut]:
    rows = session.execute(
        text(_STOPS_SQL), {"uid": user.id, "trip_id": trip_id, "stop_id": stop_id}
    ).mappings()
    return [_stop_out(dict(r)) for r in rows]


def trip_summary(session: Session, user: User, trip_id: uuid.UUID) -> TripOut:
    row = session.execute(text(_TRIPS_SQL), {"uid": user.id, "trip_id": trip_id}).mappings().first()
    if row is None:
        raise NotFoundError("Viaje no encontrado")
    return _trip_out(dict(row))


def stop_detail(session: Session, user: User, stop_id: uuid.UUID) -> StopOut:
    stops = list_stops(session, user, stop_id=stop_id)
    if not stops:
        raise NotFoundError("Parada no encontrada")
    return stops[0]


# --- Dueño ------------------------------------------------------------------------------


def owned_trip(session: Session, user: User, trip_id: uuid.UUID) -> Trip:
    trip = session.get(Trip, trip_id)
    if trip is None or trip.user_id != user.id:
        raise NotFoundError("Viaje no encontrado")
    return trip


def owned_stop(session: Session, user: User, stop_id: uuid.UUID) -> Stop:
    stop = session.get(Stop, stop_id)
    if stop is None or stop.user_id != user.id:
        raise NotFoundError("Parada no encontrada")
    return stop


# --- Viajes -----------------------------------------------------------------------------


def _ensure_share_token(trip: Trip) -> None:
    if trip.visibility == Visibility.link and trip.share_token is None:
        trip.share_token = secrets.token_urlsafe(16)


def create_trip(session: Session, user: User, data: TripIn, *, is_auto: bool = False) -> Trip:
    trip = Trip(
        user_id=user.id,
        title=data.title,
        summary=data.summary,
        visibility=data.visibility,
        is_auto=is_auto,
    )
    _ensure_share_token(trip)
    session.add(trip)
    session.flush()
    return trip


def update_trip(session: Session, user: User, trip_id: uuid.UUID, patch: TripPatch) -> Trip:
    trip = owned_trip(session, user, trip_id)
    fields = patch.model_dump(exclude_unset=True)
    for name in ("title", "visibility"):
        if name in fields and fields[name] is None:
            raise InvalidError(f"{name} no puede ser nulo")

    if fields.get("cover_photo_id") is not None:
        in_trip = session.scalar(
            select(func.count())
            .select_from(Photo)
            .join(Memory, Memory.id == Photo.memory_id)
            .join(Stop, Stop.id == Memory.stop_id)
            .where(Photo.id == fields["cover_photo_id"], Stop.trip_id == trip.id)
        )
        if not in_trip:
            raise InvalidError("La portada debe ser una foto de este viaje")
    if fields.get("favorite_memory_id") is not None:
        in_trip = session.scalar(
            select(func.count())
            .select_from(Memory)
            .join(Stop, Stop.id == Memory.stop_id)
            .where(Memory.id == fields["favorite_memory_id"], Stop.trip_id == trip.id)
        )
        if not in_trip:
            raise InvalidError("El momento favorito debe ser un recuerdo de este viaje")

    for name, value in fields.items():
        setattr(trip, name, value)
    # Si el viaje se vuelve más restrictivo, la visibilidad efectiva de sus recuerdos baja
    # sola (effective_visibility); no se tocan los recuerdos.
    _ensure_share_token(trip)
    session.flush()
    return trip


def delete_trip(session: Session, storage: StorageBackend, user: User, trip_id: uuid.UUID) -> None:
    trip = owned_trip(session, user, trip_id)
    purge_photos(session, storage, photos_of_trip(trip.id))
    session.delete(trip)
    session.flush()


# --- Paradas ----------------------------------------------------------------------------


def _resolve_place(
    session: Session,
    location: LonLat,
    visit_type: VisitType,
    *,
    city_id: int | None,
    city_given: bool,
) -> tuple[int, int | None, int | None]:
    """(country_id, subdivision_id, city_id) calculados desde el punto."""
    found = locate(session, lon=location.lon, lat=location.lat)
    if found is None:
        raise InvalidError("El punto no está en ningún país")
    if city_given:
        if city_id is not None:
            city = session.get(City, city_id)
            if city is None:
                raise InvalidError(f"Ciudad desconocida: {city_id}")
            if city.country_id != found.country.id:
                raise InvalidError("La ciudad no está en el país del punto")
    else:
        # Las escalas suelen ser aeropuertos: no se les asigna ciudad.
        city_id = found.city.id if visit_type == VisitType.stay and found.city else None
    subdivision_id = found.subdivision.id if found.subdivision else None
    return found.country.id, subdivision_id, city_id


def _stops_of(session: Session, trip_id: uuid.UUID) -> list[Stop]:
    return list(
        session.scalars(select(Stop).where(Stop.trip_id == trip_id).order_by(Stop.position))
    )


def _renumber(stops: list[Stop]) -> None:
    for position, stop in enumerate(stops):
        stop.position = position


def add_stop(session: Session, user: User, trip_id: uuid.UUID, data: StopIn) -> Stop:
    trip = owned_trip(session, user, trip_id)
    country_id, subdivision_id, city_id = _resolve_place(
        session,
        data.location,
        data.visit_type,
        city_id=data.city_id,
        city_given="city_id" in data.model_fields_set,
    )
    stop = Stop(
        trip_id=trip.id,
        user_id=user.id,
        visit_type=data.visit_type,
        place_name=data.place_name,
        city_id=city_id,
        country_id=country_id,
        subdivision_id=subdivision_id,
        location=point(data.location),
        arrived_on=data.arrived_on,
        departed_on=data.departed_on or data.arrived_on,
        note=data.note,
    )
    stops = _stops_of(session, trip.id)
    at = len(stops) if data.position is None else min(data.position, len(stops))
    stops.insert(at, stop)
    _renumber(stops)
    session.add(stop)
    session.flush()
    return stop


def matching_stop(
    session: Session,
    trip_id: uuid.UUID,
    city_id: int | None,
    arrived_on: date,
    departed_on: date,
) -> Stop | None:
    """La parada del viaje en la misma ciudad cuyas fechas se cruzan con las dadas."""
    if city_id is None:
        return None
    return session.scalar(
        select(Stop)
        .where(
            Stop.trip_id == trip_id,
            Stop.city_id == city_id,
            Stop.arrived_on <= departed_on,
            Stop.departed_on >= arrived_on,
        )
        .order_by(Stop.position)
        .limit(1)
    )


def stop_for_place(session: Session, user: User, trip_id: uuid.UUID, place: PlaceIn) -> Stop:
    """Reusa la parada con la misma ciudad y fechas que se cruzan; si no hay, agrega una
    nueva en orden cronológico."""
    trip = owned_trip(session, user, trip_id)
    departed_on = place.departed_on or place.arrived_on
    _, _, city_id = _resolve_place(
        session,
        place.location,
        place.visit_type,
        city_id=place.city_id,
        city_given="city_id" in place.model_fields_set,
    )
    found = matching_stop(session, trip.id, city_id, place.arrived_on, departed_on)
    if found is not None:
        return found
    position = session.scalar(
        select(func.count())
        .select_from(Stop)
        .where(Stop.trip_id == trip.id, Stop.arrived_on <= place.arrived_on)
    )
    stop_in = StopIn(**place.model_dump(exclude_unset=True), position=position)
    return add_stop(session, user, trip.id, stop_in)


def update_stop(session: Session, user: User, stop_id: uuid.UUID, patch: StopPatch) -> Stop:
    stop = owned_stop(session, user, stop_id)
    fields = patch.model_dump(exclude_unset=True)
    for name in ("place_name", "location", "visit_type", "arrived_on", "departed_on"):
        if name in fields and fields[name] is None:
            raise InvalidError(f"{name} no puede ser nulo")

    arrived = fields.get("arrived_on", stop.arrived_on)
    departed = fields.get("departed_on", stop.departed_on)
    if departed < arrived:
        raise InvalidError("La salida no puede ser antes de la llegada")

    if patch.location is not None or "city_id" in fields:
        location = patch.location or LonLat(
            **session.execute(
                text(
                    "SELECT ST_X(location) AS lon, ST_Y(location) AS lat FROM stops WHERE id = :id"
                ),
                {"id": stop.id},
            )
            .mappings()
            .one()
        )
        stop.country_id, stop.subdivision_id, stop.city_id = _resolve_place(
            session,
            location,
            fields.get("visit_type", stop.visit_type),
            city_id=fields.get("city_id"),
            city_given="city_id" in fields,
        )
        stop.location = point(location)

    for name in ("place_name", "visit_type", "arrived_on", "departed_on", "note"):
        if name in fields:
            setattr(stop, name, fields[name])
    session.flush()
    return stop


def delete_stop(session: Session, storage: StorageBackend, user: User, stop_id: uuid.UUID) -> None:
    stop = owned_stop(session, user, stop_id)
    purge_photos(session, storage, photos_of_stops(select(Stop.id).where(Stop.id == stop.id)))
    trip_id = stop.trip_id
    session.delete(stop)
    session.flush()
    _renumber(_stops_of(session, trip_id))
    session.flush()


def reorder_stops(
    session: Session, user: User, trip_id: uuid.UUID, stop_ids: list[uuid.UUID]
) -> None:
    trip = owned_trip(session, user, trip_id)
    stops = {s.id: s for s in _stops_of(session, trip.id)}
    if len(stop_ids) != len(stops) or set(stop_ids) != set(stops):
        raise InvalidError("stop_ids debe traer todas las paradas del viaje, una vez cada una")
    _renumber([stops[i] for i in stop_ids])
    session.flush()
