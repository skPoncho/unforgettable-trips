"""Descarga de datos geográficos con caché local (fuera del repo, ver docker-compose.yml)."""

import json
import shutil
import urllib.request
from functools import cache
from pathlib import Path
from typing import Any

from app.config import get_settings

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
GEONAMES = "https://download.geonames.org/export/dump"


@cache
def natural_earth_mapping() -> dict[str, Any]:
    """Cómo se mapean las piezas de Natural Earth al catálogo (api/data/natural_earth.json)."""
    return json.loads((DATA_DIR / "natural_earth.json").read_text(encoding="utf-8"))


def natural_earth_url(name: str) -> str:
    version = natural_earth_mapping()["natural_earth_version"]
    return (
        f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{version}/geojson/{name}"
    )


def cached_download(name: str, url: str) -> Path:
    """Devuelve la ruta en la caché; descarga el archivo solo si no está."""
    cache_dir = get_settings().geo_cache_dir
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / name
    if target.exists():
        return target
    print(f"Descargando {url}…", flush=True)
    partial = target.with_suffix(target.suffix + ".part")
    with urllib.request.urlopen(url, timeout=120) as response, partial.open("wb") as out:
        shutil.copyfileobj(response, out, length=1 << 20)
    partial.rename(target)
    return target


def natural_earth(name: str) -> Path:
    return cached_download(name, natural_earth_url(name))


def geonames(name: str) -> Path:
    return cached_download(name, f"{GEONAMES}/{name}")
