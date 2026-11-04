"""Fotos de relleno para las semillas: un degradado con el nombre del lugar.

El original lleva EXIF con fecha y GPS (como una foto de teléfono); las variantes
`display` y `thumb` se guardan sin metadatos, igual que hará la subida real (fase 4).
"""

import colorsys
import hashlib
import io
from dataclasses import dataclass
from datetime import datetime
from fractions import Fraction

from PIL import Image, ImageDraw, ImageFont, ImageOps
from PIL.TiffImagePlugin import IFDRational

ORIGINAL_SIZE = (1200, 800)
THUMB_WIDTH = 400

_EXIF_IFD = 0x8769
_GPS_IFD = 0x8825
_DATETIME = 0x0132
_DATETIME_ORIGINAL = 0x9003
_MAKE, _MODEL = 0x010F, 0x0110


@dataclass(frozen=True)
class RenderedPhoto:
    original: bytes
    display: bytes
    thumb: bytes
    width: int
    height: int
    sha256: str


def _dms(value: float) -> tuple[IFDRational, IFDRational, IFDRational]:
    value = abs(value)
    degrees = int(value)
    minutes = int((value - degrees) * 60)
    seconds = Fraction((value - degrees - minutes / 60) * 3600).limit_denominator(10_000)
    return (
        IFDRational(degrees, 1),
        IFDRational(minutes, 1),
        IFDRational(seconds.numerator, seconds.denominator),
    )


def _exif(taken_at: datetime, lon: float, lat: float) -> Image.Exif:
    exif = Image.Exif()
    stamp = taken_at.strftime("%Y:%m:%d %H:%M:%S")
    exif[_MAKE] = "Huella"
    exif[_MODEL] = "Semilla"
    exif[_DATETIME] = stamp
    exif.get_ifd(_EXIF_IFD)[_DATETIME_ORIGINAL] = stamp
    gps = exif.get_ifd(_GPS_IFD)
    gps[1] = "N" if lat >= 0 else "S"
    gps[2] = _dms(lat)
    gps[3] = "E" if lon >= 0 else "W"
    gps[4] = _dms(lon)
    return exif


def _jpeg(image: Image.Image, exif: Image.Exif | None = None) -> bytes:
    buffer = io.BytesIO()
    options = {"quality": 80, "optimize": True}
    if exif is not None:
        options["exif"] = exif
    image.save(buffer, "JPEG", **options)
    return buffer.getvalue()


def _canvas(label: str, caption: str, seed: int) -> Image.Image:
    hue = (seed * 0.137) % 1.0
    dark = tuple(round(c * 255) for c in colorsys.hsv_to_rgb(hue, 0.55, 0.30))
    light = tuple(round(c * 255) for c in colorsys.hsv_to_rgb((hue + 0.08) % 1, 0.45, 0.85))
    gradient = Image.linear_gradient("L").rotate(35 + seed % 90, expand=False)
    image = ImageOps.colorize(gradient.resize(ORIGINAL_SIZE), dark, light)
    draw = ImageDraw.Draw(image)
    draw.text((60, 600), label, fill="white", font=ImageFont.load_default(size=72))
    draw.text((64, 690), caption, fill=(255, 255, 255), font=ImageFont.load_default(size=32))
    return image


def render_photo(
    label: str, caption: str, *, taken_at: datetime, lon: float, lat: float, seed: int
) -> RenderedPhoto:
    image = _canvas(label, caption, seed)
    original = _jpeg(image, _exif(taken_at, lon, lat))
    thumb = image.copy()
    thumb.thumbnail((THUMB_WIDTH, THUMB_WIDTH))
    return RenderedPhoto(
        original=original,
        display=_jpeg(image),
        thumb=_jpeg(thumb),
        width=image.width,
        height=image.height,
        sha256=hashlib.sha256(original).hexdigest(),
    )
