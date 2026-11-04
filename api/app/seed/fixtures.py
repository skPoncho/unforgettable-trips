"""Fotos de prueba con EXIF real en tests/fixtures (python -m app.seed.fixtures).

Se guardan en git: las usan las pruebas y sirven para arrastrarlas a "Nuevo recuerdo".
"""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from app.seed.photos import canvas, jpeg, photo_exif

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "tests" / "fixtures"


@dataclass(frozen=True)
class FixturePhoto:
    filename: str
    label: str
    caption: str
    taken_at: datetime  # hora local de la cámara
    offset: str | None
    lon: float | None
    lat: float | None
    seed: int


FIXTURES = (
    # 8:10 en Kioto (+09:00) es el 12 de marzo en UTC: la fecha sugerida debe ser el 13.
    FixturePhoto(
        "kioto_gps.jpg",
        "Kioto",
        "13 mar 2025 · 35.01 N, 135.77 E",
        datetime(2025, 3, 13, 8, 10),
        "+09:00",
        135.77,
        35.01,
        3,
    ),
    FixturePhoto(
        "reikiavik_gps.jpg",
        "Reikiavik",
        "2 jul 2024 · 64.15 N, 21.94 O",
        datetime(2024, 7, 2, 22, 30),
        "+00:00",
        -21.9426,
        64.1466,
        11,
    ),
    FixturePhoto(
        "sin_gps.jpg",
        "Sin ubicación",
        "Foto sin GPS",
        datetime(2025, 3, 14, 12, 0),
        None,
        None,
        None,
        7,
    ),
)


def write_fixtures(target: Path = FIXTURES_DIR) -> list[Path]:
    target.mkdir(parents=True, exist_ok=True)
    written = []
    for fixture in FIXTURES:
        image = canvas(fixture.label, fixture.caption, fixture.seed)
        exif = photo_exif(fixture.taken_at, fixture.lon, fixture.lat, offset=fixture.offset)
        path = target / fixture.filename
        path.write_bytes(jpeg(image, exif))
        written.append(path)
    return written


if __name__ == "__main__":
    for path in write_fixtures():
        print(path)
