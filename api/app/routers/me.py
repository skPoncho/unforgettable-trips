"""El usuario actual: /api/me (perfil, progreso, mapa y lista de deseos)."""

from typing import Annotated

from fastapi import APIRouter, Path, Response, status

from app.deps import CurrentUserDep, SessionDep
from app.schemas import CountrySummaryOut, MapOut, MeOut, ProgressOut, WishlistEntry
from app.services import me

router = APIRouter(prefix="/api/me", tags=["me"])

Iso3 = Annotated[str, Path(min_length=3, max_length=3, description="ISO3, p. ej. ISL")]


@router.get("", response_model=MeOut)
def get_me(session: SessionDep, user: CurrentUserDep) -> MeOut:
    return me.me(session, user)


@router.get("/progress", response_model=ProgressOut)
def get_progress(session: SessionDep, user: CurrentUserDep) -> ProgressOut:
    """Países sobre 195 (las escalas suman), continentes, estados de México y conteos."""
    return me.progress(session, user)


@router.get("/map", response_model=MapOut)
def get_map(session: SessionDep, user: CurrentUserDep) -> MapOut:
    """Estado de cada país, estado y ciudad visitados, monumentos sellados y deseos."""
    return me.world_map(session, user)


@router.get(
    "/countries/{iso3}",
    response_model=CountrySummaryOut,
    responses={404: {"description": "País desconocido o no visitado"}},
)
def get_country(iso3: Iso3, session: SessionDep, user: CurrentUserDep) -> CountrySummaryOut:
    """Tarjeta de país: fechas, viajes, conteos, fotos de muestra y escalas."""
    return me.country_summary(session, user, iso3)


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
