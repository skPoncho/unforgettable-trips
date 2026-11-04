/**
 * Datos de prueba con la forma exacta de la API (tipos generados desde el OpenAPI).
 * Reproducen en pequeño las semillas: Japón visitado, Panamá como escala, México casa.
 */
import type { Topology } from 'topojson-specification';

import type {
  Country,
  CountrySummary,
  MemoryCreated,
  MemorySuggestion,
  Progress,
  Trip,
  TripDetail,
  TripMemory,
  TripStop,
  UploadedPhoto,
  UserMap,
} from '../app/core/api/types';

// Cuadrados en sentido horario (convención de d3-geo para polígonos pequeños).
const square = (x: number, y: number) => [
  [x, y],
  [x, y + 5],
  [x + 5, y + 5],
  [x + 5, y],
  [x, y],
];

export const worldTopology: Topology = {
  type: 'Topology',
  arcs: [square(135, 33), square(-105, 20), square(-80, 7), square(-65, -40), square(-50, 70)],
  objects: {
    countries: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', id: 'JPN', arcs: [[0]] },
        { type: 'Polygon', id: 'MEX', arcs: [[1]] },
        { type: 'Polygon', id: 'PAN', arcs: [[2]] },
        { type: 'Polygon', id: 'ARG', arcs: [[3]] },
        { type: 'Polygon', id: 'GRL', arcs: [[4]] },
      ],
    },
  },
};

const country = (
  iso3: string,
  name_es: string,
  continent: Country['continent'],
  lon: number,
  lat: number,
  counts = true,
): Country => ({
  iso3,
  iso2: iso3.slice(0, 2),
  name_es,
  continent,
  counts_in_progress: counts,
  sovereign_iso3: counts ? null : 'DNK',
  label_point: { lon, lat },
});

export const countries: Country[] = [
  country('JPN', 'Japón', 'asia', 137.5, 35.5),
  country('MEX', 'México', 'america', -102.5, 22.5),
  country('PAN', 'Panamá', 'america', -77.5, 9.5),
  country('ARG', 'Argentina', 'america', -62.5, -37.5),
  country('EGY', 'Egipto', 'africa', 30, 26),
  country('GRL', 'Groenlandia', 'america', -47.5, 72.5, false),
];

export const progress: Progress = {
  countries: { visited: 3, total: 195, stopover_only: 1 },
  continents: [
    { continent: 'america', visited: 2, total: 35 },
    { continent: 'europe', visited: 0, total: 44 },
    { continent: 'asia', visited: 1, total: 48 },
    { continent: 'africa', visited: 0, total: 54 },
    { continent: 'oceania', visited: 0, total: 14 },
  ],
  subdivisions: { country_iso3: 'MEX', visited: 1, total: 32 },
  cities: 2,
  monuments: 1,
  trips: 1,
  photos: 84,
  wishlist: 2,
};

export const userMap: UserMap = {
  countries: [
    {
      iso3: 'JPN',
      status: 'visited',
      first_visited_on: '2025-03-08',
      is_home: false,
      counts_in_progress: true,
    },
    {
      iso3: 'MEX',
      status: 'visited',
      first_visited_on: null,
      is_home: true,
      counts_in_progress: true,
    },
    {
      iso3: 'PAN',
      status: 'stopover',
      first_visited_on: '2025-03-08',
      is_home: false,
      counts_in_progress: true,
    },
  ],
  subdivisions: [
    { code: 'MX-CMX', status: 'visited', first_visited_on: null, is_home: true },
    { code: 'MX-OAX', status: 'visited', first_visited_on: '2019-04-13', is_home: false },
  ],
  cities: [
    {
      id: 1850147,
      name_es: 'Tokio',
      country_iso3: 'JPN',
      location: { lon: 139.69, lat: 35.69 },
      status: 'visited',
      first_visited_on: '2025-03-08',
      is_home: false,
    },
  ],
  monuments: [
    {
      id: 1,
      slug: 'fushimi-inari',
      name_es: 'Fushimi Inari-taisha',
      country_iso3: 'JPN',
      location: { lon: 135.77, lat: 34.97 },
      first_stamped_on: '2025-03-13',
    },
  ],
  wishlist: ['EGY', 'ARG'],
};

export const JAPAN_TRIP_ID = 'ea4d5b39-0ca3-40f5-a6f7-2024345fe951';

export const japanSummary: CountrySummary = {
  iso3: 'JPN',
  name_es: 'Japón',
  status: 'visited',
  is_home: false,
  counts_in_progress: true,
  first_visited_on: '2025-03-08',
  last_visited_on: '2025-03-20',
  days: 14,
  cities: 6,
  monuments: 4,
  photos: 84,
  photo_ids: ['p1', 'p2', 'p3'],
  trips: [
    {
      id: JAPAN_TRIP_ID,
      title: 'Japón',
      visibility: 'public',
      visit_type: 'stay',
      starts_on: '2025-03-08',
      ends_on: '2025-03-21',
    },
  ],
  stopovers: [],
};

export const panamaSummary: CountrySummary = {
  ...japanSummary,
  iso3: 'PAN',
  name_es: 'Panamá',
  status: 'stopover',
  last_visited_on: '2025-03-08',
  days: 0,
  cities: 0,
  monuments: 0,
  photos: 0,
  photo_ids: [],
  trips: [{ ...japanSummary.trips[0], visit_type: 'stopover', ends_on: '2025-03-08' }],
  stopovers: [
    { place_name: 'Aeropuerto de Tocumen', note: '3 h en Tocumen', arrived_on: '2025-03-08' },
  ],
};

export const japanTrip: Trip = {
  id: JAPAN_TRIP_ID,
  title: 'Japón',
  summary: null,
  visibility: 'public',
  share_token: null,
  is_auto: false,
  cover_photo_id: 'p1',
  favorite_memory_id: null,
  starts_on: '2025-03-08',
  ends_on: '2025-03-21',
  days: 14,
  stop_count: 7,
  city_count: 6,
  memory_count: 7,
  photo_count: 84,
  monument_count: 4,
  countries: ['JPN'],
  stopover_countries: ['PAN'],
  created_at: '2026-11-03T00:00:00Z',
  updated_at: '2026-11-03T00:00:00Z',
};

// --- Nuevo recuerdo (fase 4) ------------------------------------------------------------

/** kioto_gps.jpg recién subida (sin recuerdo). */
export const kyotoPhoto: UploadedPhoto = {
  id: 'ph-kioto',
  memory_id: null,
  position: 0,
  width: 1200,
  height: 800,
  taken_at: '2025-03-12T23:10:00Z',
  taken_on: '2025-03-13',
  location: { lon: 135.77, lat: 35.01 },
  filename: 'kioto_gps.jpg',
  duplicate: false,
};

export const KYOTO_STOP_ID = 'b1c1f2a0-0000-4000-8000-00000000c10b';

/** Lo que sugiere la API para kioto_gps.jpg con las semillas. */
export const kyotoSuggestion: MemorySuggestion = {
  photo_count: 1,
  located_count: 1,
  place: {
    place_name: 'Kioto',
    location: { lon: 135.77, lat: 35.01 },
    city: { id: 1857910, name_es: 'Kioto' },
    subdivision: null,
    country: { iso3: 'JPN', name_es: 'Japón' },
  },
  arrived_on: '2025-03-13',
  departed_on: '2025-03-13',
  monuments: [
    {
      id: 7,
      slug: 'fushimi-inari',
      name_es: 'Fushimi Inari-taisha',
      stamp_code: 'INA',
      distance_km: 4.8,
    },
  ],
  trips: [
    {
      id: JAPAN_TRIP_ID,
      title: 'Japón 2025',
      visibility: 'link',
      is_auto: false,
      starts_on: '2025-03-08',
      ends_on: '2025-03-21',
      stop_id: KYOTO_STOP_ID,
    },
  ],
};

export const kyotoMemory: MemoryCreated = {
  id: 'm-kioto',
  trip_id: JAPAN_TRIP_ID,
  stop_id: KYOTO_STOP_ID,
  monument: null,
  body: '',
  occurred_on: '2025-03-13',
  visibility: null,
  effective_visibility: 'link',
  photo_count: 1,
  created_at: '2026-11-04T00:00:00Z',
  updated_at: '2026-11-04T00:00:00Z',
  lit: { countries: [], subdivisions: [], cities: [] },
};

// --- Detalle de viaje (fase 5) -----------------------------------------------------------

function tripStop(
  position: number,
  place_name: string,
  lon: number,
  lat: number,
  arrived_on: string,
  departed_on: string = arrived_on,
  extra: Partial<TripStop> = {},
): TripStop {
  const id = `stop-${position}`;
  return {
    id,
    trip_id: JAPAN_TRIP_ID,
    position,
    visit_type: 'stay',
    place_name,
    city: { id: 100 + position, name_es: place_name },
    country: { iso3: 'JPN', name_es: 'Japón' },
    subdivision: null,
    location: { lon, lat },
    arrived_on,
    departed_on,
    note: null,
    memories: [],
    ...extra,
  };
}

function tripMemory(stopId: string, body: string, photos: number, monument?: string): TripMemory {
  return {
    id: `memory-${stopId}`,
    trip_id: JAPAN_TRIP_ID,
    stop_id: stopId,
    monument: monument
      ? { id: 1, slug: monument.toLowerCase(), name_es: monument, stamp_code: 'JP-1' }
      : null,
    body,
    occurred_on: null,
    visibility: null,
    effective_visibility: 'public',
    photo_count: photos,
    photos: Array.from({ length: photos }, (_, i) => ({
      id: `${stopId}-photo-${i + 1}`,
      width: 1600,
      height: 1200,
    })),
    created_at: '2026-11-03T00:00:00Z',
    updated_at: '2026-11-03T00:00:00Z',
  };
}

function withMemory(stop: TripStop, body: string, photos: number, monument?: string): TripStop {
  return { ...stop, memories: [tripMemory(stop.id, body, photos, monument)] };
}

/** El viaje a Japón de las semillas: escala en Tocumen y 6 estancias (Kioto es el pin 3). */
export const japanTripDetail: TripDetail = {
  ...japanTrip,
  summary: 'De Tokio a Hiroshima en tren bala.',
  favorite_memory_id: 'memory-stop-2',
  route_km: 725.2,
  trip_number: 12,
  trip_total: 13,
  continent: 'asia',
  stops: [
    tripStop(0, 'Aeropuerto de Tocumen', -79.3835, 9.0714, '2025-03-08', '2025-03-08', {
      visit_type: 'stopover',
      city: null,
      country: { iso3: 'PAN', name_es: 'Panamá' },
      note: '3 h en Tocumen',
    }),
    withMemory(
      tripStop(1, 'Tokio', 139.6917, 35.6895, '2025-03-08', '2025-03-11'),
      'Primer ramen a la una de la mañana.',
      26,
      'Templo Sensō-ji',
    ),
    withMemory(
      tripStop(2, 'Hakone', 139.025, 35.195, '2025-03-12'),
      'El Fuji apareció diez minutos desde el barco.',
      9,
    ),
    withMemory(
      tripStop(3, 'Kioto', 135.7681, 35.0116, '2025-03-13', '2025-03-16'),
      'Subimos Fushimi Inari a las siete de la mañana.',
      28,
      'Fushimi Inari-taisha',
    ),
    withMemory(
      tripStop(4, 'Nara', 135.8048, 34.6851, '2025-03-17'),
      'Los ciervos te hacen reverencia.',
      8,
      'Tōdai-ji',
    ),
    withMemory(tripStop(5, 'Osaka', 135.5023, 34.6937, '2025-03-18', '2025-03-19'), 'Takoyaki.', 7),
    withMemory(
      tripStop(6, 'Hiroshima', 132.4553, 34.3853, '2025-03-20', '2025-03-21'),
      'El día más silencioso del viaje.',
      6,
      'Cúpula de la Bomba Atómica',
    ),
  ],
};
