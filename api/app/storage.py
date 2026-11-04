"""Almacenamiento de archivos (fotos) detrás de una interfaz.

Por ahora en disco, sobre el volumen photos-data. En la fase 8 llega una implementación
compatible con S3 (R2/MinIO) sin tocar el resto del código.
"""

import shutil
from functools import lru_cache
from pathlib import Path, PurePosixPath
from typing import BinaryIO, Protocol

from app.config import get_settings


class StorageBackend(Protocol):
    def save(self, key: str, data: bytes, content_type: str) -> None: ...

    def open(self, key: str) -> BinaryIO:
        """Abre para lectura. FileNotFoundError si no existe."""
        ...

    def delete(self, key: str) -> None:
        """Borra un archivo. No falla si no existe."""
        ...

    def delete_prefix(self, prefix: str) -> None:
        """Borra todo lo que esté bajo un prefijo (p. ej. los archivos de un usuario)."""
        ...

    def url(self, key: str) -> str:
        """URL para el navegador. El endpoint que la sirve llega en la fase 4."""
        ...


def _safe_key(key: str) -> PurePosixPath:
    path = PurePosixPath(key)
    if not key or path.is_absolute() or ".." in path.parts:
        raise ValueError(f"Clave de almacenamiento inválida: {key!r}")
    return path


class DiskStorage:
    def __init__(self, root: Path, base_url: str = "/api/files") -> None:
        self.root = root
        self.base_url = base_url.rstrip("/")

    def _path(self, key: str) -> Path:
        return self.root / _safe_key(key)

    def save(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        # Escribe a un temporal y renombra: nadie lee un archivo a medias.
        tmp = path.with_name(f".{path.name}.tmp")
        tmp.write_bytes(data)
        tmp.replace(path)

    def open(self, key: str) -> BinaryIO:
        return self._path(key).open("rb")

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def delete_prefix(self, prefix: str) -> None:
        path = self._path(prefix.rstrip("/"))
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink(missing_ok=True)

    def url(self, key: str) -> str:
        return f"{self.base_url}/{_safe_key(key)}"


@lru_cache
def get_storage() -> StorageBackend:
    """Dependencia de FastAPI (las pruebas la reemplazan por una carpeta temporal)."""
    return DiskStorage(get_settings().storage_dir)
