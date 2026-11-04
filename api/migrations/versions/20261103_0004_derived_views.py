"""Vistas derivadas: estado por país y por estado, sellos y visibilidad efectiva

Aquí viven las reglas de negocio de docs/PRODUCTO.md:
- Un país (o estado) está visitado si hay una estancia ahí o es el de la casa; si solo hay
  escalas queda como 'stopover'. Ambos suman al progreso.
- La casa cuenta "desde siempre": first_visited_on es NULL cuando is_home.
- La visibilidad efectiva de un recuerdo es la más restrictiva entre la suya y la del viaje.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-03
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _status_view(name: str, column: str, catalog_join: str, extra_cols: str) -> str:
    """Estado por usuario y lugar (país o estado), uniendo paradas y ciudad de casa."""
    return f"""
        CREATE VIEW {name} AS
        WITH visits AS (
            SELECT s.user_id, s.{column} AS place_id,
                   bool_or(s.visit_type = 'stay') AS has_stay,
                   min(s.arrived_on) AS first_on,
                   false AS is_home
            FROM stops s
            WHERE s.{column} IS NOT NULL
            GROUP BY s.user_id, s.{column}
            UNION ALL
            SELECT u.id, ci.{column}, true, NULL, true
            FROM users u JOIN cities ci ON ci.id = u.home_city_id
            WHERE ci.{column} IS NOT NULL
        )
        SELECT v.user_id,
               v.place_id AS {column},
               {extra_cols},
               CASE WHEN bool_or(v.has_stay) THEN 'visited' ELSE 'stopover' END AS status,
               CASE WHEN bool_or(v.is_home) THEN NULL ELSE min(v.first_on) END
                   AS first_visited_on,
               bool_or(v.is_home) AS is_home
        FROM visits v {catalog_join}
        GROUP BY v.user_id, v.place_id, {extra_cols}
    """


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION effective_visibility(trip visibility, memory visibility)
        RETURNS visibility LANGUAGE sql IMMUTABLE PARALLEL SAFE
        RETURN LEAST(trip, COALESCE(memory, trip))
        """
    )
    op.execute(
        _status_view(
            "user_country_status",
            "country_id",
            "JOIN countries c ON c.id = v.place_id",
            "c.iso3, c.continent, c.counts_in_progress",
        )
    )
    op.execute(
        _status_view(
            "user_subdivision_status",
            "subdivision_id",
            "JOIN subdivisions sd ON sd.id = v.place_id",
            "sd.code, sd.country_id",
        )
    )
    op.execute(
        """
        CREATE VIEW user_stamps AS
        SELECT m.user_id, m.monument_id,
               min(COALESCE(m.occurred_on, s.arrived_on)) AS first_stamped_on,
               count(*) AS memories
        FROM memories m JOIN stops s ON s.id = m.stop_id
        WHERE m.monument_id IS NOT NULL
        GROUP BY m.user_id, m.monument_id
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS user_stamps")
    op.execute("DROP VIEW IF EXISTS user_subdivision_status")
    op.execute("DROP VIEW IF EXISTS user_country_status")
    op.execute("DROP FUNCTION IF EXISTS effective_visibility(visibility, visibility)")
