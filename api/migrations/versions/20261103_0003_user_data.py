"""Datos del usuario: users, trips, stops, memories, photos, wishlist_items y monuments

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# El orden de visibility va de más privada a más abierta: así LEAST() da la efectiva.
VISIBILITY = postgresql.ENUM("private", "link", "public", name="visibility", create_type=False)
VISIT_TYPE = postgresql.ENUM("stay", "stopover", name="visit_type", create_type=False)
THEME = postgresql.ENUM("system", "dark", "light", name="theme", create_type=False)
MONUMENT_KIND = postgresql.ENUM(
    "unesco", "archaeological", "other", name="monument_kind", create_type=False
)
ENUMS = (VISIBILITY, VISIT_TYPE, THEME, MONUMENT_KIND)


def _uuid_pk() -> sa.Column:
    return sa.Column("id", sa.Uuid, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _user_fk() -> sa.Column:
    return sa.Column(
        "user_id", sa.Uuid, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )


def _timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def _point(name: str, nullable: bool = False) -> sa.Column:
    return sa.Column(name, Geometry("POINT", srid=4326, spatial_index=False), nullable=nullable)


def _gist(table: str, column: str) -> None:
    op.create_index(f"ix_{table}_{column}", table, [column], postgresql_using="gist")


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    for enum in ENUMS:
        enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "monuments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("slug", sa.Text, nullable=False, unique=True),
        sa.Column("name_es", sa.Text, nullable=False),
        sa.Column("stamp_code", sa.Text, nullable=False),
        sa.Column("kind", MONUMENT_KIND, nullable=False),
        sa.Column("country_id", sa.Integer, sa.ForeignKey("countries.id"), nullable=False),
        sa.Column("subdivision_id", sa.Integer, sa.ForeignKey("subdivisions.id")),
        sa.Column("city_id", sa.Integer, sa.ForeignKey("cities.id")),
        _point("location"),
        sa.Column("source", sa.Text, nullable=False),
        sa.Column("source_ref", sa.Text),
    )
    op.create_index("ix_monuments_country_id", "monuments", ["country_id"])
    op.create_index("ix_monuments_subdivision_id", "monuments", ["subdivision_id"])
    _gist("monuments", "location")

    op.create_table(
        "users",
        _uuid_pk(),
        sa.Column("email", postgresql.CITEXT, unique=True),
        sa.Column("handle", sa.Text, nullable=False, unique=True),
        sa.Column("display_name", sa.Text, nullable=False),
        sa.Column("home_city_id", sa.Integer, sa.ForeignKey("cities.id")),
        sa.Column("theme", THEME, nullable=False, server_default="system"),
        sa.Column("profile_public", sa.Boolean, nullable=False, server_default=sa.false()),
        _timestamp("created_at"),
    )

    op.create_table(
        "trips",
        _uuid_pk(),
        _user_fk(),
        sa.Column("title", sa.Text, nullable=False),
        sa.Column("summary", sa.Text),
        sa.Column("visibility", VISIBILITY, nullable=False, server_default="private"),
        sa.Column("share_token", sa.Text, unique=True),
        # Las FK de estas dos se agregan después de crear photos y memories.
        sa.Column("cover_photo_id", sa.Uuid),
        sa.Column("favorite_memory_id", sa.Uuid),
        sa.Column("is_auto", sa.Boolean, nullable=False, server_default=sa.false()),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    op.create_index("ix_trips_user_id", "trips", ["user_id"])

    op.create_table(
        "stops",
        _uuid_pk(),
        sa.Column(
            "trip_id", sa.Uuid, sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False
        ),
        _user_fk(),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("visit_type", VISIT_TYPE, nullable=False, server_default="stay"),
        sa.Column("place_name", sa.Text, nullable=False),
        sa.Column("city_id", sa.Integer, sa.ForeignKey("cities.id")),
        sa.Column("country_id", sa.Integer, sa.ForeignKey("countries.id"), nullable=False),
        sa.Column("subdivision_id", sa.Integer, sa.ForeignKey("subdivisions.id")),
        _point("location"),
        sa.Column("arrived_on", sa.Date, nullable=False),
        sa.Column("departed_on", sa.Date, nullable=False),
        sa.Column("note", sa.Text),
        sa.CheckConstraint("departed_on >= arrived_on", name="ck_stops_dates"),
        # Diferida para poder reordenar las paradas dentro de una transacción.
        sa.UniqueConstraint(
            "trip_id",
            "position",
            name="uq_stops_trip_position",
            deferrable=True,
            initially="DEFERRED",
        ),
    )
    for column in ("trip_id", "user_id", "city_id", "country_id", "subdivision_id"):
        op.create_index(f"ix_stops_{column}", "stops", [column])
    _gist("stops", "location")

    op.create_table(
        "memories",
        _uuid_pk(),
        _user_fk(),
        sa.Column(
            "stop_id", sa.Uuid, sa.ForeignKey("stops.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("monument_id", sa.Integer, sa.ForeignKey("monuments.id", ondelete="SET NULL")),
        sa.Column("body", sa.Text, nullable=False, server_default=""),
        sa.Column("occurred_on", sa.Date),
        # NULL = hereda la del viaje.
        sa.Column("visibility", VISIBILITY),
        _timestamp("created_at"),
        _timestamp("updated_at"),
    )
    for column in ("user_id", "stop_id", "monument_id"):
        op.create_index(f"ix_memories_{column}", "memories", [column])

    op.create_table(
        "photos",
        _uuid_pk(),
        _user_fk(),
        sa.Column("memory_id", sa.Uuid, sa.ForeignKey("memories.id", ondelete="SET NULL")),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.Column("storage_key", sa.Text, nullable=False),
        sa.Column("mime", sa.Text, nullable=False),
        sa.Column("width", sa.Integer, nullable=False),
        sa.Column("height", sa.Integer, nullable=False),
        sa.Column("bytes", sa.BigInteger, nullable=False),
        sa.Column("sha256", sa.Text, nullable=False),
        sa.Column("taken_at", sa.DateTime(timezone=True)),
        _point("location", nullable=True),
        _timestamp("created_at"),
        sa.UniqueConstraint("user_id", "sha256", name="uq_photos_user_sha256"),
    )
    op.create_index("ix_photos_user_id", "photos", ["user_id"])
    op.create_index("ix_photos_memory_id", "photos", ["memory_id"])

    op.create_foreign_key(
        "fk_trips_cover_photo_id",
        "trips",
        "photos",
        ["cover_photo_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_trips_favorite_memory_id",
        "trips",
        "memories",
        ["favorite_memory_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "wishlist_items",
        _uuid_pk(),
        _user_fk(),
        sa.Column("country_id", sa.Integer, sa.ForeignKey("countries.id"), nullable=False),
        _timestamp("created_at"),
        sa.UniqueConstraint("user_id", "country_id", name="uq_wishlist_user_country"),
    )
    op.create_index("ix_wishlist_items_user_id", "wishlist_items", ["user_id"])


def downgrade() -> None:
    op.drop_table("wishlist_items")
    op.drop_constraint("fk_trips_favorite_memory_id", "trips", type_="foreignkey")
    op.drop_constraint("fk_trips_cover_photo_id", "trips", type_="foreignkey")
    for table in ("photos", "memories", "stops", "trips", "users", "monuments"):
        op.drop_table(table)
    for enum in ENUMS:
        enum.drop(op.get_bind(), checkfirst=True)
    op.execute("DROP EXTENSION IF EXISTS citext")
