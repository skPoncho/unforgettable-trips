"""Viajes y paradas del usuario actual: /api/trips y /api/stops."""

import uuid

from fastapi import APIRouter, Response, status

from app.deps import CurrentUserDep, SessionDep, StorageDep
from app.schemas import (
    StopIn,
    StopOrderIn,
    StopOut,
    StopPatch,
    TripDetailOut,
    TripIn,
    TripOut,
    TripPatch,
)
from app.services import trips

router = APIRouter(prefix="/api", tags=["trips"])

_404 = {404: {"description": "No existe o no es tuyo"}}


@router.get("/trips", response_model=list[TripOut])
def list_trips(session: SessionDep, user: CurrentUserDep) -> list[TripOut]:
    """Tus viajes, del más reciente al más antiguo."""
    return trips.list_trips(session, user)


@router.post("/trips", response_model=TripDetailOut, status_code=status.HTTP_201_CREATED)
def create_trip(data: TripIn, session: SessionDep, user: CurrentUserDep) -> TripDetailOut:
    trip = trips.create_trip(session, user, data)
    session.commit()
    return trips.trip_detail(session, user, trip.id)


@router.get("/trips/{trip_id}", response_model=TripDetailOut, responses=_404)
def get_trip(trip_id: uuid.UUID, session: SessionDep, user: CurrentUserDep) -> TripDetailOut:
    return trips.trip_detail(session, user, trip_id)


@router.patch("/trips/{trip_id}", response_model=TripDetailOut, responses=_404)
def update_trip(
    trip_id: uuid.UUID, patch: TripPatch, session: SessionDep, user: CurrentUserDep
) -> TripDetailOut:
    trips.update_trip(session, user, trip_id, patch)
    session.commit()
    return trips.trip_detail(session, user, trip_id)


@router.delete("/trips/{trip_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_404)
def delete_trip(
    trip_id: uuid.UUID, session: SessionDep, storage: StorageDep, user: CurrentUserDep
) -> Response:
    """Borra el viaje con sus paradas, recuerdos y fotos."""
    trips.delete_trip(session, storage, user, trip_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/trips/{trip_id}/stops",
    response_model=StopOut,
    status_code=status.HTTP_201_CREATED,
    responses=_404,
)
def add_stop(
    trip_id: uuid.UUID, data: StopIn, session: SessionDep, user: CurrentUserDep
) -> StopOut:
    """Agrega una parada; país, estado y ciudad se calculan desde el punto."""
    stop = trips.add_stop(session, user, trip_id, data)
    session.commit()
    return trips.stop_detail(session, user, stop.id)


@router.put("/trips/{trip_id}/stops/order", response_model=list[StopOut], responses=_404)
def reorder_stops(
    trip_id: uuid.UUID, data: StopOrderIn, session: SessionDep, user: CurrentUserDep
) -> list[StopOut]:
    """Reordena las paradas: `stop_ids` trae todas, en el orden nuevo."""
    trips.reorder_stops(session, user, trip_id, data.stop_ids)
    session.commit()
    return trips.list_stops(session, user, trip_id=trip_id)


@router.get("/stops/{stop_id}", response_model=StopOut, responses=_404)
def get_stop(stop_id: uuid.UUID, session: SessionDep, user: CurrentUserDep) -> StopOut:
    return trips.stop_detail(session, user, stop_id)


@router.patch("/stops/{stop_id}", response_model=StopOut, responses=_404)
def update_stop(
    stop_id: uuid.UUID, patch: StopPatch, session: SessionDep, user: CurrentUserDep
) -> StopOut:
    trips.update_stop(session, user, stop_id, patch)
    session.commit()
    return trips.stop_detail(session, user, stop_id)


@router.delete("/stops/{stop_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_404)
def delete_stop(
    stop_id: uuid.UUID, session: SessionDep, storage: StorageDep, user: CurrentUserDep
) -> Response:
    """Borra la parada con sus recuerdos y fotos; las demás se renumeran."""
    trips.delete_stop(session, storage, user, stop_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
