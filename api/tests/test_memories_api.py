"""Recuerdos: visibilidad (nunca más abierta que el viaje) y viaje automático."""

from datetime import date

import pytest

from app.services.memories import auto_trip_title
from tests.helpers import KYOTO, add_stop, create_memory, create_trip, place


@pytest.fixture
def stop_in(client, user):
    """Devuelve una parada nueva dentro de un viaje con la visibilidad pedida."""

    def _stop(visibility: str = "public") -> dict:
        trip = create_trip(client, "Japón", visibility=visibility)
        return add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))

    return _stop


def test_memory_inherits_the_trip_visibility(client, stop_in):
    memory = create_memory(client, stop_id=stop_in("link")["id"], body="Toriis")
    assert memory["visibility"] is None
    assert memory["effective_visibility"] == "link"
    assert memory["body"] == "Toriis"


@pytest.mark.parametrize("visibility", ["private", "link", "public"])
def test_memory_can_be_as_private_or_more_than_its_trip(client, stop_in, visibility):
    memory = create_memory(client, stop_id=stop_in("public")["id"], visibility=visibility)
    assert memory["effective_visibility"] == visibility


@pytest.mark.parametrize(("trip", "memory"), [("private", "link"), ("link", "public")])
def test_memory_cannot_be_more_open_than_its_trip(client, stop_in, trip, memory):
    stop = stop_in(trip)
    response = client.post("/api/memories", json={"stop_id": stop["id"], "visibility": memory})
    assert response.status_code == 422
    assert "más abierto" in response.json()["detail"]


def test_memory_cannot_be_patched_more_open_than_its_trip(client, stop_in):
    memory = create_memory(client, stop_id=stop_in("link")["id"])
    url = f"/api/memories/{memory['id']}"
    assert client.patch(url, json={"visibility": "public"}).status_code == 422
    assert client.patch(url, json={"visibility": "private"}).json()["visibility"] == "private"


def test_closing_the_trip_lowers_the_effective_visibility(client, stop_in):
    stop = stop_in("public")
    memory = create_memory(client, stop_id=stop["id"], visibility="link")
    client.patch(f"/api/trips/{stop['trip_id']}", json={"visibility": "private"})

    after = client.get(f"/api/memories/{memory['id']}").json()
    assert after["visibility"] == "link"
    assert after["effective_visibility"] == "private"


def test_loose_memory_creates_an_auto_trip(client, user):
    memory = create_memory(
        client,
        place=place("Kioto", KYOTO, "2025-03-13"),
        body="Fushimi Inari al amanecer",
        visibility="link",
    )
    trip = client.get(f"/api/trips/{memory['trip_id']}").json()
    assert trip["is_auto"] is True
    assert trip["title"] == "Kioto · mar 2025"
    assert trip["visibility"] == "link"
    assert len(trip["stops"]) == 1
    assert trip["stops"][0]["city"]["name_es"] == "Kioto"
    assert memory["visibility"] is None
    assert memory["effective_visibility"] == "link"

    # El viaje automático se puede renombrar.
    renamed = client.patch(f"/api/trips/{trip['id']}", json={"title": "Kioto en primavera"})
    assert renamed.json()["title"] == "Kioto en primavera"


def test_memory_needs_exactly_one_of_stop_or_place(client, stop_in):
    stop = stop_in()
    both = {"stop_id": stop["id"], "place": place("Kioto", KYOTO, "2025-03-13")}
    assert client.post("/api/memories", json=both).status_code == 422
    assert client.post("/api/memories", json={"body": "sin lugar"}).status_code == 422


def test_memory_with_monument_and_filters(client, stop_in, monuments):
    stop = stop_in()
    other = stop_in()
    memory = create_memory(client, stop_id=stop["id"], monument_id=monuments["fushimi-inari"])
    create_memory(client, stop_id=other["id"])

    assert memory["monument"]["stamp_code"] == "INA"
    by_trip = client.get("/api/memories", params={"trip_id": stop["trip_id"]}).json()
    assert [m["id"] for m in by_trip] == [memory["id"]]
    assert len(client.get("/api/memories").json()) == 2


def test_unknown_monument_is_rejected(client, stop_in):
    response = client.post("/api/memories", json={"stop_id": stop_in()["id"], "monument_id": 10**9})
    assert response.status_code == 422


def test_delete_memory(client, stop_in):
    memory = create_memory(client, stop_id=stop_in()["id"])
    assert client.delete(f"/api/memories/{memory['id']}").status_code == 204
    assert client.get(f"/api/memories/{memory['id']}").status_code == 404


@pytest.mark.parametrize(
    ("name", "day", "title"),
    [
        ("Kioto", "2025-03-13", "Kioto · mar 2025"),
        ("Veracruz", "2020-08-15", "Veracruz · ago 2020"),
    ],
)
def test_auto_trip_title(name, day, title):
    assert auto_trip_title(name, date.fromisoformat(day)) == title
