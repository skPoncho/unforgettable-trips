"""Línea de tiempo (Reproduce tu historia): primera visita por año con las reglas del progreso."""

from datetime import date

from tests.helpers import KYOTO, OAXACA, SAN_JUAN_PR, TOCUMEN, add_stop, create_trip, place

THIS_YEAR = date.today().year


def timeline(client) -> dict:
    response = client.get("/api/me/timeline")
    assert response.status_code == 200, response.text
    return response.json()


def year(body: dict, n: int) -> dict:
    return next(y for y in body["years"] if y["year"] == n)


def test_empty_user_has_only_the_current_year(client, user):
    body = timeline(client)
    assert body["home"] == {"countries": [], "subdivisions": [], "cities": []}
    assert [y["year"] for y in body["years"]] == [THIS_YEAR]
    only = body["years"][0]
    assert only["countries"] == []
    assert only["progress"]["countries"] == {"visited": 0, "total": 195, "stopover_only": 0}
    assert only["progress"]["subdivisions"]["total"] == 32


def test_years_run_without_gaps_from_the_first_visit_to_today(client, user):
    trip = create_trip(client)
    add_stop(client, trip["id"], place("Kioto", KYOTO, "2021-03-13"))

    body = timeline(client)
    assert [y["year"] for y in body["years"]] == list(range(2021, THIS_YEAR + 1))
    assert year(body, 2021)["countries"] == [{"iso3": "JPN", "status": "visited"}]
    assert len(year(body, 2021)["cities"]) == 1
    assert year(body, 2022)["countries"] == []
    # El progreso es acumulado: Japón sigue contando los años siguientes.
    assert year(body, 2022)["progress"]["countries"]["visited"] == 1
    asia = next(c for c in year(body, 2022)["progress"]["continents"] if c["continent"] == "asia")
    assert asia == {"continent": "asia", "visited": 1, "total": 48}


def test_a_stopover_turns_visited_the_year_of_the_first_stay(client, user):
    first = create_trip(client, "Escala")
    add_stop(client, first["id"], place("Tocumen", TOCUMEN, "2022-06-01", visit_type="stopover"))
    second = create_trip(client, "Panamá")
    add_stop(client, second["id"], place("Tocumen", TOCUMEN, "2024-05-01"))

    body = timeline(client)
    assert year(body, 2022)["countries"] == [{"iso3": "PAN", "status": "stopover"}]
    assert year(body, 2022)["progress"]["countries"]["stopover_only"] == 1
    assert year(body, 2023)["progress"]["countries"]["stopover_only"] == 1
    assert year(body, 2024)["countries"] == [{"iso3": "PAN", "status": "visited"}]
    assert year(body, 2024)["progress"]["countries"] == {
        "visited": 1,
        "total": 195,
        "stopover_only": 0,
    }


def test_the_home_counts_from_the_first_year(client, make_user, act_as):
    act_as(make_user("ana", home_city="Ciudad de México"))
    trip = create_trip(client)
    add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))
    add_stop(client, trip["id"], place("Oaxaca", OAXACA, "2025-04-01"))

    body = timeline(client)
    assert body["home"]["countries"] == ["MEX"]
    assert body["home"]["subdivisions"] == ["MX-CMX"]
    assert len(body["home"]["cities"]) == 1
    first = body["years"][0]
    assert first["year"] == 2025
    # México no se vuelve a encender: ya estaba por la casa. Oaxaca sí es nuevo.
    assert first["countries"] == [{"iso3": "JPN", "status": "visited"}]
    assert first["subdivisions"] == [{"code": "MX-OAX", "status": "visited"}]
    assert first["progress"]["countries"]["visited"] == 2
    assert first["progress"]["subdivisions"]["visited"] == 2


def test_territories_light_up_but_do_not_count(client, user):
    trip = create_trip(client)
    add_stop(client, trip["id"], place("San Juan", SAN_JUAN_PR, "2023-01-10"))

    body = timeline(client)
    assert year(body, 2023)["countries"] == [{"iso3": "PRI", "status": "visited"}]
    assert year(body, 2023)["progress"]["countries"]["visited"] == 0


def test_the_last_year_matches_the_progress(client, make_user, act_as):
    act_as(make_user("ana", home_city="Ciudad de México"))
    trip = create_trip(client)
    add_stop(client, trip["id"], place("Tocumen", TOCUMEN, "2024-03-08", visit_type="stopover"))
    add_stop(client, trip["id"], place("Kioto", KYOTO, "2024-03-09"))

    last = timeline(client)["years"][-1]["progress"]
    progress = client.get("/api/me/progress").json()
    assert last["countries"] == progress["countries"]
    assert last["continents"] == progress["continents"]
    assert last["subdivisions"] == progress["subdivisions"]


def test_another_user_sees_nothing(client, make_user, act_as):
    act_as(make_user("ana"))
    trip = create_trip(client)
    add_stop(client, trip["id"], place("Kioto", KYOTO, "2021-03-13"))

    act_as(make_user("beto"))
    assert [y["year"] for y in timeline(client)["years"]] == [THIS_YEAR]
