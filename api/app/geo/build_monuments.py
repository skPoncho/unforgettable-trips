"""Genera api/data/monuments.csv: `make build-monuments` (python -m app.geo.build_monuments).

Se corre a mano cuando se quiera actualizar el catálogo; el resultado se guarda en git y
`make load-geo` lo carga. Fuentes:

- Sitios del Patrimonio Mundial de la UNESCO, culturales y mixtos, desde Wikidata (CC0).
  No se usa la descarga de UNESCO porque sus términos no aclaran la reutilización.
- api/data/monuments_curated.csv: México completo (los sitios UNESCO compuestos se parten,
  p. ej. Oaxaca y Monte Albán, y se suman zonas arqueológicas) y algunos lugares del
  mundo que no son sitios UNESCO por sí solos (Fushimi Inari, Sensō-ji…). Su columna
  `replaces` quita sitios de Wikidata que la lista curada sustituye.

Los sitios de Wikidata en México se descartan: la lista curada los cubre (las rutas como
el Camino Real de Tierra Adentro o la ruta wixárika no se pueden marcar con un pin).
"""

import csv
import json
import re
import unicodedata
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import asdict, dataclass, fields

from app.geo.sources import DATA_DIR

CURATED_CSV = DATA_DIR / "monuments_curated.csv"
OUTPUT_CSV = DATA_DIR / "monuments.csv"
SPARQL_URL = "https://query.wikidata.org/sparql"
USER_AGENT = "huella/0.1 (atlas personal de viajes; catálogo de monumentos)"

# Sitios principales (sin componentes como 412-001). bis/ter/rev son extensiones del mismo.
_QUERY = """
SELECT ?item ?whc ?es ?en ?coord ?iso3 ?crit WHERE {
  ?item wdt:P757 ?whc .
  FILTER(REGEX(?whc, "^[0-9]+(bis|ter|rev)?$"))
  FILTER NOT EXISTS { ?item p:P1435 [ ps:P1435 wd:Q9259 ; pq:P582 [] ] }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P17 [ wdt:P298 ?iso3 ] }
  OPTIONAL { ?item wdt:P2614 [ rdfs:label ?crit ] FILTER(lang(?crit) = "en") }
  OPTIONAL { ?item rdfs:label ?es FILTER(lang(?es) = "es") }
  OPTIONAL { ?item rdfs:label ?en FILTER(lang(?en) = "en") }
}
"""

# Criterios (i)–(vi) son culturales; (vii)–(x), naturales. Los mixtos tienen de los dos.
_CULTURAL = {"(i)", "(ii)", "(iii)", "(iv)", "(v)", "(vi)"}

_STOPWORDS = {
    "de", "del", "la", "las", "el", "los", "y", "e", "en", "a", "al", "of", "the", "and",
    "sitio", "sitios", "centro", "historico", "historica", "historicos", "historicas",
    "ciudad", "ciudades", "vieja", "viejo", "casco", "barrio", "conjunto", "zona", "zonas",
    "monumento", "monumentos", "antigua", "antiguo", "antiguas", "antiguos", "paisaje",
    "paisajes", "cultural", "culturales", "arqueologico", "arqueologica", "arqueologicos",
    "arqueologicas", "parque", "nacional", "isla", "islas", "old", "town", "city", "historic",
    "centre", "center", "site", "sites", "national", "park", "ancient",
}  # fmt: skip


@dataclass
class MonumentRow:
    slug: str
    name_es: str
    stamp_code: str
    kind: str
    iso3: str
    subdivision_code: str
    lon: float
    lat: float
    source: str
    source_ref: str


def _ascii(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()


def stamp_candidates(name: str) -> list[str]:
    """Iniciales posibles para el sello, de la más natural a la menos."""
    words = [w for w in re.findall(r"[A-Za-z]+", _ascii(name)) if len(w) > 1]
    main = [w for w in words if w.lower() not in _STOPWORDS] or words or ["X"]
    first = main[0].upper()
    options = [first[:3]]
    if len(main) >= 2:
        options.append("".join(w[0] for w in main[:3]).upper())
        options.append((first[:2] + main[1][0]).upper())
    n = len(first)
    options.extend(
        first[0] + first[i] + first[j] for i in range(1, min(n, 4)) for j in range(i + 1, min(n, 6))
    )
    return [o for o in dict.fromkeys(options) if len(o) >= 2]


def _unique_stamp(name: str, taken: set[str]) -> str:
    for option in stamp_candidates(name):
        if option not in taken:
            return option
    base = stamp_candidates(name)[0][:2]
    n = 2
    while f"{base}{n}" in taken:
        n += 1
    return f"{base}{n}"


def _parse_point(wkt: str) -> tuple[float, float]:
    lon, lat = re.match(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)", wkt).groups()  # type: ignore[union-attr]
    return round(float(lon), 6), round(float(lat), 6)


def fetch_wikidata() -> list[dict[str, dict[str, str]]]:
    url = f"{SPARQL_URL}?" + urllib.parse.urlencode({"query": _QUERY, "format": "json"})
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=180) as response:
        return json.load(response)["results"]["bindings"]


def unesco_sites(bindings: list[dict[str, dict[str, str]]]) -> list[dict]:
    """Agrupa las filas de Wikidata por sitio (número base del WHC)."""
    sites: dict[str, dict] = defaultdict(
        lambda: {"items": {}, "crit": set(), "iso3": set(), "suffixless": False}
    )
    for b in bindings:
        whc = b["whc"]["value"]
        base = re.match(r"\d+", whc).group()  # type: ignore[union-attr]
        site = sites[base]
        qid = b["item"]["value"].rsplit("/", 1)[1]
        item = site["items"].setdefault(
            qid, {"exact": whc == base, "es": None, "en": None, "coords": set()}
        )
        item["es"] = item["es"] or b.get("es", {}).get("value")
        item["en"] = item["en"] or b.get("en", {}).get("value")
        if "coord" in b:
            item["coords"].add(b["coord"]["value"])
        if "crit" in b:
            site["crit"].add(b["crit"]["value"])
        if "iso3" in b:
            site["iso3"].add(b["iso3"]["value"])

    result = []
    for base, site in sites.items():
        # Orden estable: primero el elemento con el número exacto, después por QID.
        items = sorted(site["items"].items(), key=lambda kv: (not kv[1]["exact"], int(kv[0][1:])))
        name = next((i["es"] for _, i in items if i["es"]), None) or next(
            (i["en"] for _, i in items if i["en"]), None
        )
        coords = next((sorted(i["coords"])[0] for _, i in items if i["coords"]), None)
        result.append(
            {
                "whc": base,
                "name": name,
                "coord": coords,
                "iso3": sorted(site["iso3"]),
                "cultural": bool(site["crit"] & _CULTURAL),
            }
        )
    return sorted(result, key=lambda s: int(s["whc"]))


def build(bindings: list[dict[str, dict[str, str]]]) -> tuple[list[MonumentRow], list[str]]:
    notes: list[str] = []
    with CURATED_CSV.open(encoding="utf-8") as f:
        curated = list(csv.DictReader(f))
    replaced = {ref for r in curated for ref in r["replaces"].split(";") if ref}

    rows = [
        MonumentRow(
            slug=r["slug"],
            name_es=r["name_es"],
            stamp_code=r["stamp_code"],
            kind=r["kind"],
            iso3=r["iso3"],
            subdivision_code=r["subdivision_code"],
            lon=float(r["lon"]),
            lat=float(r["lat"]),
            source=r["source"],
            source_ref=r["source_ref"],
        )
        for r in curated
    ]
    taken: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        taken[row.iso3].add(row.stamp_code)

    skipped = defaultdict(int)
    for site in unesco_sites(bindings):
        if not site["cultural"]:
            skipped["natural"] += 1
            continue
        if "MEX" in site["iso3"]:
            skipped["México (lista curada)"] += 1
            continue
        if site["whc"] in replaced:
            skipped["sustituido en la lista curada"] += 1
            continue
        if site["coord"] is None or site["name"] is None:
            skipped["sin coordenadas o nombre"] += 1
            notes.append(f"Sin coordenadas o nombre: WHC {site['whc']} ({site['name']})")
            continue
        iso3 = site["iso3"][0] if site["iso3"] else ""
        lon, lat = _parse_point(site["coord"])
        stamp = _unique_stamp(site["name"], taken[iso3])
        taken[iso3].add(stamp)
        rows.append(
            MonumentRow(
                slug=f"unesco-{site['whc']}",
                name_es=site["name"],
                stamp_code=stamp,
                kind="unesco",
                iso3=iso3,
                subdivision_code="",
                lon=lon,
                lat=lat,
                source="wikidata",
                source_ref=f"whc:{site['whc']}",
            )
        )
    notes.extend(f"Omitidos ({reason}): {n}" for reason, n in skipped.items())
    return rows, notes


def write(rows: list[MonumentRow]) -> None:
    with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[fl.name for fl in fields(MonumentRow)])
        writer.writeheader()
        writer.writerows(asdict(r) for r in rows)


def main() -> None:
    print("Consultando Wikidata…", flush=True)
    rows, notes = build(fetch_wikidata())
    write(rows)
    print(f"{OUTPUT_CSV.name}: {len(rows)} monumentos")
    for note in notes:
        print(f"  {note}")


if __name__ == "__main__":
    main()
