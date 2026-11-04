from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.db import get_session
from app.main import app


def test_health_reports_db_and_postgis(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
    assert body["postgis"].startswith("3.")


class _BrokenSession:
    def execute(self, *args, **kwargs):
        raise OperationalError("SELECT 1", {}, Exception("sin conexión"))


def test_health_returns_503_when_db_fails(client: TestClient) -> None:
    app.dependency_overrides[get_session] = lambda: _BrokenSession()

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"status": "error", "db": "error", "postgis": None}
