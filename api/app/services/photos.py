"""Fotos: subida, claves de almacenamiento y borrado de archivos junto con sus filas.

Los archivos se borran solo después del commit: si la transacción falla, las fotos siguen.
Los que se escriben durante una transacción que después falla se borran al hacer rollback.
"""

import uuid
from dataclasses import dataclass
from datetime import timedelta

from geoalchemy2 import WKTElement
from sqlalchemy import delete, event, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from sqlalchemy.sql import Select

from app.errors import NotFoundError
from app.models import Memory, Photo, Stop, User
from app.schemas import LonLat, PhotoOut
from app.services.images import process_upload
from app.storage import StorageBackend

VARIANTS = ("original", "display", "thumb")
# Las fotos que nunca llegaron a un recuerdo se borran pasado este tiempo.
ORPHAN_TTL = timedelta(hours=24)
_PENDING = "huella_files_to_delete"
_CREATED = "huella_files_created"


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


def _save_files(
    session: Session, storage: StorageBackend, prefix: str, files: dict[str, bytes]
) -> None:
    """Escribe archivos que se borrarán solos si la transacción no llega al commit."""
    session.info.setdefault(_CREATED, []).append((storage, prefix))
    for variant, data in files.items():
        storage.save(variant_key(prefix, variant), data, "image/jpeg")


@event.listens_for(Session, "after_commit")
def _delete_pending_files(session: Session) -> None:
    session.info.pop(_CREATED, None)
    for storage, prefix in session.info.pop(_PENDING, []):
        storage.delete_prefix(prefix)


@event.listens_for(Session, "after_rollback")
def _forget_pending_files(session: Session) -> None:
    session.info.pop(_PENDING, None)
    for storage, prefix in session.info.pop(_CREATED, []):
        storage.delete_prefix(prefix)


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


# --- Lectura ----------------------------------------------------------------------------


def photos_out(session: Session, user: User, photo_ids: list[uuid.UUID]) -> list[PhotoOut]:
    """Fotos del usuario en el orden pedido (las que no son suyas no aparecen)."""
    if not photo_ids:
        return []
    rows = session.execute(
        select(
            Photo,
            func.ST_X(Photo.location).label("lon"),
            func.ST_Y(Photo.location).label("lat"),
        ).where(Photo.user_id == user.id, Photo.id.in_(photo_ids))
    ).all()
    by_id = {
        row.Photo.id: PhotoOut(
            id=row.Photo.id,
            memory_id=row.Photo.memory_id,
            position=row.Photo.position,
            width=row.Photo.width,
            height=row.Photo.height,
            taken_at=row.Photo.taken_at,
            taken_on=row.Photo.taken_on,
            location=LonLat(lon=row.lon, lat=row.lat) if row.lon is not None else None,
        )
        for row in rows
    }
    return [by_id[photo_id] for photo_id in photo_ids if photo_id in by_id]


def owned_photos(session: Session, user: User, photo_ids: list[uuid.UUID]) -> list[Photo]:
    """Las fotos pedidas, en orden. 404 si alguna no existe o no es tuya."""
    found = {
        p.id: p
        for p in session.scalars(
            select(Photo).where(Photo.user_id == user.id, Photo.id.in_(photo_ids))
        )
    }
    missing = [photo_id for photo_id in photo_ids if photo_id not in found]
    if missing:
        raise NotFoundError("Foto no encontrada")
    return [found[photo_id] for photo_id in photo_ids]


# --- Subida -----------------------------------------------------------------------------


@dataclass(frozen=True)
class Upload:
    photo_id: uuid.UUID
    duplicate: bool


def _same_photo(session: Session, user: User, sha256: str) -> uuid.UUID | None:
    return session.scalar(select(Photo.id).where(Photo.user_id == user.id, Photo.sha256 == sha256))


def upload_photo(session: Session, storage: StorageBackend, user: User, data: bytes) -> Upload:
    """Procesa y guarda una foto sin recuerdo. ImageError si no es una imagen aceptada.

    Si ya la habías subido (mismo sha256), devuelve la existente sin guardar otra copia.
    """
    processed = process_upload(data)
    existing = _same_photo(session, user, processed.sha256)
    if existing is not None:
        return Upload(existing, duplicate=True)

    photo_id = uuid.uuid4()
    prefix = photo_prefix(user.id, photo_id)
    location = (
        WKTElement(f"POINT({processed.lon} {processed.lat})", srid=4326)
        if processed.lon is not None
        else None
    )
    # ON CONFLICT: otra petición pudo subir la misma foto al mismo tiempo.
    inserted = session.scalar(
        insert(Photo)
        .values(
            id=photo_id,
            user_id=user.id,
            position=0,
            storage_key=prefix,
            mime="image/jpeg",
            width=processed.width,
            height=processed.height,
            bytes=len(processed.original),
            sha256=processed.sha256,
            taken_at=processed.taken_at,
            taken_on=processed.taken_on,
            location=location,
        )
        .on_conflict_do_nothing(constraint="uq_photos_user_sha256")
        .returning(Photo.id)
    )
    if inserted is None:
        return Upload(_same_photo(session, user, processed.sha256), duplicate=True)
    _save_files(
        session,
        storage,
        prefix,
        {
            "original": processed.original,
            "display": processed.display,
            "thumb": processed.thumb,
        },
    )
    return Upload(photo_id, duplicate=False)


def purge_orphans(session: Session, storage: StorageBackend, user: User) -> None:
    """Borra las fotos del usuario que llevan más de 24 h sin recuerdo."""
    purge_photos(
        session,
        storage,
        select(Photo.id).where(
            Photo.user_id == user.id,
            Photo.memory_id.is_(None),
            Photo.created_at < func.now() - ORPHAN_TTL,
        ),
    )


def delete_photo(
    session: Session, storage: StorageBackend, user: User, photo_id: uuid.UUID
) -> None:
    photo = owned_photo(session, user, photo_id)
    purge_photos(session, storage, select(Photo.id).where(Photo.id == photo.id))
