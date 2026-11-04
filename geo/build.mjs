// Genera los TopoJSON del mapa en web/public/geo/. Corre en un contenedor con `make build-geo`.
//
// - world.topo.json: world-atlas 50m con ids ISO3 del catálogo (api/data/countries.csv).
//   Las piezas sin país propio se funden con su país (ver api/data/natural_earth.json).
// - mexico.topo.json: los 32 estados de Natural Earth 10m admin-1, ids ISO 3166-2 (MX-CMX…),
//   simplificados con mapshaper.
//
// Evoluciona scripts/generar-mapas.mjs, que sigue ahí como referencia de las maquetas.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import * as topo from 'topojson-client';
import mapshaper from 'mapshaper';

const DATA = process.env.DATA_DIR ?? '/data';
const CACHE = process.env.CACHE_DIR ?? '/cache';
const OUT = process.env.OUT_DIR ?? '/out';

const mapping = JSON.parse(fs.readFileSync(path.join(DATA, 'natural_earth.json'), 'utf8'));
const NE_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${mapping.natural_earth_version}/geojson`;

function readCsv(file) {
  const [header, ...lines] = fs.readFileSync(path.join(DATA, file), 'utf8').trim().split('\n');
  const keys = header.split(',');
  return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [keys[i], v])));
}

async function cached(name) {
  const file = path.join(CACHE, name);
  if (!fs.existsSync(file)) {
    console.log(`Descargando ${name}…`);
    const res = await fetch(`${NE_BASE}/${name}`);
    if (!res.ok) throw new Error(`No se pudo descargar ${name}: HTTP ${res.status}`);
    fs.writeFileSync(`${file}.part`, Buffer.from(await res.arrayBuffer()));
    fs.renameSync(`${file}.part`, file);
  }
  return file;
}

const countries = readCsv('countries.csv');
const byIso3 = new Map(countries.map((c) => [c.iso3, c]));
const byNumeric = new Map(countries.filter((c) => c.iso_numeric).map((c) => [c.iso_numeric, c.iso3]));
const problems = [];

// ---------- Mundo ----------
function buildWorld() {
  const require = createRequire(import.meta.url);
  const world = JSON.parse(fs.readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'));
  const wa = mapping.world_atlas;

  const groups = new Map();
  for (const geom of world.objects.countries.geometries) {
    if (wa.drop_ids.includes(geom.id)) continue;
    const name = geom.properties?.name;
    const iso3 = wa.by_id[geom.id] ?? wa.by_name[name] ?? byNumeric.get(geom.id);
    if (!iso3 || !byIso3.has(iso3)) {
      problems.push(`world-atlas: sin país en el catálogo para id=${geom.id} (${name})`);
      continue;
    }
    if (!groups.has(iso3)) groups.set(iso3, []);
    groups.get(iso3).push(geom);
  }

  const geometries = [...groups].map(([iso3, geoms]) => {
    const merged = geoms.length === 1 ? geoms[0] : topo.mergeArcs(world, geoms);
    return { type: merged.type, arcs: merged.arcs, id: iso3 };
  });

  const topology = {
    type: 'Topology',
    transform: world.transform,
    arcs: world.arcs,
    objects: { countries: { type: 'GeometryCollection', geometries } },
  };
  fs.writeFileSync(path.join(OUT, 'world.topo.json'), JSON.stringify(topology));

  const missing = countries.filter((c) => !groups.has(c.iso3));
  return { count: geometries.length, missing };
}

// ---------- México ----------
async function buildMexico() {
  const file = await cached('ne_10m_admin_1_states_provinces.geojson');
  const admin1 = JSON.parse(fs.readFileSync(file, 'utf8'));
  const states = readCsv('subdivisions.csv').filter((s) => s.country_iso3 === 'MEX');
  const codeByNe = new Map(states.map((s) => [s.ne_iso_3166_2, s.code]));
  const fold = mapping.admin1.fold;

  const features = [];
  for (const f of admin1.features) {
    if (f.properties.adm0_a3 !== 'MEX') continue;
    const ne = f.properties.iso_3166_2;
    // `fold` ya usa nuestros códigos (p. ej. un islote sin estado → MX-YUC).
    const target = fold[ne] ?? codeByNe.get(ne);
    if (!target) {
      problems.push(`admin-1: estado sin código en subdivisions.csv: ${ne} (${f.properties.name})`);
      continue;
    }
    features.push({ type: 'Feature', properties: { id: target }, geometry: f.geometry });
  }

  const output = await mapshaper.applyCommands(
    '-i mx.json -rename-layers states -dissolve id -simplify 20% weighted keep-shapes ' +
      '-o mexico.topo.json format=topojson id-field=id quantization=100000',
    { 'mx.json': { type: 'FeatureCollection', features } },
  );
  const out = output['mexico.topo.json'];
  fs.writeFileSync(path.join(OUT, 'mexico.topo.json'), out);

  const parsed = JSON.parse(out);
  const ids = new Set(Object.values(parsed.objects)[0].geometries.map((g) => g.id));
  for (const s of states) if (!ids.has(s.code)) problems.push(`México: falta el estado ${s.code}`);
  if (ids.size !== 32) problems.push(`México: se esperaban 32 estados y salieron ${ids.size}`);
  return { count: ids.size };
}

fs.mkdirSync(OUT, { recursive: true });
const world = buildWorld();
const mexico = await buildMexico();

const kb = (name) => `${Math.round(fs.statSync(path.join(OUT, name)).size / 1024)} KB`;
console.log(`world.topo.json: ${world.count} países y territorios (${kb('world.topo.json')})`);
console.log(`mexico.topo.json: ${mexico.count} estados (${kb('mexico.topo.json')})`);
if (world.missing.length) {
  console.log('Sin polígono a 50m (se dibujan como punto):');
  for (const c of world.missing) {
    console.log(`  ${c.iso3} ${c.name_es}${c.counts_in_progress === 'true' ? '' : ' (territorio)'}`);
  }
}
if (problems.length) {
  console.error('\nProblemas:');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
