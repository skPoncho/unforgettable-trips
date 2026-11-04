"""Subida de fotos: formatos, límites, duplicados, EXIF y variantes sin metadatos."""

import io
import uuid
from datetime import date, datetime, timedelta

import pytest
from PIL import Image
from pillow_heif import from_pillow
from sqlalchemy import func, select, update

from app.config import get_settings
from app.models import Photo
from app.seed.photos import canvas, photo_exif
from app.services.images import DISPLAY_SIZE, THUMB_SIZE
from tests.helpers import fixture_bytes, upload, upload_ids

_GPS_IFD = 0x8825


def _open(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


def _stored(storage, photo_id: str, variant: str) -> bytes:
    with storage.open(f"users/{_owner(storage, photo_id)}/photos/{photo_id}/{variant}.jpg") as f:
        return f.read()


def _owner(storage, photo_id: str) -> str:
    # users/{user_id}/photos/{photo_id}: el único directorio de usuario de la prueba.
    (user_dir,) = (storage.root / "users").iterdir()
    return user_dir.name


def test_upload_reads_date_and_gps_from_exif(client, user, storage):
    body = upload(client, "kioto_gps.jpg")
    assert body["errors"] == []
    (photo,) = body["photos"]
    assert photo["filename"] == "kioto_gps.jpg"
    assert photo["duplicate"] is False
    assert photo["memory_id"] is None
    assert photo["location"] == {"lon": pytest.approx(135.77), "lat": pytest.approx(35.01)}
    # 8:10 en Kioto (+09:00) es el día anterior en UTC; la fecha local se conserva.
    assert photo["taken_on"] == "2025-03-13"
    assert photo["taken_at"].startswith("2025-03-12T23:10:00")
    assert (photo["width"], photo["height"]) == (1200, 800)


def test_display_and_thumb_have_no_gps_nor_exif(client, user, storage):
    (photo_id,) = upload_ids(client, "kioto_gps.jpg")

    original = _open(_stored(storage, photo_id, "original"))
    assert original.getexif().get_ifd(_GPS_IFD), "el original conserva el GPS"
    for variant in ("display", "thumb"):
        data = _stored(storage, photo_id, variant)
        image = _open(data)
        assert not image.getexif(), variant
        assert not image.getexif().get_ifd(_GPS_IFD), variant
        assert "exif" not in image.info and "icc_profile" not in image.info

    # Lo mismo al pedirla por la API.
    served = client.get(f"/api/photos/{photo_id}/display")
    assert served.status_code == 200
    assert not _open(served.content).getexif()


def test_variants_are_resized(client, user, storage):
    big = canvas("Grande", "4000 px", 1).resize((4000, 3000))
    buffer = io.BytesIO()
    big.save(buffer, "JPEG")
    (photo_id,) = upload_ids(client, ("grande.jpg", buffer.getvalue()))

    assert max(_open(_stored(storage, photo_id, "display")).size) == DISPLAY_SIZE
    assert max(_open(_stored(storage, photo_id, "thumb")).size) == THUMB_SIZE


def test_upload_is_rotated_by_its_exif_orientation(client, user, storage):
    exif = Image.Exif()
    exif[0x0112] = 6  # girada 90°: la foto se ve vertical
    buffer = io.BytesIO()
    canvas("Vertical", "", 2).save(buffer, "JPEG", exif=exif)
    (photo,) = upload(client, ("vertical.jpg", buffer.getvalue()))["photos"]

    assert (photo["width"], photo["height"]) == (800, 1200)
    assert _open(_stored(storage, photo["id"], "display")).size == (800, 1200)


def test_png_and_heic_are_converted_to_jpeg(client, user, storage):
    png = io.BytesIO()
    canvas("PNG", "", 4).convert("RGBA").save(png, "PNG")
    heic = io.BytesIO()
    image = canvas("HEIC", "", 5)
    exif = photo_exif(datetime(2025, 3, 14, 10, 0), 135.77, 35.01).tobytes()
    from_pillow(image).save(heic, format="HEIF", exif=exif)

    body = upload(client, ("captura.png", png.getvalue()), ("IMG_0001.HEIC", heic.getvalue()))
    assert body["errors"] == []
    png_photo, heic_photo = body["photos"]
    assert heic_photo["taken_on"] == "2025-03-14"
    assert heic_photo["location"]["lat"] == pytest.approx(35.01)
    assert png_photo["location"] is None
    for photo in body["photos"]:
        for variant in ("original", "display", "thumb"):
            assert _open(_stored(storage, photo["id"], variant)).format == "JPEG"
    # El original de HEIC sigue con su EXIF; las variantes no.
    assert _open(_stored(storage, heic_photo["id"], "original")).getexif().get_ifd(_GPS_IFD)


def test_bad_files_are_rejected_one_by_one(client, user, storage):
    gif = io.BytesIO()
    Image.new("RGB", (4, 4)).save(gif, "GIF")
    body = upload(
        client,
        ("notas.txt", b"no soy una foto"),
        ("animada.gif", gif.getvalue()),
        "sin_gps.jpg",
    )
    assert [p["filename"] for p in body["photos"]] == ["sin_gps.jpg"]
    assert body["photos"][0]["location"] is None
    errors = {e["filename"]: e["detail"] for e in body["errors"]}
    assert errors == {
        "notas.txt": "El archivo no es una imagen válida",
        "animada.gif": "Formato no aceptado: usa JPG, PNG o HEIC",
    }


def test_too_big_or_too_many(client, user, storage, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "max_photo_bytes", 10_000)
    body = upload(client, "kioto_gps.jpg")
    assert body["photos"] == []
    assert body["errors"][0]["detail"] == "Pesa más de 0 MB"

    monkeypatch.setattr(settings, "max_photos_per_upload", 1)
    files = [("files", ("a.jpg", b"x", "image/jpeg")), ("files", ("b.jpg", b"y", "image/jpeg"))]
    response = client.post("/api/photos", files=files)
    assert response.status_code == 422
    assert "Máximo 1 fotos" in response.json()["detail"]


def test_same_photo_twice_is_one_photo(client, user, storage, db):
    first = upload(client, "kioto_gps.jpg")["photos"][0]
    again = upload(client, "kioto_gps.jpg", "kioto_gps.jpg")["photos"]

    assert [p["id"] for p in again] == [first["id"], first["id"]]
    assert all(p["duplicate"] for p in again)
    assert db.scalar(select(func.count()).select_from(Photo)) == 1
    assert len(list((storage.root / "users").glob("*/photos/*"))) == 1


def test_another_user_can_upload_the_same_photo(client, make_user, act_as, storage):
    act_as(make_user("ana"))
    (ana,) = upload_ids(client, "kioto_gps.jpg")
    act_as(make_user("beto"))
    (beto,) = upload_ids(client, "kioto_gps.jpg")
    assert ana != beto


def test_orphans_older_than_a_day_are_purged_on_upload(client, user, storage, db):
    (old,) = upload_ids(client, "sin_gps.jpg")
    db.execute(
        update(Photo)
        .where(Photo.id == uuid.UUID(old))
        .values(created_at=Photo.created_at - timedelta(hours=25))
    )
    db.commit()

    (new,) = upload_ids(client, "kioto_gps.jpg")
    db.expire_all()
    assert db.get(Photo, uuid.UUID(old)) is None
    assert db.get(Photo, uuid.UUID(new)) is not None
    assert not (storage.root / "users" / str(user.id) / "photos" / old).exists()


def test_delete_photo(client, user, storage, db):
    (photo_id,) = upload_ids(client, "kioto_gps.jpg")
    assert client.delete(f"/api/photos/{photo_id}").status_code == 204
    assert client.get(f"/api/photos/{photo_id}/thumb").status_code == 404
    assert not list((storage.root / "users").glob("*/photos/*"))


def test_photos_of_another_user_are_404(client, make_user, act_as, storage):
    act_as(make_user("ana"))
    (photo_id,) = upload_ids(client, "kioto_gps.jpg")
    act_as(make_user("beto"))
    assert client.get(f"/api/photos/{photo_id}/display").status_code == 404
    assert client.delete(f"/api/photos/{photo_id}").status_code == 404


def test_fixtures_are_up_to_date(tmp_path):
    """tests/fixtures se regenera con python -m app.seed.fixtures."""
    from app.seed.fixtures import write_fixtures

    for path in write_fixtures(tmp_path):
        assert path.read_bytes() == fixture_bytes(path.name), path.name


def test_fixture_dates():
    from app.services.images import process_upload

    assert process_upload(fixture_bytes("reikiavik_gps.jpg")).taken_on == date(2024, 7, 2)
    assert process_upload(fixture_bytes("sin_gps.jpg")).lon is None
