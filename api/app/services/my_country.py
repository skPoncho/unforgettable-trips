"""Mi país: estados, ciudades y pasaporte de monumentos de un país.

Lo que cuenta como visitado sale de las vistas user_subdivision_status y user_city_status, y
los sellos de user_stamps (migraciones 0004 y 0005); aquí solo se agrupa y se ordena.
"""

import unicodedata
from collections import defaultdict

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.errors import NotFoundError
from app.models import Country, User
from app.schemas import (
    CityOverview,
    LonLat,
    PassportOut,
    PassportStamp,
    StampTrip,
    SubdivisionOverview,
    SuggestedStamp,
)

# Cuántos sugeridos muestra el pasaporte.
MAX_SUGGESTED = 4


def _sort_key(name: str) -> str:
    """Orden alfabético en español sin depender de la collation de la BD (Á junto a A)."""
    return unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()


def _country_id(session: Session, iso3: str) -> int:
    country_id = session.scalar(select(Country.id).where(Country.iso3 == iso3.upper()))
    if country_id is None:
        raise NotFoundError(f"País desconocido: {iso3}")
    return country_id


def subdivisions(session: Session, user: User, iso3: str) -> list[SubdivisionOverview]:
    """Todos los estados del país, visitados o no (vacío si el país no tiene estados)."""
    rows = session.execute(
        text(
            """
            SELECT sd.code, sd.name_es, uss.status,
                   COALESCE(uss.is_home, false) AS is_home, uss.first_visited_on
            FROM subdivisions sd
            LEFT JOIN user_subdivision_status uss
                   ON uss.subdivision_id = sd.id AND uss.user_id = :uid
            WHERE sd.country_id = :cid
            """
        ),
        {"uid": user.id, "cid": _country_id(session, iso3)},
    ).mappings()
    return sorted((SubdivisionOverview(**r) for r in rows), key=lambda s: _sort_key(s.name_es))


def cities(session: Session, user: User, iso3: str) -> list[CityOverview]:
    """Ciudades visitadas del país: la casa primero y después las de más viajes."""
    rows = session.execute(
        text(
            """
            SELECT ci.id, ci.name_es, sd.code AS subdivision_code,
                   sd.name_es AS subdivision_name, ucs.status, ucs.is_home,
                   count(DISTINCT s.trip_id) AS trips, max(s.arrived_on) AS last_visited_on
            FROM user_city_status ucs
            JOIN cities ci ON ci.id = ucs.city_id
            LEFT JOIN subdivisions sd ON sd.id = ci.subdivision_id
            LEFT JOIN stops s ON s.user_id = ucs.user_id AND s.city_id = ucs.city_id
            WHERE ucs.user_id = :uid AND ucs.country_id = :cid
            GROUP BY ci.id, sd.id, ucs.status, ucs.is_home
            """
        ),
        {"uid": user.id, "cid": _country_id(session, iso3)},
    ).mappings()
    result = [CityOverview(**r) for r in rows]
    result.sort(key=lambda c: _sort_key(c.name_es))
    result.sort(
        key=lambda c: c.last_visited_on.toordinal() if c.last_visited_on else 0, reverse=True
    )
    result.sort(key=lambda c: (not c.is_home, -c.trips))
    return result


# Recuerdos del usuario ligados a un monumento, con la fecha que cuenta para el sello.
_STAMPED_MEMORIES = """
    WITH mm AS (
        SELECT m.id AS memory_id, m.monument_id, m.created_at, s.id AS stop_id, s.trip_id,
               COALESCE(m.occurred_on, s.arrived_on) AS on_date
        FROM memories m JOIN stops s ON s.id = m.stop_id
        WHERE m.user_id = :uid AND m.monument_id IS NOT NULL
    )
"""

_MONUMENT_COLS = """
    mo.id, mo.slug, mo.name_es, mo.stamp_code, mo.kind,
    sd.code AS subdivision_code, sd.name_es AS subdivision_name,
    ST_X(mo.location) AS lon, ST_Y(mo.location) AS lat
"""

_STAMPS_SQL = (
    _STAMPED_MEMORIES
    + f"""
    , first_mm AS (
        SELECT DISTINCT ON (monument_id) * FROM mm
        ORDER BY monument_id, on_date, created_at, memory_id
    ), stay_numbers AS (
        SELECT id, row_number() OVER (PARTITION BY trip_id ORDER BY position) AS n
        FROM stops WHERE user_id = :uid AND visit_type = 'stay'
    )
    SELECT {_MONUMENT_COLS},
           us.first_stamped_on, us.memories,
           t.id AS trip_id, t.title AS trip_title, sn.n AS stop_number,
           (SELECT count(*) FROM photos p JOIN mm ON mm.memory_id = p.memory_id
            WHERE mm.monument_id = mo.id) AS photo_count
    FROM user_stamps us
    JOIN monuments mo ON mo.id = us.monument_id
    LEFT JOIN subdivisions sd ON sd.id = mo.subdivision_id
    JOIN first_mm f ON f.monument_id = mo.id
    JOIN trips t ON t.id = f.trip_id
    LEFT JOIN stay_numbers sn ON sn.id = f.stop_id
    WHERE us.user_id = :uid AND mo.country_id = :cid
    ORDER BY us.first_stamped_on, mo.name_es
    """
)

_STAMP_PHOTOS_SQL = (
    _STAMPED_MEMORIES
    + """
    SELECT monument_id, id FROM (
        SELECT mm.monument_id, p.id,
               row_number() OVER (
                   PARTITION BY mm.monument_id
                   ORDER BY mm.on_date, mm.created_at, mm.memory_id, p.position, p.created_at
               ) AS n
        FROM photos p JOIN mm ON mm.memory_id = p.memory_id
        JOIN monuments mo ON mo.id = mm.monument_id
        WHERE mo.country_id = :cid
    ) ranked
    WHERE n <= 3 ORDER BY monument_id, n
    """
)

# Sin sellar, por distancia a la parada (o casa) más cercana; uno por estado para que no
# salgan los cuatro en la misma ciudad.
_SUGGESTED_SQL = f"""
    WITH points AS (
        SELECT place_name AS name, location FROM stops WHERE user_id = :uid
        UNION ALL
        SELECT ci.name_es, ci.location FROM users u JOIN cities ci ON ci.id = u.home_city_id
        WHERE u.id = :uid
    ), candidates AS (
        SELECT {_MONUMENT_COLS}, mo.subdivision_id, near.name AS near, near.distance_m
        FROM monuments mo
        LEFT JOIN subdivisions sd ON sd.id = mo.subdivision_id
        CROSS JOIN LATERAL (
            SELECT p.name,
                   ST_Distance(p.location::geography, mo.location::geography) AS distance_m
            FROM points p ORDER BY 2 LIMIT 1
        ) near
        WHERE mo.country_id = :cid
          AND NOT EXISTS (SELECT 1 FROM user_stamps us
                          WHERE us.user_id = :uid AND us.monument_id = mo.id)
    ), per_state AS (
        SELECT DISTINCT ON (COALESCE(subdivision_id, -id)) * FROM candidates
        ORDER BY COALESCE(subdivision_id, -id), distance_m, slug
    )
    SELECT * FROM per_state ORDER BY distance_m, slug LIMIT :limit
"""


def _location(row: dict) -> LonLat:
    return LonLat(lon=row.pop("lon"), lat=row.pop("lat"))


def passport(session: Session, user: User, iso3: str) -> PassportOut:
    params = {"uid": user.id, "cid": _country_id(session, iso3)}

    photos: dict[int, list] = defaultdict(list)
    for monument_id, photo_id in session.execute(text(_STAMP_PHOTOS_SQL), params):
        photos[monument_id].append(photo_id)

    stamps = []
    for row in session.execute(text(_STAMPS_SQL), params).mappings():
        data = dict(row)
        location = _location(data)
        trip = StampTrip(
            id=data.pop("trip_id"),
            title=data.pop("trip_title"),
            stop_number=data.pop("stop_number"),
        )
        stamps.append(
            PassportStamp(**data, location=location, trip=trip, photo_ids=photos[data["id"]])
        )

    suggested = []
    for row in session.execute(text(_SUGGESTED_SQL), {**params, "limit": MAX_SUGGESTED}).mappings():
        data = dict(row)
        location = _location(data)
        data.pop("subdivision_id")
        distance_m = data.pop("distance_m")
        suggested.append(
            SuggestedStamp(**data, location=location, distance_km=round(distance_m / 1000, 1))
        )

    return PassportOut(country_iso3=iso3.upper(), stamps=stamps, suggested=suggested)
