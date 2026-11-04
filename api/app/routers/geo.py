"""Endpoints de catálogos geográficos: /api/geo/…"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_session
from app.geo.locate import locate
from app.models import Continent
from app.schemas import LonLat

router = APIRouter(prefix="/api/geo", tags=["geo"])

SessionDep = Annotated[Session, Depends(get_session)]


class CountryOut(BaseModel):
    iso3: str
    iso2: str
    name_es: str
    continent: Continent
    counts_in_progress: bool
    sovereign_iso3: str | None
    label_point: LonLat | None


class SubdivisionOut(BaseModel):
    code: str
    name_es: str
    country_iso3: str


class CityOut(BaseModel):
    id: int
    name_es: str
    name: str
    country_iso3: str
    country_name_es: str
    subdivision_code: str | None
    population: int
    location: LonLat


class PlaceRef(BaseModel):
    code: str
    name_es: str


class CountryRef(BaseModel):
    iso3: str
    name_es: str
    counts_in_progress: bool


class NearestCity(BaseModel):
    id: int
    name_es: str
    distance_km: float


class ReverseOut(BaseModel):
    country: CountryRef
    subdivision: PlaceRef | None
    city: NearestCity | None


def _lonlat(lon: float | None, lat: float | None) -> LonLat | None:
    return None if lon is None or lat is None else LonLat(lon=lon, lat=lat)


@router.get("/countries", response_model=list[CountryOut])
def list_countries(
    session: SessionDep,
    include_territories: Annotated[
        bool, Query(alias="all", description="Incluye los territorios que no suman")
    ] = False,
) -> list[CountryOut]:
    """Países que suman al progreso (195); con `all=true`, también los territorios."""
    rows = session.execute(
        text(
            """
            SELECT c.iso3, c.iso2, c.name_es, c.continent, c.counts_in_progress,
                   s.iso3 AS sovereign_iso3,
                   ST_X(c.label_point) AS lon, ST_Y(c.label_point) AS lat
            FROM countries c LEFT JOIN countries s ON s.id = c.sovereign_id
            WHERE c.counts_in_progress OR :all
            ORDER BY c.name_es
            """
        ),
        {"all": include_territories},
    ).mappings()
    return [
        CountryOut(
            **{k: v for k, v in r.items() if k not in ("lon", "lat")},
            label_point=_lonlat(r["lon"], r["lat"]),
        )
        for r in rows
    ]


@router.get("/subdivisions", response_model=list[SubdivisionOut])
def list_subdivisions(
    session: SessionDep,
    country: Annotated[str, Query(min_length=3, max_length=3, description="ISO3, p. ej. MEX")],
) -> list[SubdivisionOut]:
    """Estados de un país (por ahora solo México tiene)."""
    iso3 = country.upper()
    exists = session.execute(
        text("SELECT 1 FROM countries WHERE iso3 = :iso3"), {"iso3": iso3}
    ).scalar()
    if not exists:
        raise HTTPException(404, f"País desconocido: {iso3}")
    rows = session.execute(
        text(
            """
            SELECT s.code, s.name_es, c.iso3 AS country_iso3
            FROM subdivisions s JOIN countries c ON c.id = s.country_id
            WHERE c.iso3 = :iso3 ORDER BY s.name_es
            """
        ),
        {"iso3": iso3},
    ).mappings()
    return [SubdivisionOut(**r) for r in rows]


def _like_pattern(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("/cities", response_model=list[CityOut])
def search_cities(
    session: SessionDep,
    q: Annotated[str, Query(min_length=2, max_length=80, description="Texto a buscar")],
    country: Annotated[str | None, Query(min_length=3, max_length=3)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[CityOut]:
    """Autocompletar: sin acentos ni mayúsculas, en español o en el nombre original.

    Primero las que empiezan con el texto y, dentro de cada grupo, las más pobladas.
    """
    rows = session.execute(
        text(
            """
            WITH needle AS (SELECT f_unaccent(lower(:q)) AS q)
            SELECT ci.id, ci.name_es, ci.name, co.iso3 AS country_iso3,
                   co.name_es AS country_name_es, s.code AS subdivision_code, ci.population,
                   ST_X(ci.location) AS lon, ST_Y(ci.location) AS lat
            FROM cities ci
            JOIN countries co ON co.id = ci.country_id
            LEFT JOIN subdivisions s ON s.id = ci.subdivision_id
            CROSS JOIN needle
            WHERE (f_unaccent(lower(ci.name_es)) LIKE f_unaccent(lower(:pattern))
                   OR f_unaccent(lower(ci.name)) LIKE f_unaccent(lower(:pattern)))
              AND (CAST(:country AS text) IS NULL OR co.iso3 = upper(:country))
            ORDER BY (f_unaccent(lower(ci.name_es)) LIKE needle.q || '%'
                      OR f_unaccent(lower(ci.name)) LIKE needle.q || '%') DESC,
                     ci.population DESC
            LIMIT :limit
            """
        ),
        {"q": q.strip(), "pattern": _like_pattern(q.strip()), "country": country, "limit": limit},
    ).mappings()
    return [
        CityOut(
            **{k: v for k, v in r.items() if k not in ("lon", "lat")},
            location=LonLat(lon=r["lon"], lat=r["lat"]),
        )
        for r in rows
    ]


@router.get(
    "/reverse",
    response_model=ReverseOut,
    responses={404: {"description": "El punto no está en ningún país (mar abierto)"}},
)
def reverse(
    session: SessionDep,
    lat: Annotated[float, Query(ge=-90, le=90)],
    lon: Annotated[float, Query(ge=-180, le=180)],
) -> ReverseOut:
    """País, estado y ciudad más cercana de un punto.

    Si el punto cae fuera de todo polígono (costa, aeropuerto junto al mar) se toma el
    país más cercano a menos de 20 km.
    """
    found = locate(session, lon=lon, lat=lat)
    if found is None:
        raise HTTPException(404, "El punto no está en ningún país")
    country, subdivision, city = found.country, found.subdivision, found.city
    return ReverseOut(
        country=CountryRef(
            iso3=country.iso3,
            name_es=country.name_es,
            counts_in_progress=country.counts_in_progress,
        ),
        subdivision=PlaceRef(code=subdivision.code, name_es=subdivision.name_es)
        if subdivision
        else None,
        city=NearestCity(
            id=city.id, name_es=city.name_es, distance_km=round(city.distance_m / 1000, 1)
        )
        if city
        else None,
    )
