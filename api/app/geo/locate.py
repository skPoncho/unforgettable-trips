"""Punto → país, estado y ciudad más cercana. Lo usan /api/geo/reverse y las paradas."""

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

# Tolerancia para puntos en la costa o en el mar cerca de tierra (aeropuertos, playas).
COAST_TOLERANCE_M = 20_000
# Radio máximo para la "ciudad más cercana".
CITY_RADIUS_M = 50_000

_POINT = "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)"

# El filtro en grados usa el índice; la distancia real se mide en metros (geography).
_NEAREST_POLYGON = f"""
    SELECT {{cols}} FROM {{table}} t
    WHERE {{extra}} (ST_Intersects(t.geom, {_POINT})
           OR (ST_DWithin(t.geom, {_POINT}, 1.0)
               AND ST_DWithin(t.geom::geography, {_POINT}::geography, :tolerance)))
    ORDER BY ST_Intersects(t.geom, {_POINT}) DESC,
             ST_Distance(t.geom::geography, {_POINT}::geography)
    LIMIT 1
"""

# Entre las ciudades cercanas del mismo país gana la de menor distancia relativa a su
# tamaño: así un punto en Fushimi da Kioto y no un pueblo vecino a la misma distancia.
_NEAREST_CITY = f"""
    SELECT id, name_es, distance_m FROM (
        SELECT id, name_es, population,
               ST_Distance(location::geography, {_POINT}::geography) AS distance_m
        FROM cities WHERE country_id = :cid
        ORDER BY location <-> {_POINT} LIMIT 20
    ) near
    WHERE distance_m <= :radius
    ORDER BY distance_m / log(population + 10) LIMIT 1
"""


@dataclass(frozen=True)
class CountryHit:
    id: int
    iso3: str
    name_es: str
    counts_in_progress: bool


@dataclass(frozen=True)
class SubdivisionHit:
    id: int
    code: str
    name_es: str


@dataclass(frozen=True)
class CityHit:
    id: int
    name_es: str
    distance_m: float


@dataclass(frozen=True)
class Location:
    country: CountryHit
    subdivision: SubdivisionHit | None
    city: CityHit | None


def locate(session: Session, lon: float, lat: float) -> Location | None:
    """None si el punto no está en ningún país (mar abierto).

    Si cae fuera de todo polígono (costa, aeropuerto junto al mar) se toma el país más
    cercano a menos de 20 km.
    """
    params = {"lon": lon, "lat": lat, "tolerance": COAST_TOLERANCE_M}
    country = (
        session.execute(
            text(
                _NEAREST_POLYGON.format(
                    cols="t.id, t.iso3, t.name_es, t.counts_in_progress",
                    table="countries",
                    extra="",
                )
            ),
            params,
        )
        .mappings()
        .first()
    )
    if country is None:
        return None

    subdivision = (
        session.execute(
            text(
                _NEAREST_POLYGON.format(
                    cols="t.id, t.code, t.name_es",
                    table="subdivisions",
                    extra="t.country_id = :cid AND",
                )
            ),
            {**params, "cid": country["id"]},
        )
        .mappings()
        .first()
    )
    city = (
        session.execute(
            text(_NEAREST_CITY), {**params, "cid": country["id"], "radius": CITY_RADIUS_M}
        )
        .mappings()
        .first()
    )
    return Location(
        country=CountryHit(**country),
        subdivision=SubdivisionHit(**subdivision) if subdivision else None,
        city=CityHit(**city) if city else None,
    )
