import fs from 'node:fs';
import * as d3 from 'd3-geo';
import * as topo from 'topojson-client';
import mx from '@svg-maps/mexico';

const OUT = new URL('../design/mapas/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const r = (n) => Math.round(n * 10) / 10;
const pct = (v, t) => Math.round((v / t) * 1000) / 10;

const THEMES = {
  dark: {
    sphere: '#0E1B25', sphereStroke: '#1B2B37', grat: '#16242F',
    land: '#1C2B38', landStroke: '#2C4052',
    visited: '#F4B740', visitedStroke: '#FFE2A3', glow: true,
    stop: '#F4B740', stopFill: 'rgba(244,183,64,0.38)',
    wishStroke: '#7FD8CE', light: '#FFF4D6', halo: '#FFFFFF',
    jpBg: '#0B1620', jpGrat: '#14232E', jpLand: '#24384A', jpLandStroke: '#3A5266',
    mxStroke: '#3A5266', mxVisStroke: '#0B1620',
  },
  light: {
    sphere: '#DCE5EB', sphereStroke: '#C9D5DE', grat: '#D2DDE5',
    land: '#FFFFFF', landStroke: '#C3CFD9',
    visited: '#F2AE2E', visitedStroke: '#B87A06', glow: false,
    stop: '#F2AE2E', stopFill: 'rgba(242,174,46,0.42)',
    wishStroke: '#167468', light: '#7A4E00', halo: '#F2AE2E',
    jpBg: '#E2E9EE', jpGrat: '#D3DDE4', jpLand: '#FFFFFF', jpLandStroke: '#B9C7D2',
    mxStroke: '#C3CFD9', mxVisStroke: '#FFFFFF',
  },
};
const filt = `<defs><filter id="g" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="h" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>`;

// WORLD
const w110 = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-110m.json'));
const countries = topo.feature(w110, w110.objects.countries).features.filter(f => f.id !== '010');
const VISITED = ['484', '840', '320', '170', '604', '724', '250', '380', '392', '192', '620'];
const STOPOVER = ['591']; // Panamá: escala
const WISH = ['032', '504', '352', '818'];
const W = 1040, H = 540;
const proj = d3.geoEqualEarth().rotate([-10, 0]).fitExtent([[6, 6], [W - 6, H - 6]], { type: 'Sphere' });
const path = d3.geoPath(proj).digits(1);
const grat = path(d3.geoGraticule10()), sphere = path({ type: 'Sphere' });
const groups = { land: '', vis: '', stop: '', wish: '' };
for (const f of countries) {
  const d = path(f); if (!d) continue;
  const k = VISITED.includes(f.id) ? 'vis' : STOPOVER.includes(f.id) ? 'stop' : WISH.includes(f.id) ? 'wish' : 'land';
  groups[k] += `<path d="${d}"/>`;
}
const cities = [[-99.13, 19.43], [-96.72, 17.06], [-89.62, 20.97], [-103.35, 20.67], [-74.0, 40.71], [-118.24, 34.05], [-90.73, 14.56],
  [-74.07, 4.71], [-71.97, -13.53], [-82.38, 23.13], [-3.7, 40.42], [2.17, 41.39], [-9.14, 38.72], [2.35, 48.86], [12.5, 41.9],
  [11.26, 43.77], [139.69, 35.69], [135.77, 35.01], [135.5, 34.69]];
const P = cities.map(c => proj(c));
const panama = proj([-79.52, 8.98]);
for (const [name, T] of Object.entries(THEMES)) {
  const dots = P.map(([x, y]) => `<circle cx="${r(x)}" cy="${r(y)}" r="2.2"/>`).join('');
  const halo = P.map(([x, y]) => `<circle cx="${r(x)}" cy="${r(y)}" r="7"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${filt}
<path d="${sphere}" fill="${T.sphere}" stroke="${T.sphereStroke}" stroke-width="1"/>
<path d="${grat}" fill="none" stroke="${T.grat}" stroke-width="0.8"/>
<g fill="${T.land}" stroke="${T.landStroke}" stroke-width="0.6" stroke-linejoin="round">${groups.land}</g>
<g fill="${T.land}" stroke="${T.wishStroke}" stroke-width="1.1" stroke-dasharray="3 2.5" stroke-linejoin="round">${groups.wish}</g>
<g fill="${T.visited}" stroke="${T.visitedStroke}" stroke-width="0.6" stroke-linejoin="round"${T.glow ? ' filter="url(#g)" opacity="0.96"' : ''}>${groups.vis}</g>
<g fill="${T.stopFill}" stroke="${T.stop}" stroke-width="1.2" stroke-linejoin="round">${groups.stop}</g>
<circle cx="${r(panama[0])}" cy="${r(panama[1])}" r="4.5" fill="none" stroke="${T.light}" stroke-width="1.4"/>
<g fill="${T.halo}" opacity="${T.glow ? 0.55 : 0.5}" filter="url(#h)">${halo}</g>
<g fill="${T.light}">${dots}</g>
</svg>`;
  fs.writeFileSync(OUT + `world-${name}.svg`, svg);
}

// JAPAN
const w50 = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-50m.json'));
const c50 = topo.feature(w50, w50.objects.countries).features;
const JW = 720, JH = 760;
const stops = [[139.69, 35.69], [139.02, 35.23], [135.77, 35.01], [135.80, 34.69], [135.50, 34.69], [132.46, 34.39]];
const box = { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[131.2, 33.2], [141.0, 37.3]] } };
const jp = d3.geoMercator().fitExtent([[60, 60], [JW - 60, JH - 60]], box).clipExtent([[-10, -10], [JW + 10, JH + 10]]);
const jpath = d3.geoPath(jp).digits(1);
let jl = '', jv = '';
for (const f of c50) { const d = jpath(f); if (!d) continue; if (f.id === '392') jv += `<path d="${d}"/>`; else jl += `<path d="${d}"/>`; }
const jgrat = jpath(d3.geoGraticule().step([2, 2])());
const pts = stops.map(c => jp(c));
let route = `M${r(pts[0][0])},${r(pts[0][1])}`;
for (let i = 1; i < pts.length; i++) {
  const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; const k = 0.18;
  route += ` Q${r((x0 + x1) / 2 - (y1 - y0) * k)},${r((y0 + y1) / 2 + (x1 - x0) * k)} ${r(x1)},${r(y1)}`;
}
for (const [name, T] of Object.entries(THEMES)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${JW} ${JH}" width="${JW}" height="${JH}">${filt}
<rect width="${JW}" height="${JH}" fill="${T.jpBg}"/>
<path d="${jgrat}" fill="none" stroke="${T.jpGrat}" stroke-width="1"/>
<g fill="${name === 'dark' ? T.land : '#EEF2F5'}" stroke="${T.landStroke}" stroke-width="0.8">${jl}</g>
<g fill="${T.jpLand}" stroke="${T.jpLandStroke}" stroke-width="0.9" stroke-linejoin="round">${jv}</g>
<path d="${route}" fill="none" stroke="${T.visited}" stroke-width="7" stroke-opacity="${T.glow ? 0.18 : 0.28}" stroke-linecap="round"/>
<path d="${route}" fill="none" stroke="${T.glow ? T.visited : '#B87A06'}" stroke-width="2.6" stroke-dasharray="1 7" stroke-linecap="round"${T.glow ? ' filter="url(#g)"' : ''}/>
</svg>`;
  fs.writeFileSync(OUT + `japan-${name}.svg`, svg);
}

// MEXICO
const MV = ['cmx', 'mex', 'pue', 'oax', 'yuc', 'roo', 'jal', 'gua', 'que', 'ver', 'chp', 'mor'];
for (const [name, T] of Object.entries(THEMES)) {
  let ml = '', mv = '';
  for (const l of mx.locations) { if (MV.includes(l.id)) mv += `<path d="${l.path}"/>`; else ml += `<path d="${l.path}"/>`; }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mx.viewBox}" width="793" height="498">${filt}
<g fill="${T.land}" stroke="${T.mxStroke}" stroke-width="0.9" stroke-linejoin="round">${ml}</g>
<g fill="${T.visited}" stroke="${T.mxVisStroke}" stroke-width="1.1" stroke-linejoin="round"${T.glow ? ' filter="url(#g)"' : ''}>${mv}</g>
</svg>`;
  fs.writeFileSync(OUT + `mexico-${name}.svg`, svg);
}
console.log('panama%', pct(panama[0], W), pct(panama[1], H));
