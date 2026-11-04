"""Mi mapa (fase 3): ciudades y monumentos del mapa, tarjeta de país y fotos."""

from tests.helpers import (
    KYOTO,
    TOCUMEN,
    TOKYO,
    ZOCALO,
    add_photo,
    add_stop,
    create_memory,
    create_trip,
    place,
)


def world_map(client) -> dict:
    response = client.get("/api/me/map")
    assert response.status_code == 200
    return response.json()


def country(client, iso3: str) -> dict:
    response = client.get(f"/api/me/countries/{iso3}")
    assert response.status_code == 200, response.text
    return response.json()


# --- Ciudades y monumentos del mapa --------------------------------------------------------


def test_map_lists_visited_cities_with_their_point(client, user):
    trip = create_trip(client)
    add_stop(client, trip["id"], place("Tokio", TOKYO, "2025-03-08", departed_on="2025-03-11"))
    add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-12"))

    cities = {c["name_es"]: c for c in world_map(client)["cities"]}
    assert set(cities) == {"Tokio", "Kioto"}
    assert cities["Kioto"]["country_iso3"] == "JPN"
    assert cities["Kioto"]["status"] == "visited"
    assert cities["Kioto"]["first_visited_on"] == "2025-03-12"
    assert abs(cities["Kioto"]["location"]["lon"] - KYOTO[0]) < 0.1


def test_home_city_is_on_the_map_since_always(client, make_user, act_as):
    act_as(make_user("carlos", home_city="Ciudad de México"))

    [home] = world_map(client)["cities"]
    assert home["name_es"] == "Ciudad de México"
    assert home["is_home"] is True
    assert home["first_visited_on"] is None
    assert client.get("/api/me/progress").json()["cities"] == 1


def test_a_stopover_without_city_adds_no_city(client, user):
    trip = create_trip(client)
    add_stop(client, trip["id"], place("Tocumen", TOCUMEN, "2025-03-08", visit_type="stopover"))

    assert world_map(client)["cities"] == []


def test_map_lists_stamped_monuments(client, user, monuments):
    trip = create_trip(client)
    stop = add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))
    create_memory(client, stop_id=stop["id"], monument_id=monuments["fushimi-inari"])

    [stamp] = world_map(client)["monuments"]
    assert stamp["slug"] == "fushimi-inari"
    assert stamp["country_iso3"] == "JPN"
    assert stamp["first_stamped_on"] == "2025-03-13"


# --- Tarjeta de país -----------------------------------------------------------------------


def test_country_summary_counts_days_cities_monuments_and_photos(
    client, user, db, storage, monuments
):
    trip = create_trip(client, "Japón", visibility="public")
    add_stop(client, trip["id"], place("Tocumen", TOCUMEN, "2025-03-08", visit_type="stopover"))
    tokyo = add_stop(
        client, trip["id"], place("Tokio", TOKYO, "2025-03-08", departed_on="2025-03-11")
    )
    # Se encima un día con Tokio: los días se cuentan una sola vez.
    kyoto = add_stop(
        client, trip["id"], place("Kioto", KYOTO, "2025-03-11", departed_on="2025-03-14")
    )
    memory = create_memory(client, stop_id=kyoto["id"], monument_id=monuments["fushimi-inari"])
    first = add_photo(db, storage, user, memory["id"])
    add_photo(db, storage, user, create_memory(client, stop_id=tokyo["id"])["id"])

    body = country(client, "jpn")
    assert body["name_es"] == "Japón"
    assert body["status"] == "visited"
    assert (body["first_visited_on"], body["last_visited_on"]) == ("2025-03-08", "2025-03-11")
    assert (body["days"], body["cities"], body["monuments"], body["photos"]) == (7, 2, 1, 2)
    assert str(first.id) in body["photo_ids"]
    assert [(t["title"], t["visit_type"]) for t in body["trips"]] == [("Japón", "stay")]
    assert body["trips"][0]["ends_on"] == "2025-03-14"
    assert body["stopovers"] == []


def test_country_summary_of_a_stopover(client, user):
    trip = create_trip(client, "Japón")
    add_stop(
        client,
        trip["id"],
        place("Aeropuerto de Tocumen", TOCUMEN, "2025-03-08", visit_type="stopover", note="3 h"),
    )

    body = country(client, "PAN")
    assert body["status"] == "stopover"
    assert body["days"] == 0
    assert body["trips"][0]["visit_type"] == "stopover"
    assert body["stopovers"] == [
        {"place_name": "Aeropuerto de Tocumen", "note": "3 h", "arrived_on": "2025-03-08"}
    ]


def test_country_summary_lists_trips_newest_first(client, user):
    for title, day in (("Primero", "2021-11-18"), ("Segundo", "2024-12-20")):
        trip = create_trip(client, title)
        add_stop(client, trip["id"], place("Zócalo", ZOCALO, day))

    assert [t["title"] for t in country(client, "MEX")["trips"]] == ["Segundo", "Primero"]


def test_home_country_summary(client, make_user, act_as):
    act_as(make_user("carlos", home_city="Ciudad de México"))

    body = country(client, "MEX")
    assert body["is_home"] is True
    assert body["first_visited_on"] is None
    assert body["last_visited_on"] is None
    assert (body["cities"], body["trips"]) == (1, [])


def test_country_summary_is_404_when_not_visited_or_unknown(client, user):
    assert client.get("/api/me/countries/ARG").status_code == 404
    assert client.get("/api/me/countries/XXX").status_code == 404


def test_country_summary_of_another_user_is_404(client, make_user, act_as):
    act_as(make_user("ana"))
    trip = create_trip(client)
    add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))

    act_as(make_user("beto"))
    assert client.get("/api/me/countries/JPN").status_code == 404


# --- Fotos ---------------------------------------------------------------------------------


def test_photo_variants_are_served_to_their_owner(client, user, db, storage):
    trip = create_trip(client)
    stop = add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))
    photo = add_photo(db, storage, user, create_memory(client, stop_id=stop["id"])["id"])

    for variant in ("display", "thumb"):
        response = client.get(f"/api/photos/{photo.id}/{variant}")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/jpeg"
        assert response.headers["cache-control"].startswith("private")
        assert response.content == variant.encode()


def test_original_with_exif_is_not_served(client, user, db, storage):
    trip = create_trip(client)
    stop = add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))
    photo = add_photo(db, storage, user, create_memory(client, stop_id=stop["id"])["id"])

    assert client.get(f"/api/photos/{photo.id}/original").status_code == 422


def test_photo_of_another_user_or_missing_file_is_404(client, make_user, act_as, db, storage):
    ana = make_user("ana")
    act_as(ana)
    trip = create_trip(client)
    stop = add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))
    photo = add_photo(db, storage, ana, create_memory(client, stop_id=stop["id"])["id"])
    storage.delete(f"{photo.storage_key}/thumb.jpg")
    assert client.get(f"/api/photos/{photo.id}/thumb").status_code == 404

    act_as(make_user("beto"))
    assert client.get(f"/api/photos/{photo.id}/display").status_code == 404
