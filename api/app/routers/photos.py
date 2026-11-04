"""Fotos del usuario actual: /api/photos."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, File, Response, UploadFile, status
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.deps import CurrentUserDep, SessionDep, StorageDep
from app.errors import InvalidError, NotFoundError
from app.schemas import PhotoUploadOut, UploadedPhoto, UploadError
from app.services import photos
from app.services.images import ImageError

router = APIRouter(prefix="/api/photos", tags=["photos"])


def _megabytes(size: int) -> str:
    return f"{size / (1024 * 1024):.0f} MB"


@router.post("", response_model=PhotoUploadOut, status_code=status.HTTP_201_CREATED)
def upload_photos(
    files: Annotated[list[UploadFile], File(description="JPG, PNG o HEIC")],
    session: SessionDep,
    storage: StorageDep,
    user: CurrentUserDep,
) -> PhotoUploadOut:
    """Sube fotos todavía sin recuerdo; se ligan a uno al guardarlo (`POST /api/memories`).

    Cada archivo se valida aparte: los rechazados van en `errors` y los demás se suben.
    Se leen la fecha y el GPS del EXIF. Las fotos sin recuerdo de más de 24 h se borran.
    """
    settings = get_settings()
    if len(files) > settings.max_photos_per_upload:
        raise InvalidError(f"Máximo {settings.max_photos_per_upload} fotos por subida")

    photos.purge_orphans(session, storage, user)
    uploads: list[tuple[str, photos.Upload]] = []
    errors: list[UploadError] = []
    for file in files:
        filename = file.filename or "foto"
        data = file.file.read(settings.max_photo_bytes + 1)
        if len(data) > settings.max_photo_bytes:
            detail = f"Pesa más de {_megabytes(settings.max_photo_bytes)}"
            errors.append(UploadError(filename=filename, detail=detail))
            continue
        try:
            uploads.append((filename, photos.upload_photo(session, storage, user, data)))
        except ImageError as error:
            errors.append(UploadError(filename=filename, detail=error.detail))
    session.commit()

    out = {p.id: p for p in photos.photos_out(session, user, [u.photo_id for _, u in uploads])}
    return PhotoUploadOut(
        photos=[
            UploadedPhoto(
                **out[upload.photo_id].model_dump(),
                filename=filename,
                duplicate=upload.duplicate,
            )
            for filename, upload in uploads
        ],
        errors=errors,
    )


@router.delete(
    "/{photo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "No existe o no es tuya"}},
)
def delete_photo(
    photo_id: uuid.UUID, session: SessionDep, storage: StorageDep, user: CurrentUserDep
) -> Response:
    """Borra una foto tuya y sus archivos (p. ej. al quitarla antes de guardar el recuerdo)."""
    photos.delete_photo(session, storage, user, photo_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
