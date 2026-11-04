"""Puntos y atajos para las pruebas de la API del usuario."""

import uuid
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Photo, User
from app.services.photos import VARIANTS, photo_prefix, variant_key
from app.storage import StorageBackend

# (lon, lat)
KYOTO = (135.7681, 35.0116)
TOKYO = (139.6917, 35.6895)
TOCUMEN = (-79.3835, 9.0714)  # aeropuerto de Panamá
ZOCALO = (-99.1332, 19.4326)
OAXACA = (-96.7266, 17.0732)
SAN_JUAN_PR = (-66.1057, 18.4655)  # territorio: no suma
OPEN_OCEAN = (-140.0, 0.0)
REYKJAVIK = (-21.9426, 64.1466)

# Fotos con EXIF real (python -m app.seed.fixtures).
FIXTURES = Path(__file__).parent / "fixtures"


def fixture_bytes(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def upload(client: TestClient, *files: str | tuple[str, bytes]) -> dict[str, Any]:
    """Sube fotos: nombres de tests/fixtures o pares (nombre, contenido)."""
    parts = []
    for item in files:
        name, data = (item, fixture_bytes(item)) if isinstance(item, str) else item
        parts.append(("files", (name, data, "application/octet-stream")))
    response = client.post("/api/photos", files=parts)
    assert response.status_code == 201, response.text
    return response.json()


def upload_ids(client: TestClient, *files: str | tuple[str, bytes]) -> list[str]:
    body = upload(client, *files)
    assert not body["errors"], body["errors"]
    return [p["id"] for p in body["photos"]]


def place(name: str, point: tuple[float, float], arrived: str, **extra: Any) -> dict[str, Any]:
    lon, lat = point
    location = {"lon": lon, "lat": lat}
    return {"place_name": name, "location": location, "arrived_on": arrived, **extra}


def create_trip(client: TestClient, title: str = "Viaje", **extra: Any) -> dict[str, Any]:
    response = client.post("/api/trips", json={"title": title, **extra})
    assert response.status_code == 201, response.text
    return response.json()


def add_stop(client: TestClient, trip_id: str, stop: dict[str, Any]) -> dict[str, Any]:
    response = client.post(f"/api/trips/{trip_id}/stops", json=stop)
    assert response.status_code == 201, response.text
    return response.json()


def create_memory(client: TestClient, **data: Any) -> dict[str, Any]:
    response = client.post("/api/memories", json=data)
    assert response.status_code == 201, response.text
    return response.json()


def add_photo(db: Session, storage: StorageBackend, user: User, memory_id: str) -> Photo:
    """Foto mínima sin pasar por la subida: cada variante guarda su nombre."""
    photo_id = uuid.uuid4()
    key = photo_prefix(user.id, photo_id)
    for variant in VARIANTS:
        storage.save(variant_key(key, variant), variant.encode(), "image/jpeg")
    photo = Photo(
        id=photo_id,
        user_id=user.id,
        memory_id=uuid.UUID(memory_id),
        storage_key=key,
        mime="image/jpeg",
        width=1,
        height=1,
        bytes=4,
        sha256=photo_id.hex,
    )
    db.add(photo)
    db.commit()
    return photo
