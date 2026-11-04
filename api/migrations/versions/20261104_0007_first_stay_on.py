"""Vistas de estado con first_stay_on: fecha de la primera estancia

La línea de tiempo (Reproduce tu historia) necesita saber cuándo un lugar pasó de escala a
visitado: first_visited_on es la primera parada de cualquier tipo y first_stay_on la primera
estancia (nula si solo hubo escalas). Como first_visited_on, es nula para la casa, que
cuenta desde siempre.

CREATE OR REPLACE VIEW solo permite agregar columnas al final, así que la regla de estado
queda igual que en las migraciones 0004 y 0005.

Revision ID: 0007
Revises: 0006
Create Date: 2026-11-04
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _status_view(
    name: str, column: str, home_join: str, catalog_join: str, extra_cols: str, first_stay: bool
) -> str:
    """Estado por usuario y lugar (país, estado o ciudad), uniendo paradas y casa."""
    stay_visit = (
        ",\n               min(s.arrived_on) FILTER (WHERE s.visit_type = 'stay') AS stay_on"
        if first_stay
        else ""
    )
    stay_home = ", NULL::date" if first_stay else ""
    stay_out = (
        ",\n               CASE WHEN bool_or(v.is_home) THEN NULL ELSE min(v.stay_on) END"
        "\n                   AS first_stay_on"
        if first_stay
        else ""
    )
    return f"""
        CREATE OR REPLACE VIEW {name} AS
        WITH visits AS (
            SELECT s.user_id, s.{column} AS place_id,
                   bool_or(s.visit_type = 'stay') AS has_stay,
                   min(s.arrived_on) AS first_on,
                   false AS is_home{stay_visit}
            FROM stops s
            WHERE s.{column} IS NOT NULL
            GROUP BY s.user_id, s.{column}
            UNION ALL
            SELECT u.id, {home_join}, true, NULL, true{stay_home}
            FROM users u JOIN cities ci ON ci.id = u.home_city_id
            WHERE {home_join} IS NOT NULL
        )
        SELECT v.user_id,
               v.place_id AS {column},
               {extra_cols},
               CASE WHEN bool_or(v.has_stay) THEN 'visited' ELSE 'stopover' END AS status,
               CASE WHEN bool_or(v.is_home) THEN NULL ELSE min(v.first_on) END
                   AS first_visited_on,
               bool_or(v.is_home) AS is_home{stay_out}
        FROM visits v {catalog_join}
        GROUP BY v.user_id, v.place_id, {extra_cols}
    """


VIEWS = (
    (
        "user_country_status",
        "country_id",
        "ci.country_id",
        "JOIN countries c ON c.id = v.place_id",
        "c.iso3, c.continent, c.counts_in_progress",
    ),
    (
        "user_subdivision_status",
        "subdivision_id",
        "ci.subdivision_id",
        "JOIN subdivisions sd ON sd.id = v.place_id",
        "sd.code, sd.country_id",
    ),
    (
        "user_city_status",
        "city_id",
        "ci.id",
        "JOIN cities ci ON ci.id = v.place_id",
        "ci.country_id",
    ),
)


def upgrade() -> None:
    for view in VIEWS:
        op.execute(_status_view(*view, first_stay=True))


def downgrade() -> None:
    # Quitar una columna de una vista obliga a recrearla.
    for view in VIEWS:
        op.execute(f"DROP VIEW {view[0]}")
        op.execute(_status_view(*view, first_stay=False))
