"""Dependencias comunes de los routers."""

from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.models import User
from app.storage import StorageBackend, get_storage

SessionDep = Annotated[Session, Depends(get_session)]
StorageDep = Annotated[StorageBackend, Depends(get_storage)]


def get_current_user(session: SessionDep) -> User:
    """Usuario de la petición.

    Hasta la fase 8 (cuentas) es siempre el usuario semilla. Las pruebas la reemplazan
    para actuar como otros usuarios.
    """
    handle = get_settings().current_user_handle
    user = session.scalar(select(User).where(User.handle == handle))
    if user is None:
        raise HTTPException(503, f"No existe el usuario '{handle}'. Corre make seed.")
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]
