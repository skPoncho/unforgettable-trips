"""Búsqueda del encabezado: /api/search."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import CurrentUserDep, SessionDep
from app.schemas import SearchOut
from app.services import search as search_service

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("", response_model=SearchOut)
def search(
    session: SessionDep,
    user: CurrentUserDep,
    q: Annotated[str, Query(min_length=2, max_length=80, description="Texto a buscar")],
    limit: Annotated[int, Query(ge=1, le=10, description="Máximo por grupo")] = 5,
) -> SearchOut:
    """Tus lugares (visitados o sellados), viajes y recuerdos, sin acentos ni mayúsculas.

    Un viaje coincide por título, resumen o alguna parada; un recuerdo, por su texto, el
    lugar de su parada o su monumento.
    """
    return search_service.search(session, user, q, limit)
