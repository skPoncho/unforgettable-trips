"""Procesamiento de fotos subidas: validación, EXIF (fecha y GPS) y variantes sin metadatos.

- Se acepta JPG, PNG y HEIC/HEIF; el tipo se decide por el contenido, no por la extensión.
- El original se guarda como JPEG con su EXIF (HEIC y PNG se convierten). Solo lo ve su dueño
  y la API nunca lo sirve.
- `display` (2048 px) y `thumb` (400 px) salen enderezadas, en sRGB y sin ningún metadato.
"""

import hashlib
import io
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, timezone

from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from app.errors import InvalidError

register_heif_opener()

# Límite de píxeles para no abrir "bombas" de descompresión (≈ 100 Mpx).
Image.MAX_IMAGE_PIXELS = 100_000_000

ALLOWED_FORMATS = {"JPEG", "PNG", "HEIF"}
DISPLAY_SIZE = 2048
THUMB_SIZE = 400
JPEG_QUALITY = 82
ORIGINAL_QUALITY = 92

_EXIF_IFD = 0x8769
_GPS_IFD = 0x8825
_DATETIME = 0x0132
_DATETIME_ORIGINAL = 0x9003
_OFFSET_TIME_ORIGINAL = 0x9011
_OFFSET_TIME = 0x9010


class ImageError(InvalidError):
    """El archivo no es una imagen válida o no se puede procesar."""


@dataclass(frozen=True)
class Variants:
    display: bytes
    thumb: bytes
    width: int
    height: int


@dataclass(frozen=True)
class ProcessedPhoto:
    original: bytes
    display: bytes
    thumb: bytes
    width: int
    height: int
    sha256: str
    taken_at: datetime | None
    # Fecha local de la foto (la del reloj de la cámara), para sugerir el día del recuerdo.
    taken_on: date | None
    lon: float | None
    lat: float | None


def _jpeg(image: Image.Image, quality: int, **options: object) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, "JPEG", quality=quality, optimize=True, **options)
    return buffer.getvalue()


def _to_srgb(image: Image.Image) -> Image.Image:
    """Convierte a RGB en sRGB (las fotos de iPhone vienen en Display P3)."""
    icc = image.info.get("icc_profile")
    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        rgba = image.convert("RGBA")
        image = Image.new("RGB", rgba.size, (255, 255, 255))
        image.paste(rgba, mask=rgba.getchannel("A"))
    elif image.mode != "RGB":
        image = image.convert("RGB")
    if icc:
        try:
            source = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            image = ImageCms.profileToProfile(image, source, ImageCms.createProfile("sRGB"))
        except (ImageCms.PyCMSError, OSError):
            pass
    return image


def make_variants(image: Image.Image) -> Variants:
    """`display` y `thumb` de una imagen ya enderezada. No llevan EXIF ni perfil ICC."""
    rgb = _to_srgb(image)
    display = rgb.copy()
    display.thumbnail((DISPLAY_SIZE, DISPLAY_SIZE), Image.Resampling.LANCZOS)
    thumb = rgb.copy()
    thumb.thumbnail((THUMB_SIZE, THUMB_SIZE), Image.Resampling.LANCZOS)
    return Variants(
        display=_jpeg(display, JPEG_QUALITY),
        thumb=_jpeg(thumb, JPEG_QUALITY),
        width=rgb.width,
        height=rgb.height,
    )


def _ratio(value: object) -> float:
    try:
        return float(value)  # IFDRational o número
    except (TypeError, ValueError, ZeroDivisionError):
        numerator, denominator = value  # type: ignore[misc]
        return numerator / denominator


def _coordinate(dms: object, ref: object) -> float | None:
    try:
        degrees, minutes, seconds = (_ratio(part) for part in dms)  # type: ignore[union-attr]
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    value = degrees + minutes / 60 + seconds / 3600
    if str(ref).strip().upper() in ("S", "W"):
        value = -value
    return value


def read_gps(exif: Image.Exif) -> tuple[float, float] | None:
    """(lon, lat) del EXIF, o None si no hay GPS o no es válido."""
    gps = exif.get_ifd(_GPS_IFD)
    if not gps or 2 not in gps or 4 not in gps:
        return None
    lat = _coordinate(gps[2], gps.get(1, "N"))
    lon = _coordinate(gps[4], gps.get(3, "E"))
    if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    if lat == 0 and lon == 0:  # cámaras que escriben 0,0 sin señal
        return None
    return lon, lat


def _offset(raw: object) -> timezone | None:
    text = str(raw or "").strip()
    if len(text) != 6 or text[0] not in "+-" or text[3] != ":":
        return None
    try:
        hours, minutes = int(text[1:3]), int(text[4:6])
    except ValueError:
        return None
    sign = 1 if text[0] == "+" else -1
    return timezone(sign * timedelta(hours=hours, minutes=minutes))


def read_taken(exif: Image.Exif) -> tuple[datetime | None, date | None]:
    """(instante, fecha local) de la toma.

    Sin zona horaria en el EXIF, el instante se guarda como si fuera UTC; la fecha local es
    siempre la del reloj de la cámara.
    """
    sub = exif.get_ifd(_EXIF_IFD)
    raw = sub.get(_DATETIME_ORIGINAL) or exif.get(_DATETIME)
    if not raw:
        return None, None
    try:
        local = datetime.strptime(str(raw).strip("\x00 "), "%Y:%m:%d %H:%M:%S")
    except ValueError:
        return None, None
    tz = _offset(sub.get(_OFFSET_TIME_ORIGINAL) or sub.get(_OFFSET_TIME)) or UTC
    return local.replace(tzinfo=tz).astimezone(UTC), local.date()


def process_upload(data: bytes) -> ProcessedPhoto:
    """Valida y procesa un archivo subido. ImageError si no es una imagen aceptada."""
    try:
        image = Image.open(io.BytesIO(data))
        image_format = image.format
        if image_format not in ALLOWED_FORMATS:
            raise ImageError("Formato no aceptado: usa JPG, PNG o HEIC")
        image.load()
    except ImageError:
        raise
    except Image.DecompressionBombError as error:
        raise ImageError("La imagen es demasiado grande") from error
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as error:
        raise ImageError("El archivo no es una imagen válida") from error

    exif = image.getexif()
    taken_at, taken_on = read_taken(exif)
    gps = read_gps(exif)
    upright = ImageOps.exif_transpose(image)
    variants = make_variants(upright)

    if image_format == "JPEG":
        original = data
    else:
        # El original se guarda como JPEG con su EXIF (sin perfil: ya va convertido a sRGB).
        exif_bytes = exif.tobytes() if exif else b""
        options = {"exif": exif_bytes} if exif_bytes else {}
        original = _jpeg(_to_srgb(image), ORIGINAL_QUALITY, **options)

    return ProcessedPhoto(
        original=original,
        display=variants.display,
        thumb=variants.thumb,
        width=variants.width,
        height=variants.height,
        sha256=hashlib.sha256(data).hexdigest(),
        taken_at=taken_at,
        taken_on=taken_on,
        lon=gps[0] if gps else None,
        lat=gps[1] if gps else None,
    )
