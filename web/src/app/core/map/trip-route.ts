import { geoGraticule, geoMercator, geoPath } from 'd3-geo';
import type { Topology } from 'topojson-specification';

import type { TripStop } from '../api/types';
import { features } from './geo-shapes';

/** Dónde va la etiqueta respecto a su pin. */
export type LabelSide =
  | 'right'
  | 'left'
  | 'below'
  | 'above'
  | 'upper-right'
  | 'lower-right'
  | 'upper-left'
  | 'lower-left';

export interface RoutePin {
  stopId: string;
  /** Número de la estancia en el viaje (las escalas no llevan número). */
  n: number;
  name: string;
  x: number;
  y: number;
  side: LabelSide;
}

export interface RouteStopover {
  stopId: string;
  name: string;
  x: number;
  y: number;
}

export interface RouteLand {
  id: string;
  d: string;
  /** País con alguna estancia del viaje. */
  inTrip: boolean;
}

export interface RouteDrawing {
  width: number;
  height: number;
  graticule: string;
  land: RouteLand[];
  /** Curvas entre estancias consecutivas (`M … Q … Q …`). */
  route: string;
  pins: RoutePin[];
  /** Escalas que caen dentro del encuadre; las lejanas solo van en el aviso. */
  stopovers: RouteStopover[];
}

/** Medidas de pines y etiquetas, en unidades del dibujo; el CSS de trip-map usa las mismas. */
export const PIN_RADIUS = 15;
const LABEL_HEIGHT = 26;
const LABEL_GAP = 5;
/** Encuadre mínimo en grados, para que un viaje de una ciudad no quede a nivel calle. */
const MIN_SPAN = 1.2;
/** Curvatura de la ruta (la misma de scripts/generar-mapas.mjs). */
const CURVE = 0.18;

/** Ancho aproximado de una etiqueta (Instrument Sans 13px, seminegrita). */
function labelWidth(name: string): number {
  return name.length * 7.6 + 18;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SIDES: readonly LabelSide[] = [
  'right',
  'left',
  'below',
  'above',
  'upper-right',
  'lower-right',
  'upper-left',
  'lower-left',
];

export function labelBox(x: number, y: number, name: string, side: LabelSide): Box {
  const w = labelWidth(name);
  const h = LABEL_HEIGHT;
  const near = PIN_RADIUS + LABEL_GAP;
  const corner = PIN_RADIUS - 2;
  switch (side) {
    case 'right':
      return { x: x + near, y: y - h / 2, w, h };
    case 'left':
      return { x: x - near - w, y: y - h / 2, w, h };
    case 'below':
      return { x: x - w / 2, y: y + near, w, h };
    case 'above':
      return { x: x - w / 2, y: y - near - h, w, h };
    case 'upper-right':
      return { x: x + corner, y: y - corner - h, w, h };
    case 'lower-right':
      return { x: x + corner, y: y + corner, w, h };
    case 'upper-left':
      return { x: x - corner - w, y: y - corner - h, w, h };
    case 'lower-left':
      return { x: x - corner - w, y: y + corner, w, h };
  }
}

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Coloca las etiquetas una por una en el lado que menos choca con los pines, las etiquetas ya
 * puestas y el borde del mapa. Kioto, Nara y Osaka quedan a 20–30 px entre sí.
 */
function placeLabels(
  points: readonly { x: number; y: number; name: string }[],
  width: number,
  height: number,
): LabelSide[] {
  const pins: Box[] = points.map((p) => ({
    x: p.x - PIN_RADIUS,
    y: p.y - PIN_RADIUS,
    w: PIN_RADIUS * 2,
    h: PIN_RADIUS * 2,
  }));
  const frame: Box = { x: 8, y: 8, w: width - 16, h: height - 16 };
  const placed: Box[] = [];
  return points.map((p) => {
    let best: LabelSide = 'right';
    let bestScore = Infinity;
    for (const side of SIDES) {
      const box = labelBox(p.x, p.y, p.name, side);
      const outside = box.w * box.h - overlap(box, frame);
      const score =
        outside * 3 +
        pins.reduce((sum, pin) => sum + overlap(box, pin), 0) +
        placed.reduce((sum, other) => sum + overlap(box, other), 0);
      if (score < bestScore) {
        best = side;
        bestScore = score;
      }
      if (score === 0) break;
    }
    placed.push(labelBox(p.x, p.y, p.name, best));
    return best;
  });
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

/** Curva cuadrática hacia la derecha de cada tramo. */
function curve(points: readonly { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const cx = round((a.x + b.x) / 2 - (b.y - a.y) * CURVE);
    const cy = round((a.y + b.y) / 2 + (b.x - a.x) * CURVE);
    d += ` Q${cx},${cy} ${b.x},${b.y}`;
  }
  return d;
}

/**
 * Mapa regional del viaje en Mercator, ajustado a las estancias: una escala en Panamá no
 * estira el mapa de Japón. Devuelve null si el viaje no tiene paradas.
 */
export function drawTripRoute(
  topology: Topology,
  stops: readonly TripStop[],
  // Cerca del tamaño en pantalla (480–640 px de ancho): pines y etiquetas miden lo mismo en
  // píxeles a cualquier escala, así que el acomodo de etiquetas se calcula a esta medida.
  width = 540,
  height = 570,
): RouteDrawing | null {
  if (stops.length === 0) return null;
  const stays = stops.filter((s) => s.visit_type === 'stay');
  const framed = stays.length > 0 ? stays : stops;

  const lons = framed.map((s) => s.location.lon);
  const lats = framed.map((s) => s.location.lat);
  let [west, east] = [Math.min(...lons), Math.max(...lons)];
  let [south, north] = [Math.min(...lats), Math.max(...lats)];
  if (east - west < MIN_SPAN)
    [west, east] = [(west + east - MIN_SPAN) / 2, (west + east + MIN_SPAN) / 2];
  if (north - south < MIN_SPAN) {
    [south, north] = [(south + north - MIN_SPAN) / 2, (south + north + MIN_SPAN) / 2];
  }

  const projection = geoMercator()
    .rotate([-(west + east) / 2, 0])
    .fitExtent(
      [
        [Math.round(width * 0.14), Math.round(height * 0.16)],
        [Math.round(width * 0.86), Math.round(height * 0.86)],
      ],
      {
        type: 'MultiPoint',
        coordinates: [
          [west, south],
          [east, north],
        ],
      },
    )
    .clipExtent([
      [-10, -10],
      [width + 10, height + 10],
    ]);
  const path = geoPath(projection).digits(1);
  const project = (s: TripStop) => {
    const p = projection([s.location.lon, s.location.lat]);
    return p ? { x: round(p[0]), y: round(p[1]) } : null;
  };

  const tripCountries = new Set(stays.map((s) => s.country.iso3));
  const land: RouteLand[] = features(topology, 'countries').flatMap((f) => {
    const d = path(f);
    const id = String(f.id);
    return d ? [{ id, d, inTrip: tripCountries.has(id) }] : [];
  });

  const span = Math.max(east - west, north - south);
  const step = span > 20 ? 10 : span > 8 ? 5 : 2;
  const graticule = path(geoGraticule().step([step, step])()) ?? '';

  const points = stays.flatMap((s, i) => {
    const p = project(s);
    return p ? [{ ...p, n: i + 1, name: s.place_name, stopId: s.id }] : [];
  });
  const sides = placeLabels(points, width, height);
  const pins: RoutePin[] = points.map((p, i) => ({ ...p, side: sides[i] }));

  const stopovers = stops
    .filter((s) => s.visit_type === 'stopover')
    .flatMap((s) => {
      const p = project(s);
      const inside = p && p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;
      return inside ? [{ stopId: s.id, name: s.place_name, ...p }] : [];
    });

  return { width, height, graticule, land, route: curve(points), pins, stopovers };
}
