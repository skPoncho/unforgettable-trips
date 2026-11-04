"""Las pruebas usan una BD propia (huella_test) que se crea y migra al empezar la sesión."""

import os

# Debe ir antes de importar la app: get_settings() lee DATABASE_URL al primer uso.
TEST_DATABASE_URL = os.environ["TEST_DATABASE_URL"]
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from collections.abc import Iterator

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.main import app


def _create_test_database(url: str) -> None:
    target = make_url(url)
    admin = create_engine(target.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": target.database}
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{target.database}"'))
    admin.dispose()


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    _create_test_database(TEST_DATABASE_URL)
    config = Config("alembic.ini")
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    command.upgrade(config, "head")


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def geo_data(migrated_database: None) -> None:
    """Carga países, estados y ciudades reales en huella_test (solo la primera vez).

    Usa la caché de descargas (~/.cache/huella/geo); la BD de pruebas conserva los datos
    entre corridas, así que después de la primera vez esto no tarda nada.
    """
    from app.db import get_engine
    from app.geo.load import is_loaded, load_all

    if not is_loaded(get_engine()):
        load_all(get_engine())
