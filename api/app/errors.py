"""Errores de dominio. Los servicios los lanzan y main.py los traduce a HTTP."""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class DomainError(Exception):
    status_code = 400

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFoundError(DomainError):
    """No existe o es de otro usuario: siempre 404, para no revelar que existe."""

    status_code = 404


class InvalidError(DomainError):
    """Los datos no cumplen una regla de negocio."""

    status_code = 422


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
