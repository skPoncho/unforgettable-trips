"""Vista user_city_status: ciudades visitadas (puntos de luz del mapa)

Misma regla que países y estados: 'visited' si hay una estancia o es la casa, 'stopover'
si solo hay escalas; la casa cuenta desde siempre (first_visited_on nulo).

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-04
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE VIEW user_city_status AS
        WITH visits AS (
            SELECT s.user_id, s.city_id,
                   bool_or(s.visit_type = 'stay') AS has_stay,
                   min(s.arrived_on) AS first_on,
                   false AS is_home
            FROM stops s
            WHERE s.city_id IS NOT NULL
            GROUP BY s.user_id, s.city_id
            UNION ALL
            SELECT u.id, u.home_city_id, true, NULL, true
            FROM users u
            WHERE u.home_city_id IS NOT NULL
        )
        SELECT v.user_id,
               v.city_id,
               ci.country_id,
               CASE WHEN bool_or(v.has_stay) THEN 'visited' ELSE 'stopover' END AS status,
               CASE WHEN bool_or(v.is_home) THEN NULL ELSE min(v.first_on) END
                   AS first_visited_on,
               bool_or(v.is_home) AS is_home
        FROM visits v JOIN cities ci ON ci.id = v.city_id
        GROUP BY v.user_id, v.city_id, ci.country_id
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS user_city_status")
