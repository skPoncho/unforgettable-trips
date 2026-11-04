"""make seed: los totales verificables de las maquetas (docs/PLAN.md, fase 2)."""

import io

from PIL import Image
from sqlalchemy import func, select

from app.db import get_engine
from app.models import Photo, Trip
from app.seed import seed
from app.services.photos import variant_key


def test_seed_reproduces_the_mockups_and_is_idempotent(client, db, storage):
    seed(get_engine(), storage)
    report = seed(get_engine(), storage)  # la segunda vez reemplaza, no duplica
    assert report.photos == 412

    body = client.get("/api/me/progress").json()
    assert body["countries"] == {"visited": 12, "total": 195, "stopover_only": 1}
    assert {c["continent"]: c["visited"] for c in body["continents"]} == {
        "america": 7,
        "europe": 4,
        "asia": 1,
        "africa": 0,
        "oceania": 0,
    }
    assert body["subdivisions"] == {"country_iso3": "MEX", "visited": 12, "total": 32}
    assert body["monuments"] == 12
    assert body["photos"] == 412
    assert body["wishlist"] == 4
    assert db.scalar(select(func.count()).select_from(Trip)) == body["trips"]

    statuses = {c["iso3"]: c for c in client.get("/api/me/map").json()["countries"]}
    assert statuses["PAN"]["status"] == "stopover"
    assert statuses["MEX"]["is_home"] is True

    japan = next(t for t in client.get("/api/trips").json() if t["title"] == "Japón")
    assert (japan["days"], japan["city_count"], japan["photo_count"]) == (14, 6, 84)
    assert japan["monument_count"] == 4
    assert japan["stopover_countries"] == ["PAN"]
    assert japan["visibility"] == "public"
    detail = client.get(f"/api/trips/{japan['id']}").json()
    assert detail["stops"][0]["note"] == "3 h en Tocumen"
    stays = [s["place_name"] for s in detail["stops"] if s["visit_type"] == "stay"]
    assert stays[2] == "Kioto"  # el pin 3 de la maqueta
    # Detalle de viaje (fase 5): ruta solo entre estancias, monumentos y momento favorito.
    assert 700 < detail["route_km"] < 800
    assert detail["continent"] == "asia"
    memories = [m for s in detail["stops"] for m in s["memories"]]
    assert sum(len(m["photos"]) for m in memories) == 84
    assert len({m["monument"]["slug"] for m in memories if m["monument"]}) == 4
    favorite = next(m for m in memories if m["id"] == detail["favorite_memory_id"])
    assert "Fuji" in favorite["body"]  # Hakone, como en la maqueta

    # Solo quedan los archivos de la última corrida, y el original lleva EXIF con GPS.
    photo = db.scalars(select(Photo).limit(1)).one()
    files = [p for p in storage.root.rglob("*.jpg")]
    assert len(files) == 412 * 3
    with storage.open(variant_key(photo.storage_key, "original")) as f:
        assert Image.open(io.BytesIO(f.read())).getexif().get_ifd(0x8825)
    with storage.open(variant_key(photo.storage_key, "display")) as f:
        assert not Image.open(io.BytesIO(f.read())).getexif()
