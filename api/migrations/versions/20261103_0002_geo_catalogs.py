"""Catálogos geográficos: countries, subdivisions y cities

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONTINENT = sa.Enum("america", "europe", "asia", "africa", "oceania", name="continent")


def upgrade() -> None:
    # Búsqueda sin acentos (autocompletar ciudades). unaccent() no es IMMUTABLE,
    # así que se envuelve para poder usarla en un índice.
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
        RETURN public.unaccent('public.unaccent'::regdictionary, $1)
        """
    )

    op.create_table(
        "countries",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("iso2", sa.CHAR(2), nullable=False, unique=True),
        sa.Column("iso3", sa.CHAR(3), nullable=False, unique=True),
        sa.Column("iso_numeric", sa.CHAR(3)),
        sa.Column("name_es", sa.Text, nullable=False),
        sa.Column("continent", CONTINENT, nullable=False),
        sa.Column("counts_in_progress", sa.Boolean, nullable=False),
        sa.Column("sovereign_id", sa.Integer, sa.ForeignKey("countries.id")),
        sa.Column("geom", Geometry("MULTIPOLYGON", srid=4326, spatial_index=False)),
        sa.Column("label_point", Geometry("POINT", srid=4326, spatial_index=False)),
    )
    op.create_index("ix_countries_geom", "countries", ["geom"], postgresql_using="gist")

    op.create_table(
        "subdivisions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("country_id", sa.Integer, sa.ForeignKey("countries.id"), nullable=False),
        sa.Column("code", sa.Text, nullable=False, unique=True),
        sa.Column("name_es", sa.Text, nullable=False),
        sa.Column("geonames_admin1", sa.Text, nullable=False),
        sa.Column("geom", Geometry("MULTIPOLYGON", srid=4326, spatial_index=False)),
    )
    op.create_index("ix_subdivisions_country_id", "subdivisions", ["country_id"])
    op.create_index("ix_subdivisions_geom", "subdivisions", ["geom"], postgresql_using="gist")

    op.create_table(
        "cities",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("name_es", sa.Text, nullable=False),
        sa.Column("country_id", sa.Integer, sa.ForeignKey("countries.id"), nullable=False),
        sa.Column("subdivision_id", sa.Integer, sa.ForeignKey("subdivisions.id")),
        sa.Column("location", Geometry("POINT", srid=4326, spatial_index=False), nullable=False),
        sa.Column("population", sa.Integer, nullable=False),
    )
    op.create_index("ix_cities_country_id", "cities", ["country_id"])
    op.create_index("ix_cities_subdivision_id", "cities", ["subdivision_id"])
    op.create_index("ix_cities_location", "cities", ["location"], postgresql_using="gist")
    op.execute(
        "CREATE INDEX ix_cities_name_es_trgm ON cities "
        "USING gin (f_unaccent(lower(name_es)) gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_cities_name_trgm ON cities "
        "USING gin (f_unaccent(lower(name)) gin_trgm_ops)"
    )


def downgrade() -> None:
    op.drop_table("cities")
    op.drop_table("subdivisions")
    op.drop_table("countries")
    CONTINENT.drop(op.get_bind(), checkfirst=True)
    op.execute("DROP FUNCTION IF EXISTS f_unaccent(text)")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
    op.execute("DROP EXTENSION IF EXISTS unaccent")
