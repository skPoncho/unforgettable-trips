"""Búsqueda del encabezado: tus lugares, viajes y recuerdos (docs/PLAN.md, fase 7)."""

import pytest

from app.services.search import snippet
from tests.helpers import KYOTO, OAXACA, TOCUMEN, add_stop, create_memory, create_trip, place


def search(client, q: str, **params) -> dict:
    response = client.get("/api/search", params={"q": q, **params})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def japan(client, user, monuments) -> dict:
    trip = create_trip(client, "Japón", summary="Templos y ramen")
    add_stop(client, trip["id"], place("Tocumen", TOCUMEN, "2025-03-08", visit_type="stopover"))
    add_stop(client, trip["id"], place("Tokio", (139.6917, 35.6895), "2025-03-08"))
    stop = add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))
    memory = create_memory(
        client,
        stop_id=stop["id"],
        body="Subimos Fushimi Inari a las siete de la mañana para evitar a la gente.",
        monument_id=monuments["fushimi-inari"],
    )
    return {"trip": trip, "memory": memory}


def test_kioto_finds_the_city_the_trip_and_the_memory(client, japan):
    body = search(client, "kioto")

    city = body["places"][0]
    assert (city["kind"], city["name"], city["context"]) == ("city", "Kioto", "Japón")
    # Lleva a la estancia en Kioto: la escala en Tocumen no cuenta, Kioto es la 2.
    assert (city["trip_id"], city["stop_number"]) == (japan["trip"]["id"], 2)

    assert [(t["title"], t["matched_place"]) for t in body["trips"]] == [("Japón", "Kioto")]

    [memory] = body["memories"]
    assert memory["id"] == japan["memory"]["id"]
    assert memory["monument_name"] == "Fushimi Inari-taisha"
    assert (memory["trip_title"], memory["stop_number"]) == ("Japón", 2)
    assert memory["snippet"].startswith("Subimos Fushimi Inari")


@pytest.mark.parametrize("q", ["KIOTO", "Kiotó", "kiotto", "Kyoto", " kioto  "])
def test_ignores_case_accents_typos_and_uses_the_original_name(client, japan, q):
    assert [p["name"] for p in search(client, q)["places"]] == ["Kioto"]


def test_a_memory_matches_by_its_text_and_its_monument(client, japan):
    assert [m["id"] for m in search(client, "manana")["memories"]] == [japan["memory"]["id"]]
    body = search(client, "fushimi")
    assert [p["kind"] for p in body["places"]] == ["monument"]
    assert body["places"][0]["key"] == "fushimi-inari"
    assert body["places"][0]["stop_number"] == 2


def test_a_trip_matches_by_title_or_summary_without_matched_place(client, japan):
    assert search(client, "japon")["trips"][0]["matched_place"] is None
    assert search(client, "ramen")["trips"][0]["title"] == "Japón"
    # El país también es un lugar tuyo; la escala en Panamá también cuenta.
    assert [p["kind"] for p in search(client, "japon")["places"]] == ["country"]
    assert [p["name"] for p in search(client, "panama")["places"]] == ["Panamá"]


def test_only_your_places_are_found(client, japan):
    # Hay muchas ciudades llamadas Oaxaca o Lima en el catálogo, pero no las visitaste.
    assert search(client, "lima") == {"places": [], "trips": [], "memories": []}


def test_the_home_is_a_place(client, make_user, act_as):
    act_as(make_user("ana", home_city="Ciudad de México"))
    [home] = [p for p in search(client, "ciudad de mexico")["places"] if p["kind"] == "city"]
    assert home["is_home"] is True
    assert home["trip_id"] is None


def test_states_of_mexico_come_with_their_country(client, user):
    trip = create_trip(client, "Oaxaca")
    add_stop(client, trip["id"], place("Oaxaca", OAXACA, "2024-12-20"))
    places = search(client, "oaxaca")["places"]
    state = next(p for p in places if p["kind"] == "subdivision")
    assert (state["key"], state["context"]) == ("MX-OAX", "México")


def test_like_wildcards_are_literal(client, japan):
    assert search(client, "%%") == {"places": [], "trips": [], "memories": []}
    assert search(client, "k_oto")["places"] == []


def test_another_user_sees_nothing(client, japan, make_user, act_as):
    act_as(make_user("beto"))
    assert search(client, "kioto") == {"places": [], "trips": [], "memories": []}


def test_limits(client, japan):
    assert client.get("/api/search", params={"q": "k"}).status_code == 422
    assert client.get("/api/search", params={"q": "kioto", "limit": 11}).status_code == 422
    assert len(search(client, "io", limit=1)["places"]) <= 1


def test_snippet_centers_on_the_match():
    body = "Uno dos tres cuatro cinco seis siete ocho nueve diez. " * 3 + "El Gran Buda de Nara."
    cut = snippet(body, "buda")
    assert cut.startswith("…") and "Gran Buda de Nara." in cut
    assert snippet("Corto y sin coincidencia", "zzz") == "Corto y sin coincidencia"
