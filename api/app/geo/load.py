"""Carga los catálogos geográficos en PostGIS: `make load-geo` (python -m app.geo.load).

Es idempotente: se puede correr las veces que haga falta y deja el mismo resultado.
- Países: api/data/countries.csv + geometrías de Natural Earth 10m admin-0.
- Estados de México: api/data/subdivisions.csv + Natural Earth 10m admin-1.
- Ciudades: GeoNames cities5000 con nombres en español (ver app/geo/cities.py).
"""

import argparse
import csv
import json
from dataclasses import asdict, dataclass, field

from sqlalchemy import Connection, Engine, text

from app.db import get_engine
from app.geo import cities
from app.geo.catalog import load_catalog
from app.geo.sources import DATA_DIR, natural_earth, natural_earth_mapping


@dataclass
class LoadReport:
    countries: int = 0
    countries_without_geom: list[str] = field(default_factory=list)
    subdivisions: int = 0
    cities: int = 0
    cities_skipped: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def _admin0_target(props: dict, mapping: dict) -> str | None:
    """País del catálogo de una pieza de Natural Earth admin-0 (None si se descarta)."""
    a3 = props["ADM0_A3"]
    if a3 in mapping["drop"]:
        return None
    if a3 in mapping["fold"]:
        return mapping["fold"][a3]
    if a3 in mapping["rename"]:
        return mapping["rename"][a3]
    return props["ISO_A3_EH"] if props["ISO_A3_EH"] != "-99" else a3


def load_countries(conn: Connection, report: LoadReport) -> None:
    catalog = load_catalog()
    conn.execute(
        text(
            """
            INSERT INTO countries (iso2, iso3, iso_numeric, name_es, continent, counts_in_progress)
            VALUES (:iso2, :iso3, :iso_numeric, :name_es, CAST(:continent AS continent),
                    :counts_in_progress)
            ON CONFLICT (iso3) DO UPDATE SET
                iso2 = EXCLUDED.iso2,
                iso_numeric = EXCLUDED.iso_numeric,
                name_es = EXCLUDED.name_es,
                continent = EXCLUDED.continent,
                counts_in_progress = EXCLUDED.counts_in_progress
            """
        ),
        [asdict(c) for c in catalog],
    )
    conn.execute(
        text(
            "UPDATE countries SET sovereign_id = (SELECT id FROM countries s WHERE s.iso3 = :sov) "
            "WHERE iso3 = :iso3"
        ),
        [{"iso3": c.iso3, "sov": c.sovereign_iso3} for c in catalog],
    )

    mapping = natural_earth_mapping()["admin0"]
    features = json.loads(
        natural_earth("ne_10m_admin_0_countries.geojson").read_text(encoding="utf-8")
    )["features"]
    known = {c.iso3 for c in catalog}
    rows = []
    for feature in features:
        props = feature["properties"]
        iso3 = _admin0_target(props, mapping)
        if iso3 is None:
            continue
        if iso3 not in known:
            report.warnings.append(f"Natural Earth {props['ADM0_A3']} ({props['NAME']}) sin país")
            continue
        rows.append(
            {
                "iso3": iso3,
                # La pieza principal da el punto de la etiqueta; las fundidas solo suman área.
                "is_main": props["ADM0_A3"] not in mapping["fold"],
                "label_x": props["LABEL_X"],
                "label_y": props["LABEL_Y"],
                "geom": json.dumps(feature["geometry"]),
            }
        )

    conn.execute(
        text(
            "CREATE TEMP TABLE ne_admin0 (iso3 text, is_main bool, label_x float8, "
            "label_y float8, geom geometry) ON COMMIT DROP"
        )
    )
    conn.execute(
        text(
            "INSERT INTO ne_admin0 VALUES (:iso3, :is_main, :label_x, :label_y, "
            "ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326)))"
        ),
        rows,
    )
    conn.execute(
        text(
            """
            UPDATE countries c SET
                geom = ST_Multi(ST_CollectionExtract(u.geom, 3)),
                label_point = u.label_point
            FROM (
                SELECT iso3,
                       ST_Union(geom) AS geom,
                       ST_SetSRID(ST_MakePoint(max(label_x) FILTER (WHERE is_main),
                                               max(label_y) FILTER (WHERE is_main)), 4326)
                           AS label_point
                FROM ne_admin0 GROUP BY iso3
            ) u
            WHERE c.iso3 = u.iso3
            """
        )
    )
    report.countries = conn.execute(text("SELECT count(*) FROM countries")).scalar_one()
    report.countries_without_geom = list(
        conn.execute(text("SELECT iso3 FROM countries WHERE geom IS NULL ORDER BY iso3")).scalars()
    )


def load_subdivisions(conn: Connection, report: LoadReport) -> None:
    with (DATA_DIR / "subdivisions.csv").open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    conn.execute(
        text(
            """
            INSERT INTO subdivisions (country_id, code, name_es, geonames_admin1)
            SELECT id, :code, :name_es, :geonames_admin1 FROM countries WHERE iso3 = :country_iso3
            ON CONFLICT (code) DO UPDATE SET
                country_id = EXCLUDED.country_id,
                name_es = EXCLUDED.name_es,
                geonames_admin1 = EXCLUDED.geonames_admin1
            """
        ),
        rows,
    )

    fold = natural_earth_mapping()["admin1"]["fold"]
    code_by_ne = {r["ne_iso_3166_2"]: r["code"] for r in rows}
    countries = {r["country_iso3"] for r in rows}
    features = json.loads(
        natural_earth("ne_10m_admin_1_states_provinces.geojson").read_text(encoding="utf-8")
    )["features"]
    pieces = []
    for feature in features:
        props = feature["properties"]
        if props["adm0_a3"] not in countries:
            continue
        ne_code = props["iso_3166_2"]
        code = fold.get(ne_code) or code_by_ne.get(ne_code)
        if code is None:
            report.warnings.append(f"Natural Earth admin-1 {ne_code} sin estado")
            continue
        pieces.append({"code": code, "geom": json.dumps(feature["geometry"])})

    conn.execute(text("CREATE TEMP TABLE ne_admin1 (code text, geom geometry) ON COMMIT DROP"))
    conn.execute(
        text(
            "INSERT INTO ne_admin1 VALUES "
            "(:code, ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326)))"
        ),
        pieces,
    )
    conn.execute(
        text(
            """
            UPDATE subdivisions s SET geom = ST_Multi(ST_CollectionExtract(u.geom, 3))
            FROM (SELECT code, ST_Union(geom) AS geom FROM ne_admin1 GROUP BY code) u
            WHERE s.code = u.code
            """
        )
    )
    report.subdivisions = conn.execute(text("SELECT count(*) FROM subdivisions")).scalar_one()
    missing = conn.execute(text("SELECT code FROM subdivisions WHERE geom IS NULL")).scalars()
    report.warnings.extend(f"Estado sin geometría: {code}" for code in missing)


def load_all(engine: Engine | None = None, *, with_cities: bool = True) -> LoadReport:
    report = LoadReport()
    engine = engine or get_engine()
    with engine.begin() as conn:
        load_countries(conn, report)
        load_subdivisions(conn, report)
    if with_cities:
        with engine.begin() as conn:
            cities.load_cities(conn, report)
    return report


def is_loaded(engine: Engine) -> bool:
    """True si ya hay países, estados y ciudades cargados (lo usan las pruebas)."""
    with engine.connect() as conn:
        return bool(
            conn.execute(
                text(
                    "SELECT EXISTS (SELECT 1 FROM countries WHERE geom IS NOT NULL) "
                    "AND EXISTS (SELECT 1 FROM subdivisions) AND EXISTS (SELECT 1 FROM cities)"
                )
            ).scalar_one()
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-cities", action="store_true", help="solo países y estados")
    args = parser.parse_args()

    report = load_all(with_cities=not args.skip_cities)
    print(f"Países y territorios: {report.countries}")
    if report.countries_without_geom:
        print(f"  sin geometría: {', '.join(report.countries_without_geom)}")
    print(f"Estados: {report.subdivisions}")
    if not args.skip_cities:
        print(f"Ciudades: {report.cities}")
        for reason, count in report.cities_skipped.items():
            print(f"  omitidas ({reason}): {count}")
    for warning in report.warnings:
        print(f"Aviso: {warning}")


if __name__ == "__main__":
    main()
