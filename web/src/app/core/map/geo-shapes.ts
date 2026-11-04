import {
  geoArea,
  geoDistance,
  geoEqualEarth,
  geoEqualEarthRaw,
  geoGraticule10,
  geoMercator,
  geoOrthographicRaw,
  geoPath,
  geoProjectionMutator,
  type GeoProjection,
  type GeoRawProjection,
} from 'd3-geo';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { feature } from 'topojson-client';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import type { GeometryCollection, Objects, Topology } from 'topojson-specification';

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

/** El mundo plano gira 10° para que el Pacífico no corte Asia (como las maquetas). */
const FLAT_ROTATE: readonly [number, number] = [-10, 0];
/** Margen del globo dentro del dibujo. */
const GLOBE_MARGIN = 12;
/**
 * El globo se redibuja en cada cuadro al girar: usa el mundo simplificado. quantile() de
 * topojson-simplify da el peso mínimo para conservar esa fracción de puntos: con 0.1 quedan
 * ~12 mil de 80 mil, más que suficiente para un globo de ~500 px.
 */
const GLOBE_DETAIL_QUANTILE = 0.1;
/** En el globo se omiten las islas de menos de esto (estereorradianes, ~2,500 km²). */
const GLOBE_MIN_ISLAND = 6e-5;

/** Vista del mundo: plano (alpha 0), globo (alpha 1) o la transición entre ambos. */
export interface GlobeView {
  /** 0 = Equal Earth plano, 1 = globo ortográfico. */
  alpha: number;
  /** Punto del globo que queda al frente [lon, lat]. */
  center: readonly [lon: number, lat: number];
  /** Acercamiento del globo (1 = cabe completo). */
  zoom: number;
}

/** Disco del globo (para el sombreado del borde). */
export interface GlobeDisc {
  cx: number;
  cy: number;
  r: number;
}

export interface WorldDrawing extends MapDrawing {
  /** El mismo mundo en otra vista; con alpha 0 devuelve el dibujo plano. */
  view: (view: GlobeView) => WorldDrawing;
  disc: GlobeDisc | null;
  /** Punto de etiqueta de un país (para girar el globo hacia él). */
  locate: (iso3: string) => LonLat | null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Interpola ángulos por el camino corto (de 170° a -170° pasa por 180°). */
const lerpAngle = (a: number, b: number, t: number) =>
  a + (((((b - a) % 360) + 540) % 360) - 180) * t;

// En d3-geo las proyecciones "raw" son funciones (λ, φ) → [x, y], pero @types/d3-geo las
// declara como fábricas sin argumentos; lo mismo con lo que devuelve geoProjectionMutator.
const equalEarthRaw = geoEqualEarthRaw as unknown as GeoRawProjection;
const orthographicRaw = geoOrthographicRaw as unknown as GeoRawProjection;

/** Equal Earth que se va volviendo ortográfica (técnica de "Projection Transitions" de D3). */
const morph = geoProjectionMutator((alpha: number): GeoRawProjection => (x, y) => {
  const [x0, y0] = equalEarthRaw(x, y);
  const [x1, y1] = orthographicRaw(x, y);
  return [lerp(x0, x1, alpha), lerp(y0, y1, alpha)];
}) as unknown as (alpha: number) => GeoProjection;

/**
 * Mundo en Equal Earth (mismo encuadre que las maquetas), con nombres de la API.
 * `view()` lo vuelve a proyectar como globo girable o en la transición entre ambos.
 */
export function drawWorld(
  topology: Topology,
  countries: Country[],
  width = 1040,
  height = 540,
): WorldDrawing {
  const byIso3 = new Map(countries.map((c) => [c.iso3, c]));
  const listOf = (t: Topology) =>
    features(t, 'countries').map((f) => ({
      feature: f,
      id: String(f.id),
      country: byIso3.get(String(f.id)),
    }));
  const list = listOf(topology);
  let globeList: typeof list | null = null;
  const simplified = () => {
    if (!globeList) {
      const weighted = presimplify(topology as Topology<Objects<Record<string, unknown>>>);
      globeList = listOf(simplify(weighted, quantile(weighted, GLOBE_DETAIL_QUANTILE))).map(
        (item) => ({ ...item, feature: withoutIslets(item.feature) }),
      );
    }
    return globeList;
  };

  const flat = geoEqualEarth()
    .rotate([...FLAT_ROTATE])
    .fitExtent(
      [
        [6, 6],
        [width - 6, height - 6],
      ],
      { type: 'Sphere' },
    );

  const render = (
    shapesFrom: typeof list,
    projection: GeoProjection,
    visible: (location: LonLat) => boolean,
    dotCountries: Country[],
  ) => {
    const path = geoPath(projection).digits(1);
    const projectPoint = projector(projection);
    const project = (location: LonLat) => (visible(location) ? projectPoint(location) : null);
    const shapes: Shape[] = [];
    for (const { feature: f, id, country } of shapesFrom) {
      const d = path(f);
      if (!d) continue;
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
      dots: dotsFor(dotCountries, project),
      project,
    } satisfies MapDrawing;
  };

  // Países sin polígono visible en el mapa plano: se dibujan como punto también en el globo.
  const flatBase = render(list, flat, () => true, []);
  const drawn = new Set(flatBase.shapes.map((s) => s.id));
  const dotCountries = countries.filter((c) => !drawn.has(c.iso3));
  const locate = (iso3: string) => byIso3.get(iso3)?.label_point ?? null;
  const flatDrawing: WorldDrawing = {
    ...flatBase,
    dots: dotsFor(dotCountries, flatBase.project),
    disc: null,
    locate,
    view: (v) => (v.alpha <= 0 ? flatDrawing : globe(v)),
  };

  const [tx, ty] = flat.translate();
  const globe = ({ alpha, center, zoom }: GlobeView): WorldDrawing => {
    const r = (Math.min(width, height) / 2 - GLOBE_MARGIN) * zoom;
    const rotate: [number, number] = [
      lerpAngle(FLAT_ROTATE[0], -center[0], alpha),
      lerp(FLAT_ROTATE[1], -center[1], alpha),
    ];
    // Lo que queda detrás se recorta: un círculo que se cierra de 180° (todo) a 90° (el frente).
    const clip = alpha >= 1 ? 90 : Math.min(179.9, 180 - 90 * alpha);
    const projection = morph(alpha)
      .scale(lerp(flat.scale(), r, alpha))
      .translate([lerp(tx, width / 2, alpha), lerp(ty, height / 2, alpha)])
      .rotate(rotate)
      .clipAngle(clip)
      .precision(1);
    const front: [number, number] = [-rotate[0], -rotate[1]];
    const radians = (clip * Math.PI) / 180;
    // Cerca de la orilla la ortográfica aplasta todo contra el borde (a 87° del centro un
    // punto queda a 0.999 del radio): se esconden los puntos a menos de ~11° de la orilla.
    const visible = (l: LonLat) => geoDistance([l.lon, l.lat], front) < radians - 0.2;
    const [cx, cy] = projection.translate();
    return {
      ...render(simplified(), projection, visible, dotCountries),
      disc: { cx, cy, r: projection.scale() },
      locate,
      view: (v) => (v.alpha <= 0 ? flatDrawing : globe(v)),
    };
  };

  return flatDrawing;
}

/** Quita las islas chicas de un país, pero siempre deja su parte más grande. */
function withoutIslets(f: Feature<Geometry, Props>): Feature<Geometry, Props> {
  if (f.geometry?.type !== 'MultiPolygon') return f;
  const parts = f.geometry.coordinates.map((coordinates) => ({
    coordinates,
    area: geoArea({ type: 'Polygon', coordinates }),
  }));
  const largest = Math.max(...parts.map((p) => p.area));
  const kept = parts.filter((p) => p.area >= GLOBE_MIN_ISLAND || p.area === largest);
  return { ...f, geometry: { type: 'MultiPolygon', coordinates: kept.map((p) => p.coordinates) } };
}

function dotsFor(countries: Country[], project: (location: LonLat) => Point | null): Dot[] {
  return countries.flatMap((c) => {
    const point = c.label_point && project(c.label_point);
    if (!point) return [];
    return [
      {
        id: c.iso3,
        x: point[0],
        y: point[1],
        name: c.name_es,
        territory: !c.counts_in_progress,
      },
    ];
  });
}

/** México por estados en Mercator, ajustado al país. */
export function drawMexico(
  topology: Topology,
  states: Pick<Subdivision, 'code' | 'name_es'>[],
  width = 800,
  height = 520,
) {
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
