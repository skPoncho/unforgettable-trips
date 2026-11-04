"""Puntos y atajos para las pruebas de la API del usuario."""

from typing import Any

from fastapi.testclient import TestClient

# (lon, lat)
KYOTO = (135.7681, 35.0116)
TOKYO = (139.6917, 35.6895)
TOCUMEN = (-79.3835, 9.0714)  # aeropuerto de Panamá
ZOCALO = (-99.1332, 19.4326)
OAXACA = (-96.7266, 17.0732)
SAN_JUAN_PR = (-66.1057, 18.4655)  # territorio: no suma
OPEN_OCEAN = (-140.0, 0.0)


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
