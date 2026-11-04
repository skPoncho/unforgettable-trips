"""Detalle de viaje (fase 5): recuerdos y fotos por parada, km de ruta y lugar en tu historia."""

import pytest

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


def _japan(client):
    trip = create_trip(client, "Japón", visibility="public")
    add_stop(
        client,
        trip["id"],
        place("Aeropuerto de Tocumen", TOCUMEN, "2025-03-08", visit_type="stopover"),
    )
    tokyo = add_stop(
        client, trip["id"], place("Tokio", TOKYO, "2025-03-08", departed_on="2025-03-11")
    )
    kyoto = add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))
    return trip, tokyo, kyoto


def test_stops_bring_their_memories_and_photos_in_order(client, db, storage, user):
    trip, tokyo, kyoto = _japan(client)
    memory = create_memory(client, stop_id=kyoto["id"], body="Fushimi Inari al amanecer")
    first = add_photo(db, storage, user, memory["id"])
    second = add_photo(db, storage, user, memory["id"])
    second.position, first.position = 0, 1
    db.commit()

    detail = client.get(f"/api/trips/{trip['id']}").json()
    by_name = {s["place_name"]: s for s in detail["stops"]}
    assert by_name["Tokio"]["memories"] == []
    [kyoto_memory] = by_name["Kioto"]["memories"]
    assert kyoto_memory["body"] == "Fushimi Inari al amanecer"
    assert kyoto_memory["effective_visibility"] == "public"
    assert [p["id"] for p in kyoto_memory["photos"]] == [str(second.id), str(first.id)]
    assert kyoto_memory["photos"][0] == {"id": str(second.id), "width": 1, "height": 1}


def test_route_km_joins_stays_and_ignores_stopovers(client, user):
    trip, _, _ = _japan(client)
    detail = client.get(f"/api/trips/{trip['id']}").json()
    # Tokio → Kioto en línea recta son ~364 km; con la escala en Panamá serían más de 13 000.
    assert detail["route_km"] == pytest.approx(364, abs=5)
    assert detail["continent"] == "asia"


def test_route_km_is_zero_with_a_single_stay(client, user):
    trip = create_trip(client, "Centro")
    add_stop(client, trip["id"], place("Zócalo", ZOCALO, "2024-01-02"))
    assert client.get(f"/api/trips/{trip['id']}").json()["route_km"] == 0
    empty = create_trip(client, "Sin paradas")
    body = client.get(f"/api/trips/{empty['id']}").json()
    assert (body["route_km"], body["continent"]) == (0, None)


def test_trip_number_counts_from_the_oldest(client, user):
    recent, _, _ = _japan(client)
    older = create_trip(client, "Ciudad de México")
    add_stop(client, older["id"], place("Zócalo", ZOCALO, "2024-01-02"))
    no_stops = create_trip(client, "Sin paradas")

    def number(trip):
        body = client.get(f"/api/trips/{trip['id']}").json()
        return body["trip_number"], body["trip_total"]

    assert number(older) == (1, 3)
    assert number(recent) == (2, 3)
    assert number(no_stops) == (3, 3)  # sin fechas, al final


def test_patch_response_is_the_full_detail(client, user):
    trip, _, kyoto = _japan(client)
    memory = create_memory(client, stop_id=kyoto["id"], body="El favorito")
    body = client.patch(
        f"/api/trips/{trip['id']}",
        json={"visibility": "link", "favorite_memory_id": memory["id"]},
    ).json()
    assert body["visibility"] == "link" and body["share_token"]
    assert body["favorite_memory_id"] == memory["id"]
    assert body["stops"][2]["memories"][0]["effective_visibility"] == "link"
    assert client.get(f"/api/trips/{trip['id']}").json()["visibility"] == "link"


def test_other_users_trip_detail_is_404(client, make_user, act_as):
    ana = make_user("ana")
    act_as(ana)
    trip, _, _ = _japan(client)
    act_as(make_user("beto"))
    assert client.get(f"/api/trips/{trip['id']}").status_code == 404
