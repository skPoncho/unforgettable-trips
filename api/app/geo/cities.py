"""Ciudades de GeoNames (cities5000) con su nombre en español.

GeoNames está bajo CC BY 4.0: requiere atribución visible (página de créditos, fase 9).
Los nombres en español salen de alternateNamesV2 (unos 200 MB); como leerlo tarda,
se guarda un extracto `cities5000.es.tsv` en la caché.
"""

import csv
import io
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import TYPE_CHECKING

from sqlalchemy import Connection, text

from app.geo.sources import geonames

if TYPE_CHECKING:
    from app.geo.load import LoadReport

# Columnas de cities5000.txt (https://download.geonames.org/export/dump/readme.txt).
GEONAMEID, NAME, LAT, LON, COUNTRY, ADMIN1, POPULATION = 0, 1, 4, 5, 8, 10, 14


def _read_zip_lines(path: Path, member: str) -> Iterator[list[str]]:
    with zipfile.ZipFile(path) as archive, archive.open(member) as raw:
        for line in io.TextIOWrapper(raw, encoding="utf-8"):
            yield line.rstrip("\n").split("\t")


def _pick_spanish_name(candidates: list[tuple[str, bool, bool]]) -> str:
    """Elige entre (nombre, preferido, corto): primero el preferido y no corto."""
    return sorted(candidates, key=lambda c: (not c[1], c[2]))[0][0]


def spanish_names(ids: set[str]) -> dict[str, str]:
    """geonameid → nombre en español, desde el extracto en caché (o generándolo)."""
    source = geonames("alternateNamesV2.zip")
    extract = source.with_name("cities5000.es.tsv")
    if not extract.exists() or extract.stat().st_mtime < source.stat().st_mtime:
        print("Extrayendo nombres en español de GeoNames (tarda un poco la primera vez)…")
        candidates: dict[str, list[tuple[str, bool, bool]]] = {}
        for row in _read_zip_lines(source, "alternateNamesV2.txt"):
            # alternateNameId, geonameid, isolanguage, name, preferred, short, colloquial,
            # historic, from, to
            if len(row) < 8 or row[2] != "es" or row[1] not in ids:
                continue
            if row[6] == "1" or row[7] == "1":
                continue
            candidates.setdefault(row[1], []).append((row[3], row[4] == "1", row[5] == "1"))
        partial = extract.with_suffix(".part")
        with partial.open("w", encoding="utf-8", newline="") as out:
            writer = csv.writer(out, delimiter="\t", lineterminator="\n")
            for geonameid, names in candidates.items():
                writer.writerow([geonameid, _pick_spanish_name(names)])
        partial.rename(extract)

    with extract.open(encoding="utf-8") as f:
        return {row[0]: row[1] for row in csv.reader(f, delimiter="\t")}


def load_cities(conn: Connection, report: "LoadReport") -> None:
    source = geonames("cities5000.zip")
    rows = list(_read_zip_lines(source, "cities5000.txt"))
    names_es = spanish_names({row[GEONAMEID] for row in rows})

    conn.execute(
        text(
            "CREATE TEMP TABLE gn_cities (id int, name text, name_es text, iso2 text, "
            "admin1 text, lon float8, lat float8, population int) ON COMMIT DROP"
        )
    )
    raw = conn.connection.driver_connection
    with raw.cursor() as cur, cur.copy("COPY gn_cities FROM STDIN") as copy:
        for row in rows:
            copy.write_row(
                (
                    int(row[GEONAMEID]),
                    row[NAME],
                    names_es.get(row[GEONAMEID], row[NAME]),
                    row[COUNTRY],
                    row[ADMIN1],
                    float(row[LON]),
                    float(row[LAT]),
                    int(row[POPULATION] or 0),
                )
            )

    # País por código ISO2; si GeoNames usa un código que el catálogo no tiene
    # (Guayana Francesa, Åland…), por el polígono que contiene a la ciudad o el más
    # cercano a menos de 20 km.
    conn.execute(
        text(
            """
            CREATE TEMP TABLE gn_matched ON COMMIT DROP AS
            SELECT g.*, ST_SetSRID(ST_MakePoint(g.lon, g.lat), 4326) AS location,
                   COALESCE(
                       (SELECT id FROM countries c WHERE c.iso2 = g.iso2),
                       (SELECT c.id FROM countries c
                         WHERE ST_DWithin(c.geom::geography,
                                          ST_SetSRID(ST_MakePoint(g.lon, g.lat), 4326)::geography,
                                          20000)
                         ORDER BY c.geom <-> ST_SetSRID(ST_MakePoint(g.lon, g.lat), 4326)
                         LIMIT 1)
                   ) AS country_id
            FROM gn_cities g
            """
        )
    )
    skipped = conn.execute(
        text("SELECT iso2, count(*) FROM gn_matched WHERE country_id IS NULL GROUP BY iso2")
    ).all()
    if skipped:
        report.cities_skipped["sin país"] = sum(n for _, n in skipped)
        report.warnings.append(
            "Ciudades sin país: " + ", ".join(f"{iso2} ({n})" for iso2, n in skipped)
        )

    conn.execute(
        text(
            """
            INSERT INTO cities (id, name, name_es, country_id, subdivision_id, location,
                                population)
            SELECT m.id, m.name, m.name_es, m.country_id, s.id, m.location, m.population
            FROM gn_matched m
            LEFT JOIN subdivisions s
                   ON s.country_id = m.country_id AND s.geonames_admin1 = m.admin1
            WHERE m.country_id IS NOT NULL
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                name_es = EXCLUDED.name_es,
                country_id = EXCLUDED.country_id,
                subdivision_id = EXCLUDED.subdivision_id,
                location = EXCLUDED.location,
                population = EXCLUDED.population
            """
        )
    )
    report.cities = conn.execute(text("SELECT count(*) FROM cities")).scalar_one()
