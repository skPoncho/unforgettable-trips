import { geoEqualEarth, geoGraticule10, geoMercator, geoPath, type GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

import type { Country, LonLat, Subdivision } from '../geo-api';

export interface Shape {
  id: string;
  d: string;
  name: string;
  /** Territorio que se pinta pero no suma al progreso. */
  territory: boolean;
  /** Punto donde se ancla su etiqueta o tarjeta (el punto de etiqueta del catálogo). */
  anchor: Point;
}

export type Point = readonly [x: number, y: number];

export interface Dot {
  id: string;
  x: number;
  y: number;
  name: string;
  territory: boolean;
}

export interface MapDrawing {
  width: number;
  height: number;
  sphere: string;
  graticule: string;
  shapes: Shape[];
  /** Lugares sin polígono visible a esta escala: se dibujan como punto. */
  dots: Dot[];
  /** Proyecta un punto geográfico a coordenadas del dibujo (null si queda fuera). */
  project: (location: LonLat) => Point | null;
}

type Props = Record<string, unknown> | null;

export function features(topology: Topology, objectName?: string): Feature<Geometry, Props>[] {
  const name = objectName ?? Object.keys(topology.objects)[0];
  const object = topology.objects[name] as GeometryCollection<Props>;
  return (feature(topology, object) as FeatureCollection<Geometry, Props>).features;
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

function projector(projection: GeoProjection) {
  return (location: LonLat): Point | null => {
    const p = projection([location.lon, location.lat]);
    return p ? [round(p[0]), round(p[1])] : null;
  };
}

/** Mundo en Equal Earth (mismo encuadre que las maquetas), con nombres de la API. */
export function drawWorld(topology: Topology, countries: Country[], width = 1040, height = 540) {
  const byIso3 = new Map(countries.map((c) => [c.iso3, c]));
  const projection = geoEqualEarth()
    .rotate([-10, 0])
    .fitExtent(
      [
        [6, 6],
        [width - 6, height - 6],
      ],
      { type: 'Sphere' },
    );
  const path = geoPath(projection).digits(1);
  const project = projector(projection);

  const shapes: Shape[] = [];
  const drawn = new Set<string>();
  for (const f of features(topology, 'countries')) {
    const id = String(f.id);
    const d = path(f);
    if (!d) continue;
    const country = byIso3.get(id);
    drawn.add(id);
    const [cx, cy] = path.centroid(f);
    shapes.push({
      id,
      d,
      name: country?.name_es ?? id,
      territory: country ? !country.counts_in_progress : true,
      // El centroide de países con territorios lejanos (Francia, EUA) cae fuera: se prefiere
      // el punto de etiqueta del catálogo.
      anchor: (country?.label_point && project(country.label_point)) || [round(cx), round(cy)],
    });
  }

  return {
    width,
    height,
    sphere: path({ type: 'Sphere' }) ?? '',
    graticule: path(geoGraticule10()) ?? '',
    shapes,
    dots: dotsFor(
      countries.filter((c) => !drawn.has(c.iso3)),
      projection,
    ),
    project,
  } satisfies MapDrawing;
}

function dotsFor(countries: Country[], projection: GeoProjection): Dot[] {
  return countries.flatMap((c) => {
    const point = c.label_point && projection([c.label_point.lon, c.label_point.lat]);
    if (!point) return [];
    return [
      {
        id: c.iso3,
        x: round(point[0]),
        y: round(point[1]),
        name: c.name_es,
        territory: !c.counts_in_progress,
      },
    ];
  });
}

/** México por estados en Mercator, ajustado al país. */
export function drawMexico(topology: Topology, states: Subdivision[], width = 800, height = 520) {
  const byCode = new Map(states.map((s) => [s.code, s.name_es]));
  const list = features(topology);
  const collection: FeatureCollection<Geometry, Props> = {
    type: 'FeatureCollection',
    features: list,
  };
  const projection = geoMercator().fitExtent(
    [
      [12, 12],
      [width - 12, height - 12],
    ],
    collection,
  );
  const path = geoPath(projection).digits(1);
  return {
    width,
    height,
    sphere: '',
    graticule: '',
    shapes: list.flatMap((f) => {
      const d = path(f);
      const id = String(f.id);
      const [cx, cy] = path.centroid(f);
      const anchor: Point = [round(cx), round(cy)];
      return d ? [{ id, d, name: byCode.get(id) ?? id, territory: false, anchor }] : [];
    }),
    dots: [],
    project: projector(projection),
  } satisfies MapDrawing;
}
