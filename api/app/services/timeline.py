"""Línea de tiempo del usuario: en qué año se encendió cada país, estado y ciudad.

Las vistas de estado (migraciones 0004, 0005 y 0007) dan la primera parada de cualquier tipo
(first_visited_on) y la primera estancia (first_stay_on). Un lugar se enciende como escala
el año de su primera parada y pasa a visitado el año de su primera estancia; la casa cuenta
desde siempre. Al cierre del último año, los totales coinciden con /api/me/progress.
"""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import Continent, User
from app.schemas import (
    ContinentProgress,
    CountriesProgress,
    PlaceStatus,
    SubdivisionsProgress,
    TimelineCity,
    TimelineCountry,
    TimelineHome,
    TimelineOut,
    TimelineProgress,
    TimelineSubdivision,
    TimelineYear,
)
from app.services.me import SUBDIVISION_COUNTRY


@dataclass(frozen=True)
class _Place:
    key: str | int
    is_home: bool
    first_visited_on: date | None
    first_stay_on: date | None

    def events(self) -> list[tuple[int, PlaceStatus]]:
        """(año, estado) en que el lugar se encendió y, si aplica, pasó a visitado."""
        if self.is_home or self.first_visited_on is None:
            return []
        first = self.first_visited_on.year
        stay = self.first_stay_on.year if self.first_stay_on else None
        if stay == first:
            return [(first, "visited")]
        events: list[tuple[int, PlaceStatus]] = [(first, "stopover")]
        if stay is not None:
            events.append((stay, "visited"))
        return events

    def status_at(self, year: int) -> PlaceStatus | None:
        if self.is_home:
            return "visited"
        if self.first_stay_on and self.first_stay_on.year <= year:
            return "visited"
        if self.first_visited_on and self.first_visited_on.year <= year:
            return "stopover"
        return None


def _places(rows: Iterable, key: str) -> list[_Place]:
    return [_Place(r[key], r["is_home"], r["first_visited_on"], r["first_stay_on"]) for r in rows]


def timeline(session: Session, user: User, today: date | None = None) -> TimelineOut:
    params = {"uid": user.id, "sub_country": SUBDIVISION_COUNTRY}
    country_rows = (
        session.execute(
            text(
                """
                SELECT iso3::text AS iso3, continent, counts_in_progress, is_home,
                       first_visited_on, first_stay_on
                FROM user_country_status WHERE user_id = :uid ORDER BY iso3
                """
            ),
            params,
        )
        .mappings()
        .all()
    )
    subdivision_rows = (
        session.execute(
            text(
                """
                SELECT uss.code, c.iso3::text = :sub_country AS counts, uss.is_home,
                       uss.first_visited_on, uss.first_stay_on
                FROM user_subdivision_status uss JOIN countries c ON c.id = uss.country_id
                WHERE uss.user_id = :uid ORDER BY uss.code
                """
            ),
            params,
        )
        .mappings()
        .all()
    )
    city_rows = (
        session.execute(
            text(
                """
                SELECT city_id, is_home, first_visited_on, first_stay_on
                FROM user_city_status WHERE user_id = :uid ORDER BY city_id
                """
            ),
            params,
        )
        .mappings()
        .all()
    )
    totals = (
        session.execute(
            text(
                """
                SELECT
                  (SELECT count(*) FROM subdivisions sd JOIN countries c ON c.id = sd.country_id
                    WHERE c.iso3 = :sub_country) AS subdivisions,
                  (SELECT json_object_agg(continent, n) FROM (
                     SELECT continent, count(*) AS n FROM countries
                     WHERE counts_in_progress GROUP BY continent) t) AS continents
                """
            ),
            params,
        )
        .mappings()
        .one()
    )

    countries = _places(country_rows, "iso3")
    subdivisions = _places(subdivision_rows, "code")
    cities = _places(city_rows, "city_id")
    # Solo los países que suman (no territorios) y los estados de México entran en totales.
    continent_of = {r["iso3"]: r["continent"] for r in country_rows if r["counts_in_progress"]}
    counted_subdivisions = {r["code"] for r in subdivision_rows if r["counts"]}

    by_year: dict[int, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for kind, places in (("countries", countries), ("subdivisions", subdivisions)):
        for place in places:
            for year, status in place.events():
                by_year[year][kind].append((place.key, status))
    for place in cities:
        for year, status in place.events():
            by_year[year]["cities"].append((place.key, status))

    current = (today or date.today()).year
    first = min(by_year, default=current)
    last = max(current, max(by_year, default=current))

    continent_totals: dict[str, int] = totals["continents"] or {}
    years = []
    for year in range(first, last + 1):
        visited = {}
        for place in countries:
            if place.key in continent_of and (status := place.status_at(year)):
                visited[place.key] = status
        per_continent: dict[str, int] = defaultdict(int)
        for iso3 in visited:
            per_continent[continent_of[iso3]] += 1
        changes = by_year.get(year, {})
        years.append(
            TimelineYear(
                year=year,
                countries=[
                    TimelineCountry(iso3=k, status=s) for k, s in changes.get("countries", [])
                ],
                subdivisions=[
                    TimelineSubdivision(code=k, status=s)
                    for k, s in changes.get("subdivisions", [])
                ],
                cities=[TimelineCity(id=k, status=s) for k, s in changes.get("cities", [])],
                progress=TimelineProgress(
                    countries=CountriesProgress(
                        visited=len(visited),
                        total=sum(continent_totals.values()),
                        stopover_only=sum(1 for s in visited.values() if s == "stopover"),
                    ),
                    continents=[
                        ContinentProgress(
                            continent=c,
                            visited=per_continent[c.value],
                            total=continent_totals.get(c.value, 0),
                        )
                        for c in Continent
                    ],
                    subdivisions=SubdivisionsProgress(
                        country_iso3=SUBDIVISION_COUNTRY,
                        visited=sum(
                            1
                            for p in subdivisions
                            if p.key in counted_subdivisions and p.status_at(year)
                        ),
                        total=totals["subdivisions"],
                    ),
                ),
            )
        )

    return TimelineOut(
        home=TimelineHome(
            countries=[str(p.key) for p in countries if p.is_home],
            subdivisions=[str(p.key) for p in subdivisions if p.is_home],
            cities=[int(p.key) for p in cities if p.is_home],
        ),
        years=years,
    )
