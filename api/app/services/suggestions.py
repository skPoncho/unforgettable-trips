"""Sugerencias para un recuerdo nuevo a partir de sus fotos: lugar, fechas, monumentos y viaje.

El usuario siempre puede corregirlas; aquí no se guarda nada.
"""

import statistics
from datetime import date

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.geo.locate import locate
from app.models import Photo, User
from app.schemas import (
    CityBrief,
    CountryBrief,
    LonLat,
    MemorySuggestion,
    SubdivisionBrief,
    SuggestedMonument,
    SuggestedPlace,
    SuggestedTrip,
    SuggestIn,
)
from app.services.photos import owned_photos

# Monumentos sugeridos: a menos de esta distancia de alguna foto (o del lugar elegido).
MONUMENT_RADIUS_M = 5_000
MAX_MONUMENTS = 5

_MONUMENTS_SQL = """
SELECT mo.id, mo.slug, mo.name_es, mo.stamp_code,
       min(ST_Distance(mo.location::geography, pt.geom::geography)) / 1000 AS distance_km
FROM monuments mo
JOIN (SELECT ST_SetSRID(ST_MakePoint(lon, lat), 4326) AS geom
      FROM unnest(CAST(:lons AS float8[]), CAST(:lats AS float8[])) AS u(lon, lat)) pt
  ON ST_DWithin(mo.location::geography, pt.geom::geography, :radius)
GROUP BY mo.id
ORDER BY distance_km, mo.name_es
LIMIT :limit
"""

# Mismo criterio que trips.matching_stop para la parada de la ciudad.
_TRIPS_SQL = """
SELECT * FROM (
    SELECT t.id, t.title, t.visibility, t.is_auto,
           min(s.arrived_on) AS starts_on, max(s.departed_on) AS ends_on,
           (array_agg(s.id ORDER BY s.position) FILTER (
               WHERE s.city_id = CAST(:city_id AS integer)
                 AND s.arrived_on <= :to AND s.departed_on >= :from
           ))[1] AS stop_id
    FROM trips t JOIN stops s ON s.trip_id = t.id
    WHERE t.user_id = :uid
    GROUP BY t.id
    HAVING min(s.arrived_on) <= :to AND max(s.departed_on) >= :from
) found
ORDER BY stop_id IS NULL, starts_on DESC
"""


def _place(session: Session, location: LonLat) -> SuggestedPlace | None:
    found = locate(session, lon=location.lon, lat=location.lat)
    if found is None:
        return None
    city = CityBrief(id=found.city.id, name_es=found.city.name_es) if found.city else None
    subdivision = (
        SubdivisionBrief(code=found.subdivision.code, name_es=found.subdivision.name_es)
        if found.subdivision
        else None
    )
    name = city.name_es if city else subdivision.name_es if subdivision else found.country.name_es
    return SuggestedPlace(
        place_name=name,
        location=location,
        city=city,
        subdivision=subdivision,
        country=CountryBrief(iso3=found.country.iso3, name_es=found.country.name_es),
    )


def _monuments(session: Session, points: list[LonLat]) -> list[SuggestedMonument]:
    if not points:
        return []
    rows = session.execute(
        text(_MONUMENTS_SQL),
        {
            "lons": [p.lon for p in points],
            "lats": [p.lat for p in points],
            "radius": MONUMENT_RADIUS_M,
            "limit": MAX_MONUMENTS,
        },
    ).mappings()
    return [SuggestedMonument(**r) for r in rows]


def _trips(
    session: Session, user: User, city_id: int | None, first: date, last: date
) -> list[SuggestedTrip]:
    rows = session.execute(
        text(_TRIPS_SQL), {"uid": user.id, "city_id": city_id, "from": first, "to": last}
    ).mappings()
    return [SuggestedTrip(**r) for r in rows]


def suggest(session: Session, user: User, data: SuggestIn) -> MemorySuggestion:
    photos = owned_photos(session, user, data.photo_ids)
    ids = [p.id for p in photos]
    located = (
        [
            LonLat(lon=lon, lat=lat)
            for lon, lat in session.execute(
                select(func.ST_X(Photo.location), func.ST_Y(Photo.location)).where(
                    Photo.id.in_(ids), Photo.location.is_not(None)
                )
            )
        ]
        if ids
        else []
    )

    # El centro es la mediana: una foto suelta del aeropuerto no mueve el lugar.
    if data.location is not None:
        center, points = data.location, [data.location]
    elif located:
        center = LonLat(
            lon=statistics.median(p.lon for p in located),
            lat=statistics.median(p.lat for p in located),
        )
        points = located
    else:
        center, points = None, []
    place = _place(session, center) if center is not None else None

    days = sorted(p.taken_on for p in photos if p.taken_on is not None)
    arrived_on = data.arrived_on or (days[0] if days else None)
    departed_on = data.departed_on or (days[-1] if days else arrived_on)
    if arrived_on and departed_on and departed_on < arrived_on:
        departed_on = arrived_on

    trips = []
    if arrived_on and departed_on:
        city_id = place.city.id if place and place.city else None
        trips = _trips(session, user, city_id, arrived_on, departed_on)

    return MemorySuggestion(
        photo_count=len(photos),
        located_count=len(located),
        place=place,
        arrived_on=arrived_on,
        departed_on=departed_on,
        monuments=_monuments(session, points),
        trips=trips,
    )
