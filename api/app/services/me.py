"""Perfil, progreso, mapa y lista de deseos del usuario.

Las reglas (qué cuenta como visitado, la casa, las escalas) viven en las vistas
user_country_status y user_subdivision_status (migración 0004); aquí solo se cuenta.
"""

from sqlalchemy import delete, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.errors import NotFoundError
from app.models import Continent, Country, User, WishlistItem
from app.schemas import (
    ContinentProgress,
    CountriesProgress,
    CountryStatus,
    HomeCity,
    MapOut,
    MeOut,
    ProgressOut,
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
                  (SELECT count(DISTINCT city_id) FROM (
                      SELECT city_id FROM stops WHERE user_id = :uid AND city_id IS NOT NULL
                      UNION ALL
                      SELECT home_city_id FROM users WHERE id = :uid AND home_city_id IS NOT NULL
                   ) c) AS cities,
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
    wishlist = session.scalars(
        select(Country.iso3)
        .join(WishlistItem, WishlistItem.country_id == Country.id)
        .where(WishlistItem.user_id == user.id)
        .order_by(Country.iso3)
    )
    return MapOut(
        countries=[CountryStatus(**r) for r in countries],
        subdivisions=[SubdivisionStatus(**r) for r in subdivisions],
        wishlist=list(wishlist),
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
