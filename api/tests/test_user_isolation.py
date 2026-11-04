"""Un usuario no ve ni toca nada de otro: siempre 404 o listas vacías."""

from tests.helpers import KYOTO, TOKYO, add_stop, create_memory, create_trip, place


def test_second_user_sees_nothing_from_the_first(client, make_user, act_as):
    ana = make_user("ana", home_city="Ciudad de México")
    beto = make_user("beto")

    act_as(ana)
    trip = create_trip(client, "Japón", visibility="public")
    stop = add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))
    memory = create_memory(client, stop_id=stop["id"], body="Privado de Ana")
    client.put("/api/me/wishlist/ISL")

    act_as(beto)
    assert client.get("/api/trips").json() == []
    assert client.get("/api/memories").json() == []
    assert client.get(f"/api/trips/{trip['id']}").status_code == 404
    assert client.get(f"/api/stops/{stop['id']}").status_code == 404
    assert client.get(f"/api/memories/{memory['id']}").status_code == 404
    assert client.get("/api/memories", params={"trip_id": trip["id"]}).json() == []

    body = client.get("/api/me/progress").json()
    assert body["countries"]["visited"] == 0
    assert body["subdivisions"]["visited"] == 0
    assert body["trips"] == body["cities"] == body["wishlist"] == 0
    assert client.get("/api/me/map").json() == {"countries": [], "subdivisions": [], "wishlist": []}


def test_second_user_cannot_change_the_first_users_data(client, make_user, act_as):
    ana = make_user("ana")
    beto = make_user("beto")

    act_as(ana)
    trip = create_trip(client, "Japón")
    stop = add_stop(client, trip["id"], place("Kioto", KYOTO, "2025-03-13"))
    memory = create_memory(client, stop_id=stop["id"])

    act_as(beto)
    own = create_trip(client, "Mío")
    tokyo = place("Tokio", TOKYO, "2025-03-08")
    assert client.patch(f"/api/trips/{trip['id']}", json={"title": "x"}).status_code == 404
    assert client.delete(f"/api/trips/{trip['id']}").status_code == 404
    assert client.post(f"/api/trips/{trip['id']}/stops", json=tokyo).status_code == 404
    assert (
        client.put(f"/api/trips/{trip['id']}/stops/order", json={"stop_ids": [stop["id"]]})
    ).status_code == 404
    assert client.patch(f"/api/stops/{stop['id']}", json={"note": "x"}).status_code == 404
    assert client.delete(f"/api/stops/{stop['id']}").status_code == 404
    assert client.post("/api/memories", json={"stop_id": stop["id"]}).status_code == 404
    assert client.patch(f"/api/memories/{memory['id']}", json={"body": "x"}).status_code == 404
    assert client.delete(f"/api/memories/{memory['id']}").status_code == 404

    # Tampoco puede mover un recuerdo suyo a una parada ajena.
    own_stop = add_stop(client, own["id"], tokyo)
    own_memory = create_memory(client, stop_id=own_stop["id"])
    response = client.patch(f"/api/memories/{own_memory['id']}", json={"stop_id": stop["id"]})
    assert response.status_code == 404

    act_as(ana)
    still = client.get(f"/api/trips/{trip['id']}").json()
    assert still["title"] == "Japón" and still["stop_count"] == 1
