"""Detalle de viaje (pantalla 2): paradas con recuerdos y fotos, ruta y lugar en tu historia."""

import uuid
from collections import defaultdict

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import User
from app.schemas import TripDetailOut, TripMemoryOut, TripPhoto, TripStopOut
from app.services.memories import list_memories
from app.services.trips import list_stops, trip_summary

# Longitud geodésica de la línea que une las estancias en orden. Las escalas no cuentan:
# la ruta es la del mapa regional (una escala en Panamá sumaría 13 000 km a Japón).
_ROUTE_SQL = """
SELECT CASE WHEN count(*) > 1
            THEN ST_Length(ST_MakeLine(location ORDER BY position)::geography) / 1000
            ELSE 0 END AS km
FROM stops
WHERE user_id = :uid AND trip_id = :trip_id AND visit_type = 'stay'
"""

# Lugar del viaje entre todos los tuyos, del más antiguo al más reciente.
_NUMBER_SQL = """
SELECT n, total FROM (
    SELECT t.id,
           row_number() OVER (ORDER BY st.starts_on NULLS LAST, t.created_at, t.id) AS n,
           count(*) OVER () AS total
    FROM trips t
    LEFT JOIN (
        SELECT trip_id, min(arrived_on) AS starts_on FROM stops
        WHERE user_id = :uid GROUP BY trip_id
    ) st ON st.trip_id = t.id
    WHERE t.user_id = :uid
) ranked
WHERE id = :trip_id
"""

_CONTINENT_SQL = """
SELECT c.continent::text FROM stops s JOIN countries c ON c.id = s.country_id
WHERE s.user_id = :uid AND s.trip_id = :trip_id
ORDER BY (s.visit_type = 'stay') DESC, s.position
LIMIT 1
"""

_PHOTOS_SQL = """
SELECT p.id, p.memory_id, p.width, p.height
FROM photos p JOIN memories m ON m.id = p.memory_id JOIN stops s ON s.id = m.stop_id
WHERE p.user_id = :uid AND s.trip_id = :trip_id
ORDER BY p.memory_id, p.position, p.created_at
"""


def trip_detail(session: Session, user: User, trip_id: uuid.UUID) -> TripDetailOut:
    summary = trip_summary(session, user, trip_id)  # 404 si no es tuyo
    params = {"uid": user.id, "trip_id": trip_id}

    photos: dict[uuid.UUID, list[TripPhoto]] = defaultdict(list)
    for row in session.execute(text(_PHOTOS_SQL), params).mappings():
        photos[row["memory_id"]].append(
            TripPhoto(id=row["id"], width=row["width"], height=row["height"])
        )
    memories: dict[uuid.UUID, list[TripMemoryOut]] = defaultdict(list)
    for memory in list_memories(session, user, trip_id=trip_id):
        memories[memory.stop_id].append(
            TripMemoryOut(**memory.model_dump(), photos=photos[memory.id])
        )
    stops = [
        TripStopOut(**stop.model_dump(), memories=memories[stop.id])
        for stop in list_stops(session, user, trip_id=trip_id)
    ]

    number = session.execute(text(_NUMBER_SQL), params).mappings().one()
    return TripDetailOut(
        **summary.model_dump(),
        stops=stops,
        route_km=round(session.scalar(text(_ROUTE_SQL), params) or 0, 1),
        trip_number=number["n"],
        trip_total=number["total"],
        continent=session.scalar(text(_CONTINENT_SQL), params),
    )
