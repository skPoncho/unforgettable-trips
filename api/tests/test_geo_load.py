"""El cargador de datos geográficos es idempotente y respeta la convención."""

import pytest
from sqlalchemy import text

from app.db import get_engine
from app.geo.load import load_all

pytestmark = pytest.mark.usefixtures("geo_data")

SNAPSHOT = text(
    """
    SELECT (SELECT count(*) FROM countries),
           (SELECT count(*) FROM countries WHERE counts_in_progress),
           (SELECT count(*) FROM subdivisions),
           (SELECT count(*) FROM cities),
           (SELECT md5(string_agg(iso3 || ST_AsBinary(geom)::text, ',' ORDER BY iso3))
              FROM countries)
    """
)


def test_load_is_idempotent():
    engine = get_engine()
    with engine.connect() as conn:
        before = conn.execute(SNAPSHOT).one()
    # Sin ciudades para que la prueba sea rápida; las ciudades usan el mismo upsert.
    load_all(engine, with_cities=False)
    with engine.connect() as conn:
        after = conn.execute(SNAPSHOT).one()
    assert before == after


def test_every_country_has_geometry_and_label():
    with get_engine().connect() as conn:
        missing = (
            conn.execute(
                text("SELECT iso3 FROM countries WHERE geom IS NULL OR label_point IS NULL")
            )
            .scalars()
            .all()
        )
    assert missing == []


def test_folded_pieces_belong_to_their_country():
    with get_engine().connect() as conn:

        def country_at(lon: float, lat: float) -> str:
            return conn.execute(
                text(
                    "SELECT iso3 FROM countries "
                    "WHERE ST_Intersects(geom, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))"
                ),
                {"lon": lon, "lat": lat},
            ).scalar_one()

        assert country_at(33.36, 35.19) == "CYP"  # Nicosia norte
        assert country_at(44.06, 9.56) == "SOM"  # Hargeisa (Somalilandia)
        assert country_at(-52.33, 4.93) == "FRA"  # Cayena (Guayana Francesa)


def test_mexican_cities_are_linked_to_their_state():
    with get_engine().connect() as conn:
        unlinked = conn.execute(
            text(
                "SELECT count(*) FROM cities ci JOIN countries co ON co.id = ci.country_id "
                "WHERE co.iso3 = 'MEX' AND ci.subdivision_id IS NULL"
            )
        ).scalar_one()
    assert unlinked == 0
