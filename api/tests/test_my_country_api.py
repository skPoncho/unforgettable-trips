"""Mi país (fase 6): estados, ciudades, pasaporte de monumentos y ciudad de casa."""

from sqlalchemy import select

from app.db import get_engine
from app.models import City
from app.seed import seed
from tests.helpers import (
    OAXACA,
    TOCUMEN,
    add_photo,
    add_stop,
    create_memory,
    create_trip,
    place,
)

MONTE_ALBAN = (-96.7678, 17.0439)
PALENQUE = (-92.0463, 17.4838)


def mexico(client, what: str):
    response = client.get(f"/api/me/{what}", params={"country": "MEX"})
    assert response.status_code == 200, response.text
    return response.json()


def city_id(db, name: str) -> int:
    return db.scalar(select(City.id).where(City.name_es == name).order_by(City.population.desc()))


# --- Con las semillas: lo verificable de Mexico.dc.html ----------------------------------


def test_seed_shows_12_of_32_home_and_passport(client, db, storage):
    seed(get_engine(), storage, with_photos=False)

    states = mexico(client, "subdivisions")
    assert len(states) == 32
    visited = [s["name_es"] for s in states if s["status"]]
    assert len(visited) == 12
    assert visited == sorted(visited, key=lambda n: n.replace("é", "e").replace("á", "a"))
    cdmx = next(s for s in states if s["code"] == "MX-CMX")
    assert cdmx["is_home"] is True and cdmx["first_visited_on"] is None
    assert next(s for s in states if s["code"] == "MX-ZAC")["status"] is None

    cities = mexico(client, "cities")
    assert cities[0]["name_es"] == "Ciudad de México"
    assert cities[0]["is_home"] is True

    passport = mexico(client, "passport")
    stamps = [s["stamp_code"] for s in passport["stamps"]]
    # Los 8 sellos de la maqueta, del primero al más reciente.
    assert stamps == ["TEO", "CHI", "TUL", "PUE", "GTO", "HC", "MA", "PAL"]
    chichen = passport["stamps"][1]
    assert chichen["first_stamped_on"].startswith("2021")
    assert chichen["subdivision_name"] == "Yucatán"
    assert chichen["trip"]["title"] == "Yucatán"
    assert chichen["trip"]["stop_number"] == 2

    suggested = passport["suggested"]
    assert len(suggested) == 4
    assert not {s["slug"] for s in suggested} & {s["slug"] for s in passport["stamps"]}
    assert len({s["subdivision_code"] for s in suggested}) == 4  # uno por estado
    assert [s["distance_km"] for s in suggested] == sorted(s["distance_km"] for s in suggested)


def test_changing_home_updates_progress(client, db, storage):
    seed(get_engine(), storage, with_photos=False)
    monterrey = city_id(db, "Monterrey")

    response = client.patch("/api/me", json={"home_city_id": monterrey})
    assert response.status_code == 200, response.text
    assert response.json()["home_city"]["subdivision_code"] == "MX-NLE"

    # En las semillas CDMX solo contaba por ser la casa: sale ella y entra Nuevo León.
    states = {s["code"]: s for s in mexico(client, "subdivisions")}
    assert states["MX-NLE"]["is_home"] is True
    assert states["MX-NLE"]["status"] == "visited"
    assert states["MX-CMX"]["status"] is None
    assert client.get("/api/me/progress").json()["subdivisions"]["visited"] == 12
    assert mexico(client, "cities")[0]["name_es"] == "Monterrey"

    # Con casa en Puebla (ya visitada por viaje) se pierde CDMX y no entra nada nuevo.
    client.patch("/api/me", json={"home_city_id": city_id(db, "Puebla de Zaragoza")})
    assert client.get("/api/me/progress").json()["subdivisions"]["visited"] == 11


# --- Sin semillas ---------------------------------------------------------------------------


def test_empty_user_sees_every_state_to_discover(client, user):
    states = mexico(client, "subdivisions")
    assert len(states) == 32
    assert all(s["status"] is None and not s["is_home"] for s in states)
    assert mexico(client, "cities") == []
    assert mexico(client, "passport") == {"country_iso3": "MEX", "stamps": [], "suggested": []}


def test_unknown_country_is_404(client, user):
    for what in ("subdivisions", "cities", "passport"):
        assert client.get(f"/api/me/{what}", params={"country": "XXX"}).status_code == 404


def test_country_without_states_has_no_subdivisions(client, user):
    assert client.get("/api/me/subdivisions", params={"country": "JPN"}).json() == []


def test_home_alone_suggests_monuments_near_home(client, db, make_user, act_as):
    act_as(make_user("bea", home_city="Oaxaca de Juárez"))
    suggested = mexico(client, "passport")["suggested"]
    assert suggested[0]["slug"] == "centro-historico-oaxaca"
    assert suggested[0]["near"] == "Oaxaca de Juárez"
    assert suggested[0]["distance_km"] < 2


def test_stamp_card_counts_photos_and_links_the_first_memory(client, user, db, storage, monuments):
    trip = create_trip(client, "Oaxaca y Chiapas")
    add_stop(client, trip["id"], place("Tocumen", TOCUMEN, "2024-12-19", visit_type="stopover"))
    oaxaca = add_stop(client, trip["id"], place("Oaxaca", OAXACA, "2024-12-20"))
    palenque = add_stop(client, trip["id"], place("Palenque", PALENQUE, "2024-12-27"))
    first = create_memory(client, stop_id=oaxaca["id"], monument_id=monuments["monte-alban"])
    for _ in range(4):
        add_photo(db, storage, user, first["id"])
    later = create_memory(
        client,
        stop_id=palenque["id"],
        monument_id=monuments["monte-alban"],
        occurred_on="2024-12-28",
    )
    add_photo(db, storage, user, later["id"])

    [stamp] = mexico(client, "passport")["stamps"]
    assert stamp["slug"] == "monte-alban"
    assert stamp["stamp_code"] == "MA"
    assert stamp["kind"] == "unesco"
    assert (stamp["memories"], stamp["photo_count"], len(stamp["photo_ids"])) == (2, 5, 3)
    # La escala no cuenta en la numeración: Oaxaca es la estancia 1.
    assert stamp["trip"] == {"id": trip["id"], "title": "Oaxaca y Chiapas", "stop_number": 1}
    assert stamp["first_stamped_on"] == "2024-12-20"


def test_a_stamp_from_a_stopover_has_no_stop_number(client, user, monuments):
    trip = create_trip(client)
    stop = add_stop(
        client, trip["id"], place("Monte Albán", MONTE_ALBAN, "2024-12-20", visit_type="stopover")
    )
    create_memory(client, stop_id=stop["id"], monument_id=monuments["monte-alban"])
    [stamp] = mexico(client, "passport")["stamps"]
    assert stamp["trip"]["stop_number"] is None


def test_other_users_see_nothing(client, user, make_user, act_as, monuments):
    trip = create_trip(client)
    stop = add_stop(client, trip["id"], place("Oaxaca", OAXACA, "2024-12-20"))
    create_memory(client, stop_id=stop["id"], monument_id=monuments["monte-alban"])

    act_as(make_user("otro"))
    assert mexico(client, "cities") == []
    assert all(s["status"] is None for s in mexico(client, "subdivisions"))
    assert mexico(client, "passport")["stamps"] == []


# --- Ciudad de casa ---------------------------------------------------------------------------


def test_patch_me_sets_and_clears_home(client, user, db):
    oaxaca = city_id(db, "Oaxaca de Juárez")
    body = client.patch("/api/me", json={"home_city_id": oaxaca}).json()
    assert body["home_city"] == {
        "id": oaxaca,
        "name_es": "Oaxaca de Juárez",
        "country_iso3": "MEX",
        "subdivision_code": "MX-OAX",
    }
    assert client.get("/api/me/progress").json()["countries"]["visited"] == 1

    assert client.patch("/api/me", json={}).json()["home_city"]["id"] == oaxaca  # sin cambios
    assert client.patch("/api/me", json={"home_city_id": None}).json()["home_city"] is None
    assert client.get("/api/me/progress").json()["countries"]["visited"] == 0


def test_patch_me_rejects_unknown_city(client, user):
    assert client.patch("/api/me", json={"home_city_id": 10**9}).status_code == 422
