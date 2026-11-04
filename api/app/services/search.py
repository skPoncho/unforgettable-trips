"""Búsqueda del encabezado: tus lugares, viajes y recuerdos.

Sin acentos ni mayúsculas (f_unaccent, migración 0002) y con tolerancia a errores de dedo
(word_similarity de pg_trgm). Solo busca en lo del usuario: cada consulta filtra primero por
user_id y del catálogo solo une los lugares que visitó, así que no hacen falta índices
trigram (los de ciudades son para el autocompletar de /api/geo/cities).

Puntaje: 1 si empieza con el texto, 0.9 si lo contiene y, si no, la similitud por palabra
(× 0.8). Se queda lo que llega a MIN_SCORE (similitud de 0.6, el umbral de pg_trgm).
"""

import unicodedata

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import User
from app.schemas import SearchMemory, SearchOut, SearchPlace, SearchTrip

MIN_SCORE = 0.48
SNIPPET_CHARS = 120
SNIPPET_BEFORE = 40


def _score(expr: str) -> str:
    folded = f"f_unaccent(lower(COALESCE({expr}, '')))"
    return f"""(CASE WHEN {folded} LIKE n.prefix THEN 1.0
                     WHEN {folded} LIKE n.contains THEN 0.9
                     ELSE word_similarity(n.q, {folded}) * 0.8 END)"""


def _like_escape(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


# Una parada coincide por su nombre o por su ciudad, en español o en el idioma original.
_STOP_SCORE = f"GREATEST({_score('s.place_name')}, {_score('ci.name_es')}, {_score('ci.name')})"

_NEEDLE = """
    n AS (SELECT f_unaccent(lower(:q)) AS q,
                 f_unaccent(lower(:prefix)) AS prefix,
                 f_unaccent(lower(:contains)) AS contains),
    stay_numbers AS (
        SELECT id, row_number() OVER (PARTITION BY trip_id ORDER BY position) AS n
        FROM stops WHERE user_id = :uid AND visit_type = 'stay'
    )
"""

_PLACES_SQL = f"""
    WITH {_NEEDLE},
    city_stays AS (
        SELECT DISTINCT ON (s.city_id) s.city_id, s.trip_id, sn.n AS stop_number
        FROM stops s LEFT JOIN stay_numbers sn ON sn.id = s.id
        WHERE s.user_id = :uid AND s.city_id IS NOT NULL
        ORDER BY s.city_id, (s.visit_type = 'stay') DESC, s.arrived_on DESC, s.position DESC
    ),
    monument_memories AS (
        SELECT DISTINCT ON (m.monument_id) m.monument_id, s.trip_id, sn.n AS stop_number
        FROM memories m JOIN stops s ON s.id = m.stop_id
        LEFT JOIN stay_numbers sn ON sn.id = s.id
        WHERE m.user_id = :uid AND m.monument_id IS NOT NULL
        ORDER BY m.monument_id, COALESCE(m.occurred_on, s.arrived_on) DESC, m.created_at DESC
    ),
    places AS (
        SELECT 'country' AS kind, 1 AS kind_order, c.iso3::text AS key, c.name_es AS name,
               NULL AS context, c.iso3::text AS country_iso3, ucs.is_home,
               NULL::uuid AS trip_id, NULL::bigint AS stop_number,
               {_score("c.name_es")} AS score
        FROM user_country_status ucs JOIN countries c ON c.id = ucs.country_id, n
        WHERE ucs.user_id = :uid
        UNION ALL
        SELECT 'subdivision', 2, sd.code, sd.name_es, c.name_es, c.iso3::text, uss.is_home,
               NULL, NULL, {_score("sd.name_es")}
        FROM user_subdivision_status uss
        JOIN subdivisions sd ON sd.id = uss.subdivision_id
        JOIN countries c ON c.id = sd.country_id, n
        WHERE uss.user_id = :uid
        UNION ALL
        SELECT 'city', 3, ci.id::text, ci.name_es, concat_ws(', ', sd.name_es, c.name_es),
               c.iso3::text, ucs.is_home, cs.trip_id, cs.stop_number,
               GREATEST({_score("ci.name_es")}, {_score("ci.name")})
        FROM user_city_status ucs
        JOIN cities ci ON ci.id = ucs.city_id
        JOIN countries c ON c.id = ci.country_id
        LEFT JOIN subdivisions sd ON sd.id = ci.subdivision_id
        LEFT JOIN city_stays cs ON cs.city_id = ci.id, n
        WHERE ucs.user_id = :uid
        UNION ALL
        SELECT 'monument', 4, mo.slug, mo.name_es, concat_ws(', ', sd.name_es, c.name_es),
               c.iso3::text, false, mm.trip_id, mm.stop_number, {_score("mo.name_es")}
        FROM user_stamps us
        JOIN monuments mo ON mo.id = us.monument_id
        JOIN countries c ON c.id = mo.country_id
        LEFT JOIN subdivisions sd ON sd.id = mo.subdivision_id
        JOIN monument_memories mm ON mm.monument_id = mo.id, n
        WHERE us.user_id = :uid
    )
    SELECT kind, key, name, NULLIF(context, '') AS context, country_iso3, is_home,
           trip_id, stop_number
    FROM places WHERE score >= :min_score
    ORDER BY score DESC, kind_order, name
    LIMIT :limit
"""

_TRIPS_SQL = f"""
    WITH {_NEEDLE},
    per_trip AS (
        SELECT t.id, t.title, t.created_at,
               min(s.arrived_on) AS starts_on,
               max(COALESCE(s.departed_on, s.arrived_on)) AS ends_on,
               GREATEST({_score("t.title")}, {_score("t.summary")}) AS title_score,
               max({_STOP_SCORE}) AS stop_score,
               (array_agg(s.place_name ORDER BY
                   {_STOP_SCORE} DESC NULLS LAST,
                   s.position))[1] AS best_stop
        FROM trips t
        LEFT JOIN stops s ON s.trip_id = t.id
        LEFT JOIN cities ci ON ci.id = s.city_id
        CROSS JOIN n
        WHERE t.user_id = :uid
        GROUP BY t.id, n.q, n.prefix, n.contains
    )
    SELECT id, title, starts_on, ends_on,
           CASE WHEN COALESCE(stop_score, 0) > title_score THEN best_stop END AS matched_place
    FROM per_trip
    WHERE GREATEST(title_score, COALESCE(stop_score, 0)) >= :min_score
    ORDER BY GREATEST(title_score, COALESCE(stop_score, 0)) DESC, starts_on DESC NULLS LAST,
             created_at DESC
    LIMIT :limit
"""

_MEMORIES_SQL = f"""
    WITH {_NEEDLE}
    SELECT m.id, s.trip_id, t.title AS trip_title, sn.n AS stop_number, s.place_name,
           mo.name_es AS monument_name, m.body,
           COALESCE(m.occurred_on, s.arrived_on) AS occurred_on,
           (SELECT p.id FROM photos p WHERE p.memory_id = m.id
            ORDER BY p.position, p.created_at LIMIT 1) AS photo_id
    FROM memories m
    JOIN stops s ON s.id = m.stop_id
    JOIN trips t ON t.id = s.trip_id
    LEFT JOIN stay_numbers sn ON sn.id = s.id
    LEFT JOIN cities ci ON ci.id = s.city_id
    LEFT JOIN monuments mo ON mo.id = m.monument_id
    CROSS JOIN n
    WHERE m.user_id = :uid
      AND GREATEST({_score("m.body")}, {_STOP_SCORE}, {_score("mo.name_es")}) >= :min_score
    ORDER BY GREATEST({_score("m.body")}, {_STOP_SCORE}, {_score("mo.name_es")}) DESC,
             COALESCE(m.occurred_on, s.arrived_on) DESC, m.created_at DESC
    LIMIT :limit
"""


def _fold(value: str) -> str:
    """Minúsculas sin acentos, carácter por carácter (mismo largo que el original)."""
    return "".join(unicodedata.normalize("NFD", ch.lower())[0] for ch in value)


def snippet(body: str, q: str) -> str:
    """Fragmento del texto alrededor de la coincidencia (o el inicio si no la hay)."""
    body = " ".join(body.split())
    start = _fold(body).find(_fold(q.strip()))
    if start < 0 or start < SNIPPET_BEFORE:
        start = 0
    else:
        start -= SNIPPET_BEFORE
        # Empieza en una palabra completa.
        space = body.find(" ", start)
        start = space + 1 if 0 <= space < start + SNIPPET_BEFORE else start
    end = start + SNIPPET_CHARS
    if end < len(body):
        space = body.rfind(" ", start, end)
        end = space if space > start else end
    text_ = body[start:end].strip()
    return ("…" if start > 0 else "") + text_ + ("…" if end < len(body) else "")


def search(session: Session, user: User, q: str, limit: int = 5) -> SearchOut:
    q = " ".join(q.split())
    escaped = _like_escape(q)
    params = {
        "uid": user.id,
        "q": q,
        "prefix": f"{escaped}%",
        "contains": f"%{escaped}%",
        "min_score": MIN_SCORE,
        "limit": limit,
    }
    places = session.execute(text(_PLACES_SQL), params).mappings()
    trips = session.execute(text(_TRIPS_SQL), params).mappings()
    memories = []
    for row in session.execute(text(_MEMORIES_SQL), params).mappings():
        data = dict(row)
        body = data.pop("body")
        memories.append(SearchMemory(**data, snippet=snippet(body, q)))
    return SearchOut(
        places=[SearchPlace(**r) for r in places],
        trips=[SearchTrip(**r) for r in trips],
        memories=memories,
    )
