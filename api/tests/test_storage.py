"""StorageBackend en disco."""

import pytest

from app.storage import DiskStorage


def test_save_open_and_delete(tmp_path):
    storage = DiskStorage(tmp_path)
    storage.save("users/u1/photos/p1/original.jpg", b"jpeg", "image/jpeg")
    with storage.open("users/u1/photos/p1/original.jpg") as f:
        assert f.read() == b"jpeg"

    storage.delete("users/u1/photos/p1/original.jpg")
    storage.delete("users/u1/photos/p1/original.jpg")  # no falla si ya no existe
    with pytest.raises(FileNotFoundError):
        storage.open("users/u1/photos/p1/original.jpg")


def test_delete_prefix_removes_everything_below(tmp_path):
    storage = DiskStorage(tmp_path)
    for variant in ("original", "display", "thumb"):
        storage.save(f"users/u1/photos/p1/{variant}.jpg", b"x", "image/jpeg")
    storage.save("users/u2/photos/p2/original.jpg", b"x", "image/jpeg")

    storage.delete_prefix("users/u1")
    assert not (tmp_path / "users/u1").exists()
    assert (tmp_path / "users/u2/photos/p2/original.jpg").exists()
    storage.delete_prefix("users/u1")  # idempotente


def test_url(tmp_path):
    assert DiskStorage(tmp_path).url("users/u1/a.jpg") == "/api/files/users/u1/a.jpg"


@pytest.mark.parametrize("key", ["", "/etc/passwd", "../fuera.jpg", "users/../../x"])
def test_rejects_keys_outside_the_root(tmp_path, key):
    storage = DiskStorage(tmp_path)
    with pytest.raises(ValueError):
        storage.save(key, b"x", "image/jpeg")
