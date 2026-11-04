"""Las pruebas usan una BD propia (huella_test) que se crea y migra al empezar la sesión."""

import os

# Debe ir antes de importar la app: get_settings() lee DATABASE_URL al primer uso.
TEST_DATABASE_URL = os.environ["TEST_DATABASE_URL"]
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from collections.abc import Callable, Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.deps import SessionDep, get_current_user
from app.main import app
from app.models import City, User
from app.storage import DiskStorage, get_storage


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
    """Carga países, estados, ciudades y monumentos reales en huella_test (solo la primera vez).

    Usa la caché de descargas (~/.cache/huella/geo); la BD de pruebas conserva los datos
    entre corridas, así que después de la primera vez esto no tarda nada. Si cambió el
    catálogo de monumentos, se vuelve a cargar solo ese.
    """
    from app.db import get_engine
    from app.geo import monuments
    from app.geo.load import LoadReport, is_loaded, load_all, load_monuments

    engine = get_engine()
    if not is_loaded(engine):
        load_all(engine)
    elif not monuments.is_loaded(engine):
        load_monuments(engine, LoadReport())


# --- Datos del usuario -------------------------------------------------------------------


@pytest.fixture
def db(geo_data: None) -> Iterator[Session]:
    """Sesión directa a huella_test. Al terminar vacía los datos de usuario (los catálogos
    geográficos y de monumentos se quedan)."""
    from app.db import get_engine

    session = Session(get_engine())
    try:
        yield session
    finally:
        session.rollback()
        session.execute(text("TRUNCATE users RESTART IDENTITY CASCADE"))
        session.commit()
        session.close()


@pytest.fixture
def monuments(db: Session) -> dict[str, int]:
    """Slug → id del catálogo de monumentos."""
    from app.seed import monument_ids

    return monument_ids(db)


@pytest.fixture
def storage(tmp_path: Path) -> Iterator[DiskStorage]:
    """Almacenamiento en una carpeta temporal, también para la API."""
    disk = DiskStorage(tmp_path / "photos")
    app.dependency_overrides[get_storage] = lambda: disk
    yield disk
    app.dependency_overrides.pop(get_storage, None)


@pytest.fixture
def make_user(db: Session) -> Callable[..., User]:
    def _make(handle: str = "ana", home_city: str | None = None) -> User:
        home_city_id = None
        if home_city is not None:
            home_city_id = db.scalar(
                select(City.id).where(City.name_es == home_city).order_by(City.population.desc())
            )
            assert home_city_id is not None, home_city
        user = User(handle=handle, display_name=handle.title(), home_city_id=home_city_id)
        db.add(user)
        db.commit()
        return user

    return _make


@pytest.fixture
def act_as() -> Callable[[User], None]:
    """Hace que la API actúe como `user` (reemplaza a get_current_user)."""

    def _act_as(user: User) -> None:
        user_id = user.id

        def _current(session: SessionDep) -> User:
            return session.get(User, user_id)

        app.dependency_overrides[get_current_user] = _current

    return _act_as


@pytest.fixture
def user(make_user: Callable[..., User], act_as: Callable[[User], None]) -> User:
    """Un usuario sin casa, ya activo en la API."""
    user = make_user("ana")
    act_as(user)
    return user
