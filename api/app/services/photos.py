"""Fotos: claves de almacenamiento y borrado de archivos junto con sus filas.

Los archivos se borran solo después del commit: si la transacción falla, las fotos siguen.
"""

import uuid

from sqlalchemy import delete, event, select
from sqlalchemy.orm import Session
from sqlalchemy.sql import Select

from app.errors import NotFoundError
from app.models import Memory, Photo, Stop, User
from app.storage import StorageBackend

VARIANTS = ("original", "display", "thumb")
_PENDING = "huella_files_to_delete"


def user_prefix(user_id: uuid.UUID) -> str:
    return f"users/{user_id}"


def photo_prefix(user_id: uuid.UUID, photo_id: uuid.UUID) -> str:
    return f"{user_prefix(user_id)}/photos/{photo_id}"


def variant_key(storage_key: str, variant: str) -> str:
    return f"{storage_key}/{variant}.jpg"


def owned_photo(session: Session, user: User, photo_id: uuid.UUID) -> Photo:
    photo = session.get(Photo, photo_id)
    if photo is None or photo.user_id != user.id:
        raise NotFoundError("Foto no encontrada")
    return photo


def delete_files_after_commit(session: Session, storage: StorageBackend, prefix: str) -> None:
    session.info.setdefault(_PENDING, []).append((storage, prefix))


@event.listens_for(Session, "after_commit")
def _delete_pending_files(session: Session) -> None:
    for storage, prefix in session.info.pop(_PENDING, []):
        storage.delete_prefix(prefix)


@event.listens_for(Session, "after_rollback")
def _forget_pending_files(session: Session) -> None:
    session.info.pop(_PENDING, None)


def purge_photos(session: Session, storage: StorageBackend, photo_ids: Select) -> None:
    """Borra las filas de `photo_ids` (un SELECT de Photo.id) y, tras el commit, sus archivos."""
    rows = session.execute(select(Photo.id, Photo.storage_key).where(Photo.id.in_(photo_ids))).all()
    if not rows:
        return
    session.execute(delete(Photo).where(Photo.id.in_([r.id for r in rows])))
    for row in rows:
        delete_files_after_commit(session, storage, row.storage_key)


def photos_of_memories(memory_ids: Select) -> Select:
    return select(Photo.id).where(Photo.memory_id.in_(memory_ids))


def photos_of_stops(stop_ids: Select) -> Select:
    return photos_of_memories(select(Memory.id).where(Memory.stop_id.in_(stop_ids)))


def photos_of_trip(trip_id: uuid.UUID) -> Select:
    return photos_of_stops(select(Stop.id).where(Stop.trip_id == trip_id))
