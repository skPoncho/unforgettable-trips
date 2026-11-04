"""Perfil, progreso, mapa y lista de deseos del usuario.

Las reglas (qué cuenta como visitado, la casa, las escalas) viven en las vistas
user_country_status, user_subdivision_status (migración 0004) y user_city_status (0005);
aquí solo se cuenta.
"""

from typing import Any

from sqlalchemy import delete, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.errors import NotFoundError
from app.models import Continent, Country, User, WishlistItem
from app.schemas import (
    CityStatus,
    ContinentProgress,
    CountriesProgress,
    CountryStatus,
    CountrySummaryOut,
    CountryTrip,
    HomeCity,
    LonLat,
    MapOut,
    MeOut,
    MonumentStamp,
    ProgressOut,
    StopoverBrief,
    SubdivisionsProgress,
    SubdivisionStatus,
    WishlistEntry,
)

# Por ahora solo México tiene estados en el catálogo.
SUBDIVISION_COUNTRY = "MEX"


def me(session: Session, user: User) -> MeOut:
    home = (
        session.execute(
            text(
                """
                SELECT ci.id, ci.name_es, c.iso3::text AS country_iso3,
                       sd.code AS subdivision_code
                FROM cities ci JOIN countries c ON c.id = ci.country_id
                LEFT JOIN subdivisions sd ON sd.id = ci.subdivision_id
                WHERE ci.id = :id
                """
            ),
            {"id": user.home_city_id},
        )
        .mappings()
        .first()
    )
    return MeOut(
        id=user.id,
        handle=user.handle,
        display_name=user.display_name,
        home_city=HomeCity(**home) if home else None,
        theme=user.theme,
        profile_public=user.profile_public,
    )


def progress(session: Session, user: User) -> ProgressOut:
    params = {"uid": user.id, "sub_country": SUBDIVISION_COUNTRY}
    continents = {
        r["continent"]: r
        for r in session.execute(
            text(
                """
                SELECT c.continent, count(*) AS total,
                       count(ucs.user_id) AS visited,
                       count(*) FILTER (WHERE ucs.status = 'stopover') AS stopover_only
                FROM countries c
                LEFT JOIN user_country_status ucs
                       ON ucs.country_id = c.id AND ucs.user_id = :uid
                WHERE c.counts_in_progress
                GROUP BY c.continent
                """
            ),
            params,
        ).mappings()
    }
    by_continent = [
        ContinentProgress(
            continent=continent,
            visited=continents.get(continent, {}).get("visited", 0),
            total=continents.get(continent, {}).get("total", 0),
        )
        for continent in Continent
    ]
    counts = (
        session.execute(
            text(
                """
                SELECT
                  (SELECT count(*) FROM subdivisions sd JOIN countries c ON c.id = sd.country_id
                    WHERE c.iso3 = :sub_country) AS sub_total,
                  (SELECT count(*) FROM user_subdivision_status uss
                    JOIN countries c ON c.id = uss.country_id
                    WHERE uss.user_id = :uid AND c.iso3 = :sub_country) AS sub_visited,
                  (SELECT count(*) FROM user_city_status WHERE user_id = :uid) AS cities,
                  (SELECT count(*) FROM user_stamps WHERE user_id = :uid) AS monuments,
                  (SELECT count(*) FROM trips WHERE user_id = :uid) AS trips,
                  (SELECT count(*) FROM photos
                    WHERE user_id = :uid AND memory_id IS NOT NULL) AS photos,
                  (SELECT count(*) FROM wishlist_items WHERE user_id = :uid) AS wishlist
                """
            ),
            params,
        )
        .mappings()
        .one()
    )
    return ProgressOut(
        countries=CountriesProgress(
            visited=sum(r["visited"] for r in continents.values()),
            total=sum(r["total"] for r in continents.values()),
            stopover_only=sum(r["stopover_only"] for r in continents.values()),
        ),
        continents=by_continent,
        subdivisions=SubdivisionsProgress(
            country_iso3=SUBDIVISION_COUNTRY,
            visited=counts["sub_visited"],
            total=counts["sub_total"],
        ),
        cities=counts["cities"],
        monuments=counts["monuments"],
        trips=counts["trips"],
        photos=counts["photos"],
        wishlist=counts["wishlist"],
    )


def world_map(session: Session, user: User) -> MapOut:
    """Estado de cada país y estado para pintar el mapa (incluye territorios que no suman)."""
    params = {"uid": user.id}
    countries = session.execute(
        text(
            """
            SELECT iso3::text AS iso3, status, first_visited_on, is_home, counts_in_progress
            FROM user_country_status WHERE user_id = :uid ORDER BY iso3
            """
        ),
        params,
    ).mappings()
    subdivisions = session.execute(
        text(
            """
            SELECT code, status, first_visited_on, is_home
            FROM user_subdivision_status WHERE user_id = :uid ORDER BY code
            """
        ),
        params,
    ).mappings()
    cities = session.execute(
        text(
            """
            SELECT ci.id, ci.name_es, c.iso3::text AS country_iso3,
                   ST_X(ci.location) AS lon, ST_Y(ci.location) AS lat,
                   ucs.status, ucs.first_visited_on, ucs.is_home
            FROM user_city_status ucs
            JOIN cities ci ON ci.id = ucs.city_id
            JOIN countries c ON c.id = ci.country_id
            WHERE ucs.user_id = :uid ORDER BY ci.id
            """
        ),
        params,
    ).mappings()
    monuments = session.execute(
        text(
            """
            SELECT mo.id, mo.slug, mo.name_es, c.iso3::text AS country_iso3,
                   ST_X(mo.location) AS lon, ST_Y(mo.location) AS lat,
                   us.first_stamped_on
            FROM user_stamps us
            JOIN monuments mo ON mo.id = us.monument_id
            JOIN countries c ON c.id = mo.country_id
            WHERE us.user_id = :uid ORDER BY us.first_stamped_on, mo.id
            """
        ),
        params,
    ).mappings()
    wishlist = session.scalars(
        select(Country.iso3)
        .join(WishlistItem, WishlistItem.country_id == Country.id)
        .where(WishlistItem.user_id == user.id)
        .order_by(Country.iso3)
    )
    return MapOut(
        countries=[CountryStatus(**r) for r in countries],
        subdivisions=[SubdivisionStatus(**r) for r in subdivisions],
        cities=[_with_location(CityStatus, r) for r in cities],
        monuments=[_with_location(MonumentStamp, r) for r in monuments],
        wishlist=list(wishlist),
    )


def _with_location[T: CityStatus | MonumentStamp](model: type[T], row: Any) -> T:
    data = dict(row)
    location = LonLat(lon=data.pop("lon"), lat=data.pop("lat"))
    return model(**data, location=location)


# Paradas del usuario en un país; base de la tarjeta de país.
_COUNTRY_STOPS = """
    WITH s AS (
        SELECT s.* FROM stops s
        WHERE s.user_id = :uid AND s.country_id = :cid
    )
"""


def country_summary(session: Session, user: User, iso3: str) -> CountrySummaryOut:
    """Resumen de un país visitado (o casa) para la tarjeta del mapa; 404 si no."""
    status = (
        session.execute(
            text(
                """
                SELECT ucs.country_id AS cid, c.iso3::text AS iso3, c.name_es, ucs.status,
                       ucs.is_home, ucs.counts_in_progress, ucs.first_visited_on
                FROM user_country_status ucs JOIN countries c ON c.id = ucs.country_id
                WHERE ucs.user_id = :uid AND c.iso3 = :iso3
                """
            ),
            {"uid": user.id, "iso3": iso3.upper()},
        )
        .mappings()
        .first()
    )
    if status is None:
        raise NotFoundError(f"No has visitado {iso3.upper()}")
    params = {"uid": user.id, "cid": status["cid"]}

    counts = (
        session.execute(
            text(
                _COUNTRY_STOPS
                + """
                SELECT
                  (SELECT max(arrived_on) FROM s) AS last_visited_on,
                  (SELECT count(DISTINCT d) FROM s,
                     generate_series(s.arrived_on, s.departed_on, interval '1 day') d
                   WHERE s.visit_type = 'stay') AS days,
                  (SELECT count(*) FROM user_city_status
                   WHERE user_id = :uid AND country_id = :cid) AS cities,
                  (SELECT count(DISTINCT m.monument_id) FROM memories m JOIN s ON s.id = m.stop_id
                   WHERE m.monument_id IS NOT NULL) AS monuments,
                  (SELECT count(*) FROM photos p
                   JOIN memories m ON m.id = p.memory_id JOIN s ON s.id = m.stop_id) AS photos
                """
            ),
            params,
        )
        .mappings()
        .one()
    )
    trip_rows = (
        session.execute(
            text(
                _COUNTRY_STOPS
                + """
            SELECT t.id, t.title, t.visibility,
                   CASE WHEN bool_or(s.visit_type = 'stay') THEN 'stay' ELSE 'stopover' END
                       AS visit_type,
                   min(s.arrived_on) AS starts_on, max(s.departed_on) AS ends_on
            FROM s JOIN trips t ON t.id = s.trip_id
            GROUP BY t.id
            ORDER BY starts_on DESC, t.created_at DESC
            """
            ),
            params,
        )
        .mappings()
        .all()
    )
    # Fotos de muestra: las primeras del viaje más reciente que tenga fotos en el país.
    photo_ids = session.scalars(
        text(
            _COUNTRY_STOPS
            + """
            , per_trip AS (SELECT trip_id, min(arrived_on) AS starts_on FROM s GROUP BY trip_id)
            SELECT p.id FROM photos p
            JOIN memories m ON m.id = p.memory_id
            JOIN s ON s.id = m.stop_id
            JOIN per_trip pt ON pt.trip_id = s.trip_id
            ORDER BY pt.starts_on DESC, s.trip_id, s.position, m.created_at, m.id,
                     p.position, p.created_at
            LIMIT 3
            """
        ),
        params,
    )
    stopovers = session.execute(
        text(
            _COUNTRY_STOPS
            + """
            SELECT place_name, note, arrived_on FROM s
            WHERE visit_type = 'stopover' ORDER BY arrived_on DESC, position
            """
        ),
        params,
    ).mappings()
    return CountrySummaryOut(
        iso3=status["iso3"],
        name_es=status["name_es"],
        status=status["status"],
        is_home=status["is_home"],
        counts_in_progress=status["counts_in_progress"],
        first_visited_on=status["first_visited_on"],
        **counts,
        photo_ids=list(photo_ids),
        trips=[CountryTrip(**r) for r in trip_rows],
        stopovers=[StopoverBrief(**r) for r in stopovers],
    )


def list_wishlist(session: Session, user: User) -> list[WishlistEntry]:
    rows = session.execute(
        select(Country.iso3, Country.name_es, Country.continent, WishlistItem.created_at)
        .join(WishlistItem, WishlistItem.country_id == Country.id)
        .where(WishlistItem.user_id == user.id)
        .order_by(WishlistItem.created_at, Country.name_es)
    ).mappings()
    return [WishlistEntry(**r) for r in rows]


def _country_id(session: Session, iso3: str) -> int:
    country_id = session.scalar(select(Country.id).where(Country.iso3 == iso3.upper()))
    if country_id is None:
        raise NotFoundError(f"País desconocido: {iso3}")
    return country_id


def add_wish(session: Session, user: User, iso3: str) -> None:
    """Idempotente: agregar dos veces deja una sola entrada."""
    session.execute(
        insert(WishlistItem)
        .values(user_id=user.id, country_id=_country_id(session, iso3))
        .on_conflict_do_nothing(constraint="uq_wishlist_user_country")
    )


def remove_wish(session: Session, user: User, iso3: str) -> None:
    session.execute(
        delete(WishlistItem).where(
            WishlistItem.user_id == user.id,
            WishlistItem.country_id == _country_id(session, iso3),
        )
    )
