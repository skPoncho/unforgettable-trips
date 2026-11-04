"""Nuevo recuerdo: sugerencias desde las fotos y guardado (parada, viaje automático, "encender")."""

import pytest

from tests.helpers import (
    KYOTO,
    TOKYO,
    add_stop,
    create_memory,
    create_trip,
    place,
    upload_ids,
)


@pytest.fixture
def japan(client, user):
    """Viaje a Japón como el de las semillas: Tokio 8–11 y Kioto 13–16 de marzo de 2025."""
    trip = create_trip(client, "Japón 2025", visibility="link")
    tokyo = add_stop(
        client, trip["id"], place("Tokio", TOKYO, "2025-03-08", departed_on="2025-03-11")
    )
    kyoto = add_stop(
        client, trip["id"], place("Kioto", KYOTO, "2025-03-13", departed_on="2025-03-16")
    )
    return {"trip": trip, "tokyo": tokyo, "kyoto": kyoto}


def _suggest(client, **data):
    response = client.post("/api/memories/suggest", json=data)
    assert response.status_code == 200, response.text
    return response.json()


# --- Sugerencias ---------------------------------------------------------------------------


def test_kyoto_photo_suggests_place_date_monument_and_trip(client, user, monuments, japan):
    """Criterio de la fase 4: kioto_gps.jpg (35.01 N, 135.77 E, 13 mar 2025)."""
    photo_ids = upload_ids(client, "kioto_gps.jpg")
    found = _suggest(client, photo_ids=photo_ids)

    assert found["photo_count"] == 1
    assert found["located_count"] == 1
    assert found["place"]["place_name"] == "Kioto"
    assert found["place"]["country"] == {"iso3": "JPN", "name_es": "Japón"}
    assert found["arrived_on"] == found["departed_on"] == "2025-03-13"
    # Fushimi Inari queda a ~4.8 km del centro de Kioto (radio de 5 km).
    assert [m["slug"] for m in found["monuments"]] == ["fushimi-inari"]
    assert found["monuments"][0]["distance_km"] == pytest.approx(4.8, abs=0.1)
    (trip,) = found["trips"]
    assert trip["title"] == "Japón 2025"
    assert trip["visibility"] == "link"
    assert trip["stop_id"] == japan["kyoto"]["id"]


def test_suggestion_without_gps(client, user):
    found = _suggest(client, photo_ids=upload_ids(client, "sin_gps.jpg"))
    assert found["located_count"] == 0
    assert found["place"] is None
    assert found["monuments"] == []
    assert found["arrived_on"] == "2025-03-14"
    assert found["trips"] == []


def test_suggestion_takes_the_date_range_and_the_median_place(client, user, japan):
    photo_ids = upload_ids(client, "kioto_gps.jpg", "sin_gps.jpg")
    found = _suggest(client, photo_ids=photo_ids)
    assert found["photo_count"] == 2
    assert found["located_count"] == 1
    assert (found["arrived_on"], found["departed_on"]) == ("2025-03-13", "2025-03-14")
    assert found["place"]["place_name"] == "Kioto"


def test_changing_the_place_recomputes_monuments_and_trip_stop(client, user, monuments, japan):
    photo_ids = upload_ids(client, "kioto_gps.jpg")
    lon, lat = TOKYO
    found = _suggest(client, photo_ids=photo_ids, location={"lon": lon, "lat": lat})
    assert found["place"]["place_name"] == "Tokio"
    assert found["monuments"] == []  # Sensō-ji queda a más de 5 km del centro
    # El 13 de marzo no estabas en Tokio: el viaje se sugiere, pero sin parada.
    assert found["trips"][0]["stop_id"] is None

    found = _suggest(
        client,
        photo_ids=photo_ids,
        location={"lon": lon, "lat": lat},
        arrived_on="2025-03-09",
        departed_on="2025-03-09",
    )
    assert found["trips"][0]["stop_id"] == japan["tokyo"]["id"]


def test_trips_with_other_dates_are_not_suggested(client, user):
    trip = create_trip(client, "Japón 2019")
    add_stop(client, trip["id"], place("Kioto", KYOTO, "2019-04-01"))
    found = _suggest(client, photo_ids=upload_ids(client, "kioto_gps.jpg"))
    assert found["trips"] == []


def test_suggest_with_photos_of_another_user_is_404(client, make_user, act_as, storage):
    act_as(make_user("ana"))
    photo_ids = upload_ids(client, "kioto_gps.jpg")
    act_as(make_user("beto"))
    response = client.post("/api/memories/suggest", json={"photo_ids": photo_ids})
    assert response.status_code == 404


# --- Guardado ------------------------------------------------------------------------------


def _kyoto_place(**extra):
    return place("Kioto", KYOTO, "2025-03-13", **extra)


def test_saving_in_a_trip_reuses_the_stop_of_the_same_city(client, user, storage, japan):
    photo_ids = upload_ids(client, "kioto_gps.jpg", "sin_gps.jpg")
    memory = create_memory(
        client,
        trip_id=japan["trip"]["id"],
        place=_kyoto_place(),
        photo_ids=photo_ids,
        body="Toriis al amanecer",
    )
    assert memory["stop_id"] == japan["kyoto"]["id"]
    assert memory["photo_count"] == 2
    assert memory["occurred_on"] == "2025-03-13"  # la de la primera foto
    assert memory["effective_visibility"] == "link"
    # Japón ya estaba encendido.
    assert memory["lit"] == {"countries": [], "subdivisions": [], "cities": []}

    trip = client.get(f"/api/trips/{japan['trip']['id']}").json()
    assert trip["stop_count"] == 2
    assert trip["cover_photo_id"] == photo_ids[0]  # la primera foto es la portada


def test_photo_order_is_kept(client, user, storage, japan):
    first, second = upload_ids(client, "kioto_gps.jpg", "sin_gps.jpg")
    create_memory(
        client,
        trip_id=japan["trip"]["id"],
        place=_kyoto_place(),
        photo_ids=[second, first],
    )
    trip = client.get(f"/api/trips/{japan['trip']['id']}").json()
    assert trip["cover_photo_id"] == second


def test_saving_in_a_trip_adds_a_stop_in_date_order(client, user, storage, japan):
    hakone = place("Hakone", (139.0250, 35.1950), "2025-03-12")
    memory = create_memory(client, trip_id=japan["trip"]["id"], place=hakone)

    trip = client.get(f"/api/trips/{japan['trip']['id']}").json()
    assert [s["place_name"] for s in trip["stops"]] == ["Tokio", "Hakone", "Kioto"]
    assert memory["stop_id"] == trip["stops"][1]["id"]


def test_reykjavik_photo_lights_up_iceland(client, user, storage):
    """Criterio de la fase 4: al guardar una foto de Reikiavik, Islandia se enciende."""
    photo_ids = upload_ids(client, "reikiavik_gps.jpg")
    found = _suggest(client, photo_ids=photo_ids)
    assert found["place"]["country"]["iso3"] == "ISL"
    assert found["arrived_on"] == "2024-07-02"

    suggested = found["place"]
    memory = create_memory(
        client,
        place={
            "place_name": suggested["place_name"],
            "location": suggested["location"],
            "arrived_on": found["arrived_on"],
            "city_id": suggested["city"]["id"],
        },
        photo_ids=photo_ids,
        visibility="private",
    )
    assert memory["lit"]["countries"] == ["ISL"]
    assert memory["lit"]["cities"] == [suggested["city"]["id"]]

    trip = client.get(f"/api/trips/{memory['trip_id']}").json()
    assert trip["is_auto"] is True
    assert trip["title"] == f"{suggested['place_name']} · jul 2024"
    world = client.get("/api/me/map").json()
    assert {"iso3": "ISL", "status": "visited"}.items() <= next(
        c for c in world["countries"] if c["iso3"] == "ISL"
    ).items()


def test_a_stay_after_a_stopover_lights_the_country_up(client, user):
    """Pasar de escala a visitado también cuenta como "encender"."""
    trip = create_trip(client)
    add_stop(
        client,
        trip["id"],
        place("Tocumen", (-79.3835, 9.0714), "2025-03-07", visit_type="stopover"),
    )
    memory = create_memory(
        client, place=place("Panamá", (-79.5199, 8.9824), "2025-12-01"), body="Canal"
    )
    assert memory["lit"]["countries"] == ["PAN"]


def test_visibility_cannot_be_more_open_than_the_chosen_trip(client, user, japan):
    response = client.post(
        "/api/memories",
        json={"trip_id": japan["trip"]["id"], "place": _kyoto_place(), "visibility": "public"},
    )
    assert response.status_code == 422


def test_trip_id_needs_a_place(client, user, japan):
    response = client.post(
        "/api/memories", json={"trip_id": japan["trip"]["id"], "stop_id": japan["kyoto"]["id"]}
    )
    assert response.status_code == 422


def test_photos_already_in_a_memory_or_repeated_are_rejected(client, user, storage, japan):
    (photo_id,) = upload_ids(client, "kioto_gps.jpg")
    create_memory(client, stop_id=japan["kyoto"]["id"], photo_ids=[photo_id])

    again = client.post(
        "/api/memories", json={"stop_id": japan["kyoto"]["id"], "photo_ids": [photo_id]}
    )
    assert again.status_code == 422
    assert "otro recuerdo" in again.json()["detail"]
    repeated = client.post(
        "/api/memories",
        json={"stop_id": japan["kyoto"]["id"], "photo_ids": [photo_id, photo_id]},
    )
    assert repeated.status_code == 422


def test_failed_save_keeps_nothing(client, user, storage, japan):
    """Si las fotos no son válidas, no queda ni el viaje automático."""
    trips_before = len(client.get("/api/trips").json())
    response = client.post(
        "/api/memories",
        json={"place": _kyoto_place(), "photo_ids": ["00000000-0000-0000-0000-000000000000"]},
    )
    assert response.status_code == 404
    assert len(client.get("/api/trips").json()) == trips_before


def test_photos_of_another_user_cannot_be_attached(client, make_user, act_as, storage):
    act_as(make_user("ana"))
    photo_ids = upload_ids(client, "kioto_gps.jpg")
    act_as(make_user("beto"))
    response = client.post("/api/memories", json={"place": _kyoto_place(), "photo_ids": photo_ids})
    assert response.status_code == 404
