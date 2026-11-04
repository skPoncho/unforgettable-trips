"""El usuario actual: /api/me (perfil, progreso, mapa, Mi país y lista de deseos)."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Response, status

from app.deps import CurrentUserDep, SessionDep
from app.schemas import (
    CityOverview,
    CountrySummaryOut,
    MapOut,
    MeOut,
    MePatch,
    PassportOut,
    ProgressOut,
    SubdivisionOverview,
    TimelineOut,
    WishlistEntry,
)
from app.services import me, my_country, timeline

router = APIRouter(prefix="/api/me", tags=["me"])

Iso3 = Annotated[str, Path(min_length=3, max_length=3, description="ISO3, p. ej. ISL")]
CountryQuery = Annotated[
    str, Query(alias="country", min_length=3, max_length=3, description="ISO3, p. ej. MEX")
]
UNKNOWN_COUNTRY = {404: {"description": "País desconocido"}}


@router.get("", response_model=MeOut)
def get_me(session: SessionDep, user: CurrentUserDep) -> MeOut:
    return me.me(session, user)


@router.patch(
    "",
    response_model=MeOut,
    responses={422: {"description": "Ciudad desconocida"}},
)
def patch_me(data: MePatch, session: SessionDep, user: CurrentUserDep) -> MeOut:
    """Cambia la ciudad de casa (nula para quitarla). La casa cuenta como visitada."""
    out = me.update_me(session, user, data)
    session.commit()
    return out


@router.get("/progress", response_model=ProgressOut)
def get_progress(session: SessionDep, user: CurrentUserDep) -> ProgressOut:
    """Países sobre 195 (las escalas suman), continentes, estados de México y conteos."""
    return me.progress(session, user)


@router.get("/map", response_model=MapOut)
def get_map(session: SessionDep, user: CurrentUserDep) -> MapOut:
    """Estado de cada país, estado y ciudad visitados, monumentos sellados y deseos."""
    return me.world_map(session, user)


@router.get("/timeline", response_model=TimelineOut)
def get_timeline(session: SessionDep, user: CurrentUserDep) -> TimelineOut:
    """Reproduce tu historia: qué se encendió cada año y el progreso al cierre de cada año."""
    return timeline.timeline(session, user)


@router.get(
    "/countries/{iso3}",
    response_model=CountrySummaryOut,
    responses={404: {"description": "País desconocido o no visitado"}},
)
def get_country(iso3: Iso3, session: SessionDep, user: CurrentUserDep) -> CountrySummaryOut:
    """Tarjeta de país: fechas, viajes, conteos, fotos de muestra y escalas."""
    return me.country_summary(session, user, iso3)


@router.get("/subdivisions", response_model=list[SubdivisionOverview], responses=UNKNOWN_COUNTRY)
def get_subdivisions(
    country: CountryQuery, session: SessionDep, user: CurrentUserDep
) -> list[SubdivisionOverview]:
    """Mi país: todos los estados, visitados o por descubrir, en orden alfabético."""
    return my_country.subdivisions(session, user, country)


@router.get("/cities", response_model=list[CityOverview], responses=UNKNOWN_COUNTRY)
def get_cities(
    country: CountryQuery, session: SessionDep, user: CurrentUserDep
) -> list[CityOverview]:
    """Mi país: ciudades visitadas, la casa primero y después las de más viajes."""
    return my_country.cities(session, user, country)


@router.get("/passport", response_model=PassportOut, responses=UNKNOWN_COUNTRY)
def get_passport(country: CountryQuery, session: SessionDep, user: CurrentUserDep) -> PassportOut:
    """Pasaporte de monumentos: sellos del país y hasta 4 sugeridos cerca de tu ruta."""
    return my_country.passport(session, user, country)


@router.get("/wishlist", response_model=list[WishlistEntry])
def get_wishlist(session: SessionDep, user: CurrentUserDep) -> list[WishlistEntry]:
    return me.list_wishlist(session, user)


@router.put(
    "/wishlist/{iso3}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "País desconocido"}},
)
def add_wish(iso3: Iso3, session: SessionDep, user: CurrentUserDep) -> Response:
    me.add_wish(session, user, iso3)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/wishlist/{iso3}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"description": "País desconocido"}},
)
def remove_wish(iso3: Iso3, session: SessionDep, user: CurrentUserDep) -> Response:
    me.remove_wish(session, user, iso3)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
