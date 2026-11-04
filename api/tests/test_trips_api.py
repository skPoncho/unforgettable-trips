"""Viajes y paradas: CRUD, orden y lugar calculado desde el punto."""

import uuid

from sqlalchemy import func, select

from app.models import Memory, Photo, Stop
from tests.helpers import (
    KYOTO,
    OAXACA,
    OPEN_OCEAN,
    TOCUMEN,
    TOKYO,
    ZOCALO,
    add_photo,
    add_stop,
    create_memory,
    create_trip,
    place,
)


def test_create_and_list_trips(client, user):
    trip = create_trip(client, "Japón", summary="Primavera")
    assert trip["visibility"] == "private"
    assert trip["share_token"] is None
    assert trip["is_auto"] is False
    assert trip["stops"] == []
    assert trip["days"] == 0 and trip["starts_on"] is None

    listed = client.get("/api/trips").json()
    assert [t["title"] for t in listed] == ["Japón"]


def test_stop_place_is_computed_from_the_point(client, user):
    trip = create_trip(client)
    stop = add_stop(client, trip["id"], place("Centro", ZOCALO, "2024-01-02"))
    assert stop["country"] == {"iso3": "MEX", "name_es": "México"}
    assert stop["subdivision"] == {"code": "MX-CMX", "name_es": "Ciudad de México"}
    assert stop["city"]["name_es"] == "Ciudad de México"
    assert stop["departed_on"] == "2024-01-02"
    assert stop["visit_type"] == "stay"


def test_stopover_has_no_city_unless_given(client, user):
    trip = create_trip(client)
    stop = add_stop(
        client,
        trip["id"],
        place("Aeropuerto de Tocumen", TOCUMEN, "2025-03-08", visit_type="stopover"),
    )
    assert stop["country"]["iso3"] == "PAN"
    assert stop["city"] is None


def test_point_in_the_ocean_is_rejected(client, user):
    trip = create_trip(client)
    ocean = place("Mar", OPEN_OCEAN, "2024-01-01")
    response = client.post(f"/api/trips/{trip['id']}/stops", json=ocean)
    assert response.status_code == 422


def test_departure_before_arrival_is_rejected(client, user):
    trip = create_trip(client)
    stop = place("Kioto", KYOTO, "2025-03-13", departed_on="2025-03-10")
    assert client.post(f"/api/trips/{trip['id']}/stops", json=stop).status_code == 422


def test_trip_dates_and_counts_come_from_stops(client, user):
    trip = create_trip(client, "Japón")
    add_stop(client, trip["id"], place("Tocumen", TOCUMEN, "2025-03-08", visit_type="stopover"))
    add_stop(client, trip["id"], place("Tokio", TOKYO, "2025-03-08", departed_on="2025-03-11"))
    add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13", departed_on="2025-03-16"))

    detail = client.get(f"/api/trips/{trip['id']}").json()
    assert detail["starts_on"] == "2025-03-08"
    assert detail["ends_on"] == "2025-03-16"
    assert detail["days"] == 9
    assert detail["stop_count"] == 3
    assert detail["city_count"] == 2
    assert detail["countries"] == ["JPN"]
    assert detail["stopover_countries"] == ["PAN"]
    assert [s["position"] for s in detail["stops"]] == [0, 1, 2]


def test_insert_stop_at_position_and_reorder(client, user):
    trip = create_trip(client)
    tokyo = add_stop(client, trip["id"], place("Tokio", TOKYO, "2025-03-08"))
    kyoto = add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))
    first = add_stop(client, trip["id"], place("Tocumen", TOCUMEN, "2025-03-07", position=0))

    names = [s["place_name"] for s in client.get(f"/api/trips/{trip['id']}").json()["stops"]]
    assert names == ["Tocumen", "Tokio", "Kioto"]

    order = [kyoto["id"], first["id"], tokyo["id"]]
    response = client.put(f"/api/trips/{trip['id']}/stops/order", json={"stop_ids": order})
    assert response.status_code == 200
    assert [s["id"] for s in response.json()] == order
    assert [s["position"] for s in response.json()] == [0, 1, 2]


def test_reorder_requires_every_stop_once(client, user):
    trip = create_trip(client)
    a = add_stop(client, trip["id"], place("Tokio", TOKYO, "2025-03-08"))
    add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))
    url = f"/api/trips/{trip['id']}/stops/order"
    assert client.put(url, json={"stop_ids": [a["id"]]}).status_code == 422
    assert client.put(url, json={"stop_ids": [a["id"], a["id"]]}).status_code == 422


def test_delete_stop_renumbers_the_rest(client, user):
    trip = create_trip(client)
    add_stop(client, trip["id"], place("Tokio", TOKYO, "2025-03-08"))
    middle = add_stop(client, trip["id"], place("Tocumen", TOCUMEN, "2025-03-09"))
    add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))

    assert client.delete(f"/api/stops/{middle['id']}").status_code == 204
    stops = client.get(f"/api/trips/{trip['id']}").json()["stops"]
    assert [(s["place_name"], s["position"]) for s in stops] == [("Tokio", 0), ("Kioto", 1)]


def test_moving_a_stop_recomputes_its_place(client, user):
    trip = create_trip(client)
    stop = add_stop(client, trip["id"], place("Centro", ZOCALO, "2024-01-02"))
    moved = client.patch(
        f"/api/stops/{stop['id']}",
        json={"place_name": "Oaxaca", "location": {"lon": OAXACA[0], "lat": OAXACA[1]}},
    ).json()
    assert moved["subdivision"]["code"] == "MX-OAX"
    assert moved["city"]["name_es"] == "Oaxaca de Juárez"
    assert moved["place_name"] == "Oaxaca"


def test_stop_city_can_be_given_but_must_match_the_country(client, user):
    trip = create_trip(client)
    kyoto_id = add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))["city"]["id"]
    mismatch = place("Zócalo", ZOCALO, "2024-01-01", city_id=kyoto_id)
    assert client.post(f"/api/trips/{trip['id']}/stops", json=mismatch).status_code == 422

    given = add_stop(client, trip["id"], place("Fushimi", KYOTO, "2025-03-14", city_id=kyoto_id))
    assert given["city"]["id"] == kyoto_id
    no_city = add_stop(client, trip["id"], place("Templo", KYOTO, "2025-03-15", city_id=None))
    assert no_city["city"] is None


def test_link_visibility_creates_a_share_token(client, user):
    trip = create_trip(client)
    updated = client.patch(f"/api/trips/{trip['id']}", json={"visibility": "link"}).json()
    assert updated["visibility"] == "link"
    assert len(updated["share_token"]) > 10


def test_trip_title_cannot_be_null(client, user):
    trip = create_trip(client)
    assert client.patch(f"/api/trips/{trip['id']}", json={"title": None}).status_code == 422


def test_favorite_memory_must_belong_to_the_trip(client, user):
    trip = create_trip(client)
    other = create_trip(client, "Otro")
    stop = add_stop(client, other["id"], place("Kioto", KYOTO, "2025-03-13"))
    memory = create_memory(client, stop_id=stop["id"], body="…")

    url = f"/api/trips/{trip['id']}"
    assert client.patch(url, json={"favorite_memory_id": memory["id"]}).status_code == 422
    ok = client.patch(f"/api/trips/{other['id']}", json={"favorite_memory_id": memory["id"]})
    assert ok.json()["favorite_memory_id"] == memory["id"]


def test_first_photo_is_the_cover_until_one_is_chosen(client, user, db, storage):
    trip = create_trip(client)
    stop = add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))
    memory = create_memory(client, stop_id=stop["id"])
    first = add_photo(db, storage, user, memory["id"])
    second = add_photo(db, storage, user, memory["id"])
    db.execute(Photo.__table__.update().where(Photo.id == second.id).values(position=1))
    db.commit()

    assert client.get(f"/api/trips/{trip['id']}").json()["cover_photo_id"] == str(first.id)
    chosen = client.patch(f"/api/trips/{trip['id']}", json={"cover_photo_id": str(second.id)})
    assert chosen.json()["cover_photo_id"] == str(second.id)
    assert chosen.json()["photo_count"] == 2


def test_delete_trip_removes_stops_memories_and_photo_files(client, user, db, storage):
    trip = create_trip(client)
    stop = add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))
    memory = create_memory(client, stop_id=stop["id"])
    photo = add_photo(db, storage, user, memory["id"])
    photo_dir = storage.root / photo.storage_key
    assert photo_dir.exists()

    assert client.delete(f"/api/trips/{trip['id']}").status_code == 204
    assert client.get(f"/api/trips/{trip['id']}").status_code == 404
    db.expire_all()
    for model in (Stop, Memory, Photo):
        assert db.scalar(select(func.count()).select_from(model)) == 0
    assert not photo_dir.exists()


def test_unknown_trip_is_404(client, user):
    assert client.get(f"/api/trips/{uuid.uuid4()}").status_code == 404
    assert client.delete(f"/api/stops/{uuid.uuid4()}").status_code == 404
