"""El catálogo de países respeta la convención de los 195."""

from collections import Counter

from app.geo.catalog import CONTINENTS, load_catalog


def test_195_countries_count_in_progress():
    counted = [c for c in load_catalog() if c.counts_in_progress]
    assert len(counted) == 195


def test_continent_totals():
    counted = Counter(c.continent for c in load_catalog() if c.counts_in_progress)
    assert counted == {"america": 35, "europe": 44, "asia": 48, "africa": 54, "oceania": 14}


def test_codes_are_unique_and_well_formed():
    catalog = load_catalog()
    for field in ("iso2", "iso3"):
        values = [getattr(c, field) for c in catalog]
        assert len(values) == len(set(values)), f"{field} repetido"
    numerics = [c.iso_numeric for c in catalog if c.iso_numeric]
    assert len(numerics) == len(set(numerics))
    for c in catalog:
        assert len(c.iso2) == 2 and len(c.iso3) == 3
        assert c.continent in CONTINENTS
        assert c.name_es.strip() == c.name_es and c.name_es


def test_names_are_unique():
    names = [c.name_es for c in load_catalog()]
    assert len(names) == len(set(names))


def test_territories_point_to_a_counted_sovereign():
    by_iso3 = {c.iso3: c for c in load_catalog()}
    for c in by_iso3.values():
        if c.counts_in_progress:
            assert c.sovereign_iso3 is None, c.iso3
        elif c.sovereign_iso3:
            assert by_iso3[c.sovereign_iso3].counts_in_progress, c.iso3


def test_convention_examples():
    by_iso3 = {c.iso3: c for c in load_catalog()}
    for iso3 in ("VAT", "PSE", "MEX", "JPN", "PAN", "RUS"):
        assert by_iso3[iso3].counts_in_progress, iso3
    for iso3 in ("GRL", "PRI", "TWN", "XKX", "HKG", "ESH"):
        assert not by_iso3[iso3].counts_in_progress, iso3
    assert by_iso3["GRL"].sovereign_iso3 == "DNK"
    assert by_iso3["RUS"].continent == "europe"
    assert by_iso3["TUR"].continent == "asia"
    assert by_iso3["EGY"].continent == "africa"
    assert by_iso3["MEX"].name_es == "México"
