"""Catálogo de países (api/data/countries.csv).

Convención de progreso: solo suman los 195 países (193 de la ONU, Vaticano y Palestina)
con 35/44/48/54/14 por continente. Los territorios (Groenlandia, Puerto Rico, Taiwán,
Kosovo…) se pintan en el mapa pero no suman, ni siquiera a su soberano.
"""

import csv
from dataclasses import dataclass
from functools import cache
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parents[2] / "data" / "countries.csv"

CONTINENTS = ("america", "europe", "asia", "africa", "oceania")


@dataclass(frozen=True)
class CatalogCountry:
    iso2: str
    iso3: str
    iso_numeric: str | None
    name_es: str
    continent: str
    counts_in_progress: bool
    sovereign_iso3: str | None


@cache
def load_catalog() -> tuple[CatalogCountry, ...]:
    with CSV_PATH.open(encoding="utf-8") as f:
        return tuple(
            CatalogCountry(
                iso2=row["iso2"],
                iso3=row["iso3"],
                iso_numeric=row["iso_numeric"] or None,
                name_es=row["name_es"],
                continent=row["continent"],
                counts_in_progress=row["counts_in_progress"] == "true",
                sovereign_iso3=row["sovereign_iso3"] or None,
            )
            for row in csv.DictReader(f)
        )
