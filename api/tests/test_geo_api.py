"""Endpoints /api/geo con los datos reales de Natural Earth y GeoNames."""

import pytest

pytestmark = pytest.mark.usefixtures("geo_data")


def reverse(client, lat: float, lon: float):
    return client.get("/api/geo/reverse", params={"lat": lat, "lon": lon})


def test_countries_returns_the_195_with_spanish_names(client):
    response = client.get("/api/geo/countries")
    assert response.status_code == 200
    countries = {c["iso3"]: c for c in response.json()}
    assert len(countries) == 195
    assert countries["MEX"]["name_es"] == "México"
    assert countries["JPN"]["name_es"] == "Japón"
    assert countries["DEU"]["name_es"] == "Alemania"
    assert countries["JPN"]["continent"] == "asia"
    assert all(c["label_point"] for c in countries.values())


def test_countries_all_includes_territories(client):
    countries = {c["iso3"]: c for c in client.get("/api/geo/countries?all=true").json()}
    assert len(countries) > 195
    assert countries["GRL"]["counts_in_progress"] is False
    assert countries["GRL"]["sovereign_iso3"] == "DNK"


def test_mexico_has_32_states(client):
    response = client.get("/api/geo/subdivisions", params={"country": "MEX"})
    assert response.status_code == 200
    states = {s["code"]: s["name_es"] for s in response.json()}
    assert len(states) == 32
    assert states["MX-CMX"] == "Ciudad de México"
    assert states["MX-MEX"] == "Estado de México"


def test_subdivisions_of_unknown_country_is_404(client):
    assert client.get("/api/geo/subdivisions", params={"country": "XXX"}).status_code == 404


def test_reverse_kyoto(client):
    body = reverse(client, 35.0116, 135.7681).json()
    assert body["country"]["name_es"] == "Japón"
    assert body["subdivision"] is None
    assert body["city"]["name_es"] == "Kioto"


def test_reverse_fushimi_inari_prefers_kyoto_over_smaller_neighbors(client):
    assert reverse(client, 34.9671, 135.7727).json()["city"]["name_es"] == "Kioto"


def test_reverse_zocalo(client):
    body = reverse(client, 19.4326, -99.1332).json()
    assert body["country"]["name_es"] == "México"
    assert body["subdivision"] == {"code": "MX-CMX", "name_es": "Ciudad de México"}
    assert body["city"]["name_es"] == "Ciudad de México"


def test_reverse_tocumen_airport(client):
    body = reverse(client, 9.0714, -79.3835).json()
    assert body["country"]["iso3"] == "PAN"
    assert body["country"]["name_es"] == "Panamá"


def test_reverse_offshore_point_snaps_to_coast_within_20_km(client):
    # En el mar, unos 6 km al este de la zona hotelera de Cancún.
    body = reverse(client, 21.10, -86.70).json()
    assert body["country"]["iso3"] == "MEX"
    assert body["subdivision"]["code"] == "MX-ROO"


def test_reverse_open_ocean_is_404(client):
    assert reverse(client, 0, -140).status_code == 404


def test_reverse_territory_is_flagged_as_not_counting(client):
    body = reverse(client, 18.4655, -66.1057).json()  # San Juan, Puerto Rico
    assert body["country"]["iso3"] == "PRI"
    assert body["country"]["counts_in_progress"] is False


def test_reverse_validates_coordinates(client):
    assert reverse(client, 91, 0).status_code == 422
    assert reverse(client, 0, 181).status_code == 422


def test_cities_search_ignores_accents_and_finds_original_names(client):
    def names(q: str, **extra):
        response = client.get("/api/geo/cities", params={"q": q, **extra})
        assert response.status_code == 200
        return [c["name_es"] for c in response.json()]

    assert names("kioto")[0] == "Kioto"
    assert names("kyoto")[0] == "Kioto"
    assert "Ciudad de México" in names("mexico")
    assert names("queretaro", country="MEX")[0] == "Santiago de Querétaro"


def test_cities_search_escapes_wildcards(client):
    assert client.get("/api/geo/cities", params={"q": "%%"}).json() == []


def test_cities_search_requires_two_characters(client):
    assert client.get("/api/geo/cities", params={"q": "k"}).status_code == 422
