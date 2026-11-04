"""Fotos del usuario actual: /api/photos (solo lectura; la subida llega en la fase 4)."""

import uuid
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.deps import CurrentUserDep, SessionDep, StorageDep
from app.errors import NotFoundError
from app.services import photos

router = APIRouter(prefix="/api/photos", tags=["photos"])

# El original guarda el EXIF (fecha y GPS); aquí solo se sirven las variantes sin metadatos.
Variant = Literal["display", "thumb"]


@router.get(
    "/{photo_id}/{variant}",
    response_class=StreamingResponse,
    responses={
        200: {"content": {"image/jpeg": {}}, "description": "La imagen"},
        404: {"description": "No existe o no es tuya"},
    },
)
def get_photo(
    photo_id: uuid.UUID,
    variant: Variant,
    session: SessionDep,
    storage: StorageDep,
    user: CurrentUserDep,
) -> StreamingResponse:
    """Variante `display` (para ver) o `thumb` (miniatura) de una foto tuya."""
    photo = photos.owned_photo(session, user, photo_id)
    try:
        file = storage.open(photos.variant_key(photo.storage_key, variant))
    except FileNotFoundError as missing:
        raise NotFoundError("Foto no encontrada") from missing
    # El contenido de una foto no cambia: se puede guardar en caché, pero solo en el navegador.
    return StreamingResponse(
        file,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )
