"""Progreso y mapa: las reglas de docs/PRODUCTO.md (escalas, casa, territorios)."""

from tests.helpers import (
    KYOTO,
    OAXACA,
    SAN_JUAN_PR,
    TOCUMEN,
    ZOCALO,
    add_stop,
    create_trip,
    place,
)


def progress(client) -> dict:
    response = client.get("/api/me/progress")
    assert response.status_code == 200
    return response.json()


def country_status(client) -> dict[str, dict]:
    return {c["iso3"]: c for c in client.get("/api/me/map").json()["countries"]}


def continent(body: dict, name: str) -> int:
    return next(c["visited"] for c in body["continents"] if c["continent"] == name)


def test_empty_user_has_zero_of_195(client, user):
    body = progress(client)
    assert body["countries"] == {"visited": 0, "total": 195, "stopover_only": 0}
    assert [(c["continent"], c["total"]) for c in body["continents"]] == [
        ("america", 35),
        ("europe", 44),
        ("asia", 48),
        ("africa", 54),
        ("oceania", 14),
    ]
    assert body["subdivisions"] == {"country_iso3": "MEX", "visited": 0, "total": 32}
    assert client.get("/api/me/map").json() == {"countries": [], "subdivisions": [], "wishlist": []}


def test_a_stopover_counts_as_a_visit(client, user):
    trip = create_trip(client)
    add_stop(client, trip["id"], place("Tocumen", TOCUMEN, "2025-03-08", visit_type="stopover"))

    body = progress(client)
    assert body["countries"]["visited"] == 1
    assert body["countries"]["stopover_only"] == 1
    assert continent(body, "america") == 1


def test_a_country_with_only_stopovers_is_marked_stopover(client, user):
    trip = create_trip(client)
    add_stop(client, trip["id"], place("Tocumen", TOCUMEN, "2025-03-08", visit_type="stopover"))
    add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-09"))

    statuses = country_status(client)
    assert statuses["PAN"]["status"] == "stopover"
    assert statuses["PAN"]["first_visited_on"] == "2025-03-08"
    assert statuses["JPN"]["status"] == "visited"


def test_a_stay_wins_over_a_stopover(client, user):
    first = create_trip(client, "Escala")
    add_stop(client, first["id"], place("Tocumen", TOCUMEN, "2023-01-01", visit_type="stopover"))
    second = create_trip(client, "Panamá")
    add_stop(client, second["id"], place("Tocumen", TOCUMEN, "2024-05-01"))

    pan = country_status(client)["PAN"]
    assert pan["status"] == "visited"
    assert pan["first_visited_on"] == "2023-01-01"
    assert progress(client)["countries"]["stopover_only"] == 0


def test_home_counts_as_visited(client, make_user, act_as):
    act_as(make_user("carlos", home_city="Ciudad de México"))

    body = progress(client)
    assert body["countries"]["visited"] == 1
    assert body["subdivisions"]["visited"] == 1
    assert body["cities"] == 1

    statuses = country_status(client)
    assert statuses["MEX"] == {
        "iso3": "MEX",
        "status": "visited",
        "first_visited_on": None,
        "is_home": True,
        "counts_in_progress": True,
    }
    subdivision = client.get("/api/me/map").json()["subdivisions"][0]
    assert subdivision["code"] == "MX-CMX" and subdivision["is_home"] is True

    me = client.get("/api/me").json()
    assert me["home_city"]["name_es"] == "Ciudad de México"
    assert me["home_city"]["subdivision_code"] == "MX-CMX"


def test_home_and_stops_in_the_same_place_count_once(client, make_user, act_as):
    act_as(make_user("carlos", home_city="Ciudad de México"))
    trip = create_trip(client)
    add_stop(client, trip["id"], place("Zócalo", ZOCALO, "2024-01-01"))
    add_stop(client, trip["id"], place("Oaxaca", OAXACA, "2024-01-03"))

    body = progress(client)
    assert body["countries"]["visited"] == 1
    assert body["subdivisions"]["visited"] == 2
    assert body["cities"] == 2


def test_territories_are_painted_but_do_not_count(client, user):
    trip = create_trip(client)
    add_stop(client, trip["id"], place("San Juan", SAN_JUAN_PR, "2024-01-01"))

    assert progress(client)["countries"]["visited"] == 0
    assert country_status(client)["PRI"]["counts_in_progress"] is False


def test_wishlist(client, user):
    assert client.put("/api/me/wishlist/isl").status_code == 204
    assert client.put("/api/me/wishlist/ISL").status_code == 204  # idempotente
    assert client.put("/api/me/wishlist/ARG").status_code == 204
    assert client.put("/api/me/wishlist/XXX").status_code == 404

    wishlist = client.get("/api/me/wishlist").json()
    assert [w["name_es"] for w in wishlist] == ["Islandia", "Argentina"]
    assert client.get("/api/me/map").json()["wishlist"] == ["ARG", "ISL"]
    assert progress(client)["wishlist"] == 2

    assert client.delete("/api/me/wishlist/ISL").status_code == 204
    assert client.get("/api/me/map").json()["wishlist"] == ["ARG"]


def test_without_seed_user_the_api_asks_to_run_seed(client, db):
    response = client.get("/api/me/progress")
    assert response.status_code == 503
    assert "make seed" in response.json()["detail"]
