"""Recuerdos del usuario actual: /api/memories."""

import uuid

from fastapi import APIRouter, Response, status

from app.deps import CurrentUserDep, SessionDep, StorageDep
from app.schemas import MemoryIn, MemoryOut, MemoryPatch
from app.services import memories

router = APIRouter(prefix="/api/memories", tags=["memories"])

_404 = {404: {"description": "No existe o no es tuyo"}}


@router.get("", response_model=list[MemoryOut])
def list_memories(
    session: SessionDep,
    user: CurrentUserDep,
    trip_id: uuid.UUID | None = None,
    stop_id: uuid.UUID | None = None,
) -> list[MemoryOut]:
    """Tus recuerdos, en el orden del viaje. Se pueden filtrar por viaje o parada."""
    return memories.list_memories(session, user, trip_id=trip_id, stop_id=stop_id)


@router.post("", response_model=MemoryOut, status_code=status.HTTP_201_CREATED, responses=_404)
def create_memory(data: MemoryIn, session: SessionDep, user: CurrentUserDep) -> MemoryOut:
    """Crea un recuerdo en una parada o, con `place`, en un viaje automático nuevo.

    La visibilidad puede ser igual o más privada que la del viaje, nunca más abierta (422).
    """
    memory = memories.create_memory(session, user, data)
    session.commit()
    return memories.memory_detail(session, user, memory.id)


@router.get("/{memory_id}", response_model=MemoryOut, responses=_404)
def get_memory(memory_id: uuid.UUID, session: SessionDep, user: CurrentUserDep) -> MemoryOut:
    return memories.memory_detail(session, user, memory_id)


@router.patch("/{memory_id}", response_model=MemoryOut, responses=_404)
def update_memory(
    memory_id: uuid.UUID, patch: MemoryPatch, session: SessionDep, user: CurrentUserDep
) -> MemoryOut:
    memories.update_memory(session, user, memory_id, patch)
    session.commit()
    return memories.memory_detail(session, user, memory_id)


@router.delete("/{memory_id}", status_code=status.HTTP_204_NO_CONTENT, responses=_404)
def delete_memory(
    memory_id: uuid.UUID, session: SessionDep, storage: StorageDep, user: CurrentUserDep
) -> Response:
    """Borra el recuerdo y sus fotos."""
    memories.delete_memory(session, storage, user, memory_id)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
