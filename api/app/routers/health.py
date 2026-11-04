from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_session

router = APIRouter(tags=["health"])


class Health(BaseModel):
    status: Literal["ok", "error"]
    db: Literal["ok", "error"]
    postgis: str | None


@router.get("/health", response_model=Health)
def health(response: Response, session: Annotated[Session, Depends(get_session)]) -> Health:
    """Confirma que la BD responde y que PostGIS está activo."""
    try:
        postgis = session.execute(text("SELECT postgis_lib_version()")).scalar_one()
    except SQLAlchemyError:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return Health(status="error", db="error", postgis=None)
    return Health(status="ok", db="ok", postgis=postgis)
