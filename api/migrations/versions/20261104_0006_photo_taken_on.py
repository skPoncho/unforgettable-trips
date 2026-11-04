"""photos.taken_on: fecha local de la toma (la del reloj de la cámara)

`taken_at` es un instante (timestamptz) y al pasarlo a UTC puede cambiar de día: una foto
de las 8:00 en Kioto (+09:00) es del día anterior en UTC. Las sugerencias de fecha del
recuerdo usan `taken_on`.

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("photos", sa.Column("taken_on", sa.Date(), nullable=True))
    op.execute("UPDATE photos SET taken_on = (taken_at AT TIME ZONE 'UTC')::date")
    # Limpieza de fotos sin recuerdo (las de más de 24 h se borran en cada subida).
    op.create_index(
        "ix_photos_orphans",
        "photos",
        ["user_id", "created_at"],
        postgresql_where=sa.text("memory_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_photos_orphans", table_name="photos")
    op.drop_column("photos", "taken_on")
