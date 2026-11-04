"""Catálogo de monumentos (fase 6): api/data/monuments.csv y su carga en PostGIS."""

from collections import Counter

from sqlalchemy import text

from app.geo.build_monuments import build, stamp_candidates
from app.geo.monuments import load_catalog
from app.seed import seed_monument_slugs


def test_catalog_slugs_and_stamps_are_unique():
    catalog = load_catalog()
    assert len(catalog) > 1000
    assert not [s for s, n in Counter(m.slug for m in catalog).items() if n > 1]
    stamps = Counter((m.iso3, m.stamp_code) for m in catalog)
    assert not [k for k, n in stamps.items() if n > 1]
    assert all(m.stamp_code and m.name_es for m in catalog)
    assert {m.kind for m in catalog} == {"unesco", "archaeological", "other"}


def test_mexico_comes_only_from_the_curated_list():
    mexico = [m for m in load_catalog() if m.iso3 == "MEX"]
    assert len(mexico) >= 70
    assert not [m.slug for m in mexico if m.slug.startswith("unesco-")]
    assert all(m.subdivision_code.startswith("MX-") for m in mexico)
    # Los sitios compuestos se parten, como en la maqueta.
    slugs = {m.slug for m in mexico}
    assert {"monte-alban", "centro-historico-oaxaca", "xochimilco"} <= slugs


def test_seed_monuments_are_in_the_catalog():
    assert seed_monument_slugs() <= {m.slug for m in load_catalog()}


def test_curated_points_fall_in_their_state(db):
    """El estado que calcula locate() coincide con el esperado en la lista curada."""
    rows = db.execute(
        text(
            """
            SELECT mo.slug, sd.code FROM monuments mo
            LEFT JOIN subdivisions sd ON sd.id = mo.subdivision_id
            """
        )
    ).all()
    loaded = dict(rows)
    expected = {m.slug: m.subdivision_code for m in load_catalog() if m.subdivision_code}
    assert {slug: loaded.get(slug) for slug in expected} == expected


def test_build_keeps_cultural_sites_outside_mexico():
    def site(whc, name, crit, iso3, coord="Point(1 2)"):
        return [
            {
                "item": {"value": f"http://www.wikidata.org/entity/Q{whc.removesuffix('bis')}"},
                "whc": {"value": whc},
                "es": {"value": name},
                "coord": {"value": coord},
                "iso3": {"value": iso3},
                "crit": {"value": c},
            }
            for c in crit
        ]

    bindings = (
        site("1", "Centro histórico de Roma", ["(i)", "(ii)"], "ITA")
        + site("2", "Parque nacional natural", ["(vii)"], "ITA")
        + site("3", "Teotihuacan", ["(i)"], "MEX")
        + site("775", "Memorial de la Paz de Hiroshima", ["(vi)"], "JPN")
        + site("4bis", "Montañas sagradas", ["(iii)", "(vii)"], "ITA")
    )
    rows, _ = build(bindings)
    world = {r.slug: r for r in rows if r.slug.startswith("unesco-")}
    assert set(world) == {"unesco-1", "unesco-4"}  # sin naturales, México ni sustituidos
    assert world["unesco-1"].stamp_code == "ROM"
    assert (world["unesco-1"].lon, world["unesco-1"].lat) == (1.0, 2.0)


def test_stamp_codes_skip_generic_words():
    assert stamp_candidates("Ciudad vieja de Damasco")[0] == "DAM"
    assert stamp_candidates("Monumentos históricos de la antigua Kioto")[0] == "KIO"
    assert stamp_candidates("Ur")[0] == "UR"
