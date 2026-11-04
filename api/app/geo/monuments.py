"""Catálogo de monumentos (api/data/monuments.csv, de `make build-monuments`).

Lo carga `make load-geo` después de países, estados y ciudades, porque el país, el estado y
la ciudad de cada monumento salen de su punto con locate(), igual que en las paradas.
"""

import csv
from dataclasses import dataclass
from functools import cache

from sqlalchemy import Connection, Engine, text
from sqlalchemy.orm import Session

from app.geo.locate import locate
from app.geo.sources import DATA_DIR

CSV_PATH = DATA_DIR / "monuments.csv"


@dataclass(frozen=True)
class CatalogMonument:
    slug: str
    name_es: str
    stamp_code: str
    kind: str
    iso3: str
    # Estado esperado (solo en la lista curada de México); sirve para revisar el punto.
    subdivision_code: str
    lon: float
    lat: float
    source: str
    source_ref: str


@cache
def load_catalog() -> tuple[CatalogMonument, ...]:
    with CSV_PATH.open(encoding="utf-8") as f:
        return tuple(
            CatalogMonument(**{**r, "lon": float(r["lon"]), "lat": float(r["lat"])})
            for r in csv.DictReader(f)
        )


@dataclass
class MonumentsReport:
    loaded: int = 0
    warnings: list[str] | None = None


def load_monuments(conn: Connection) -> MonumentsReport:
    """Inserta o actualiza por slug. Borra los que salieron del catálogo si nadie los usa."""
    report = MonumentsReport(warnings=[])
    session = Session(bind=conn)
    rows = []
    for m in load_catalog():
        found = locate(session, lon=m.lon, lat=m.lat)
        if found is None:
            report.warnings.append(f"Monumento fuera de todo país: {m.slug} ({m.name_es})")
            continue
        sub = found.subdivision
        if m.subdivision_code and (sub is None or sub.code != m.subdivision_code):
            report.warnings.append(
                f"{m.slug}: el punto cae en {sub.code if sub else found.country.iso3}, "
                f"no en {m.subdivision_code}"
            )
        rows.append(
            {
                "slug": m.slug,
                "name_es": m.name_es,
                "stamp_code": m.stamp_code,
                "kind": m.kind,
                "country_id": found.country.id,
                "subdivision_id": sub.id if sub else None,
                "city_id": found.city.id if found.city else None,
                "lon": m.lon,
                "lat": m.lat,
                "source": m.source,
                "source_ref": m.source_ref or None,
            }
        )
    conn.execute(
        text(
            """
            INSERT INTO monuments (slug, name_es, stamp_code, kind, country_id, subdivision_id,
                                   city_id, location, source, source_ref)
            VALUES (:slug, :name_es, :stamp_code, CAST(:kind AS monument_kind), :country_id,
                    :subdivision_id, :city_id, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326),
                    :source, :source_ref)
            ON CONFLICT (slug) DO UPDATE SET
                name_es = EXCLUDED.name_es,
                stamp_code = EXCLUDED.stamp_code,
                kind = EXCLUDED.kind,
                country_id = EXCLUDED.country_id,
                subdivision_id = EXCLUDED.subdivision_id,
                city_id = EXCLUDED.city_id,
                location = EXCLUDED.location,
                source = EXCLUDED.source,
                source_ref = EXCLUDED.source_ref
            """
        ),
        rows,
    )
    slugs = [r["slug"] for r in rows]
    conn.execute(
        text(
            """
            DELETE FROM monuments mo
            WHERE mo.slug <> ALL(:slugs)
              AND NOT EXISTS (SELECT 1 FROM memories m WHERE m.monument_id = mo.id)
            """
        ),
        {"slugs": slugs},
    )
    kept = conn.execute(
        text("SELECT slug FROM monuments WHERE slug <> ALL(:slugs) ORDER BY slug"),
        {"slugs": slugs},
    ).scalars()
    report.warnings.extend(f"Fuera del catálogo pero con recuerdos: {slug}" for slug in kept)
    report.loaded = len(rows)
    return report


def is_loaded(engine: Engine) -> bool:
    """True si ya está cargado el catálogo vigente (lo usan las pruebas).

    Algunos sitios en mar abierto no caen en ningún país y no se cargan, así que basta con
    que estén todos los curados y casi todos los demás.
    """
    with engine.connect() as conn:
        slugs = set(conn.execute(text("SELECT slug FROM monuments")).scalars())
    catalog = load_catalog()
    curated = {m.slug for m in catalog if not m.slug.startswith("unesco-")}
    missing = {m.slug for m in catalog} - slugs
    return curated <= slugs and len(missing) <= len(catalog) // 100
