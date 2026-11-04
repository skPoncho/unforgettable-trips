"""Recuerdos: viven siempre en una parada de un viaje."""

import uuid
from datetime import date
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.errors import InvalidError, NotFoundError
from app.models import Memory, Monument, Stop, Trip, User, Visibility
from app.schemas import (
    LitPlaces,
    MemoryIn,
    MemoryOut,
    MemoryPatch,
    MonumentBrief,
    PlaceIn,
    StopIn,
    TripIn,
)
from app.services.photos import owned_photos, photos_of_memories, purge_photos
from app.services.trips import add_stop, create_trip, owned_stop, owned_trip, stop_for_place
from app.storage import StorageBackend

MONTHS_ES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")

_MEMORIES_SQL = """
SELECT m.id, s.trip_id, m.stop_id, m.body, m.occurred_on, m.visibility,
       effective_visibility(t.visibility, m.visibility) AS effective_visibility,
       mo.id AS monument_id, mo.slug AS monument_slug, mo.name_es AS monument_name,
       mo.stamp_code AS monument_stamp,
       (SELECT count(*) FROM photos p WHERE p.memory_id = m.id) AS photo_count,
       m.created_at, m.updated_at
FROM memories m
JOIN stops s ON s.id = m.stop_id
JOIN trips t ON t.id = s.trip_id
LEFT JOIN monuments mo ON mo.id = m.monument_id
WHERE m.user_id = :uid
  AND (CAST(:memory_id AS uuid) IS NULL OR m.id = CAST(:memory_id AS uuid))
  AND (CAST(:trip_id AS uuid) IS NULL OR s.trip_id = CAST(:trip_id AS uuid))
  AND (CAST(:stop_id AS uuid) IS NULL OR m.stop_id = CAST(:stop_id AS uuid))
ORDER BY s.trip_id, s.position, m.occurred_on NULLS LAST, m.created_at
"""


def auto_trip_title(place_name: str, on: date) -> str:
    """Título del viaje automático: "Kioto · mar 2025"."""
    return f"{place_name} · {MONTHS_ES[on.month - 1]} {on.year}"


def _check_visibility(memory: Visibility | None, trip: Visibility) -> None:
    if memory is not None and memory.rank > trip.rank:
        raise InvalidError("Un recuerdo no puede ser más abierto que su viaje")


def _check_monument(session: Session, monument_id: int | None) -> None:
    if monument_id is not None and session.get(Monument, monument_id) is None:
        raise InvalidError(f"Monumento desconocido: {monument_id}")


def _memory_out(row: dict[str, Any]) -> MemoryOut:
    monument = (
        MonumentBrief(
            id=row["monument_id"],
            slug=row["monument_slug"],
            name_es=row["monument_name"],
            stamp_code=row["monument_stamp"],
        )
        if row["monument_id"]
        else None
    )
    fields = {k: v for k, v in row.items() if not k.startswith("monument_")}
    return MemoryOut(**fields, monument=monument)


def list_memories(
    session: Session,
    user: User,
    *,
    memory_id: uuid.UUID | None = None,
    trip_id: uuid.UUID | None = None,
    stop_id: uuid.UUID | None = None,
) -> list[MemoryOut]:
    rows = session.execute(
        text(_MEMORIES_SQL),
        {"uid": user.id, "memory_id": memory_id, "trip_id": trip_id, "stop_id": stop_id},
    ).mappings()
    return [_memory_out(dict(r)) for r in rows]


def memory_detail(session: Session, user: User, memory_id: uuid.UUID) -> MemoryOut:
    found = list_memories(session, user, memory_id=memory_id)
    if not found:
        raise NotFoundError("Recuerdo no encontrado")
    return found[0]


def owned_memory(session: Session, user: User, memory_id: uuid.UUID) -> Memory:
    memory = session.get(Memory, memory_id)
    if memory is None or memory.user_id != user.id:
        raise NotFoundError("Recuerdo no encontrado")
    return memory


def _create_auto_trip(
    session: Session, user: User, place: PlaceIn, visibility: Visibility | None
) -> Stop:
    """Viaje de una parada para un recuerdo suelto; se podrá renombrar o fusionar."""
    trip = create_trip(
        session,
        user,
        TripIn(
            title=auto_trip_title(place.place_name, place.arrived_on),
            visibility=visibility or Visibility.private,
        ),
        is_auto=True,
    )
    stop_in = StopIn(**place.model_dump(exclude_unset=True))
    return add_stop(session, user, trip.id, stop_in)


# Estado de cada país, estado y ciudad del usuario (las mismas vistas que el mapa).
_STATUS_SQL = """
SELECT 'country' AS kind, c.iso3::text AS key, u.status
FROM user_country_status u JOIN countries c ON c.id = u.country_id WHERE u.user_id = :uid
UNION ALL
SELECT 'subdivision', sd.code, u.status
FROM user_subdivision_status u JOIN subdivisions sd ON sd.id = u.subdivision_id
WHERE u.user_id = :uid
UNION ALL
SELECT 'city', u.city_id::text, u.status FROM user_city_status u WHERE u.user_id = :uid
"""


def _statuses(session: Session, user: User) -> dict[tuple[str, str], str]:
    rows = session.execute(text(_STATUS_SQL), {"uid": user.id})
    return {(r.kind, r.key): r.status for r in rows}


def _lit(before: dict[tuple[str, str], str], after: dict[tuple[str, str], str]) -> LitPlaces:
    """Lo nuevo y lo que pasó de escala a visitado."""
    changed = [key for key, status in after.items() if before.get(key) != status]
    return LitPlaces(
        countries=sorted(k for kind, k in changed if kind == "country"),
        subdivisions=sorted(k for kind, k in changed if kind == "subdivision"),
        cities=sorted(int(k) for kind, k in changed if kind == "city"),
    )


def _attach_photos(session: Session, user: User, memory: Memory, photo_ids: list) -> None:
    photos = owned_photos(session, user, photo_ids)
    for position, photo in enumerate(photos):
        if photo.memory_id is not None and photo.memory_id != memory.id:
            raise InvalidError("Una de las fotos ya está en otro recuerdo")
        photo.memory_id = memory.id
        photo.position = position
    if memory.occurred_on is None:
        days = [p.taken_on for p in photos if p.taken_on is not None]
        memory.occurred_on = min(days) if days else None


def create_memory(session: Session, user: User, data: MemoryIn) -> tuple[Memory, LitPlaces]:
    """Crea el recuerdo con sus fotos. Devuelve también lo que se encendió en el mapa."""
    _check_monument(session, data.monument_id)
    before = _statuses(session, user)
    if data.stop_id is not None:
        stop = owned_stop(session, user, data.stop_id)
        _check_visibility(data.visibility, session.get(Trip, stop.trip_id).visibility)
        visibility = data.visibility
    elif data.trip_id is not None:
        assert data.place is not None
        trip = owned_trip(session, user, data.trip_id)
        _check_visibility(data.visibility, trip.visibility)
        stop = stop_for_place(session, user, trip.id, data.place)
        visibility = data.visibility
    else:
        assert data.place is not None
        stop = _create_auto_trip(session, user, data.place, data.visibility)
        # El viaje automático ya tiene la visibilidad pedida; el recuerdo la hereda.
        visibility = None

    memory = Memory(
        user_id=user.id,
        stop_id=stop.id,
        monument_id=data.monument_id,
        body=data.body,
        occurred_on=data.occurred_on,
        visibility=visibility,
    )
    session.add(memory)
    session.flush()
    if data.photo_ids:
        _attach_photos(session, user, memory, data.photo_ids)
        session.flush()
    return memory, _lit(before, _statuses(session, user))


def update_memory(session: Session, user: User, memory_id: uuid.UUID, patch: MemoryPatch) -> Memory:
    memory = owned_memory(session, user, memory_id)
    fields = patch.model_dump(exclude_unset=True)
    if "stop_id" in fields:
        if fields["stop_id"] is None:
            raise InvalidError("stop_id no puede ser nulo")
        owned_stop(session, user, fields["stop_id"])
    if "body" in fields and fields["body"] is None:
        fields["body"] = ""
    if "monument_id" in fields:
        _check_monument(session, fields["monument_id"])

    stop = session.get(Stop, fields.get("stop_id", memory.stop_id))
    trip = session.get(Trip, stop.trip_id)
    _check_visibility(fields.get("visibility", memory.visibility), trip.visibility)

    for name, value in fields.items():
        setattr(memory, name, value)
    session.flush()
    return memory


def delete_memory(
    session: Session, storage: StorageBackend, user: User, memory_id: uuid.UUID
) -> None:
    memory = owned_memory(session, user, memory_id)
    purge_photos(
        session, storage, photos_of_memories(select(Memory.id).where(Memory.id == memory.id))
    )
    session.delete(memory)
    session.flush()
