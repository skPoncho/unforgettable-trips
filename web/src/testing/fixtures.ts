/**
 * Datos de prueba con la forma exacta de la API (tipos generados desde el OpenAPI).
 * Reproducen en pequeño las semillas: Japón visitado, Panamá como escala, México casa.
 */
import type { Topology } from 'topojson-specification';

import type {
  CityOverview,
  Country,
  CountrySummary,
  MemoryCreated,
  MemorySuggestion,
  Me,
  Passport,
  Progress,
  SearchResults,
  SubdivisionOverview,
  Timeline,
  TimelineProgress,
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

/** Progreso de un año de la historia: solo cambian países y continentes. */
const yearProgress = (america: number, asia: number, stopovers: number): TimelineProgress => ({
  countries: { visited: america + asia, total: 195, stopover_only: stopovers },
  continents: progress.continents.map((c) => ({
    ...c,
    visited: c.continent === 'america' ? america : c.continent === 'asia' ? asia : 0,
  })),
  subdivisions: { country_iso3: 'MEX', visited: 2, total: 32 },
});

/** Línea de tiempo de userMap: México por la casa, Oaxaca en 2019, Japón y Panamá en 2025. */
export const timeline: Timeline = {
  home: { countries: ['MEX'], subdivisions: ['MX-CMX'], cities: [] },
  years: [
    {
      year: 2019,
      countries: [],
      subdivisions: [{ code: 'MX-OAX', status: 'visited' }],
      cities: [],
      progress: yearProgress(1, 0, 0),
    },
    ...[2020, 2021, 2022, 2023, 2024].map((year) => ({
      year,
      countries: [],
      subdivisions: [],
      cities: [],
      progress: yearProgress(1, 0, 0),
    })),
    {
      year: 2025,
      countries: [
        { iso3: 'JPN', status: 'visited' },
        { iso3: 'PAN', status: 'stopover' },
      ],
      subdivisions: [],
      cities: [{ id: 1850147, status: 'visited' }],
      progress: yearProgress(2, 1, 1),
    },
  ],
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

// --- Mi país (fase 6) ---------------------------------------------------------------------

/** Tres "estados" cuadrados: CDMX (casa), Oaxaca (visitado) y Yucatán (por descubrir). */
export const mexicoTopology: Topology = {
  type: 'Topology',
  arcs: [square(-100, 19), square(-97, 16), square(-90, 20)],
  objects: {
    states: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', id: 'MX-CMX', arcs: [[0]] },
        { type: 'Polygon', id: 'MX-OAX', arcs: [[1]] },
        { type: 'Polygon', id: 'MX-YUC', arcs: [[2]] },
      ],
    },
  },
};

export const mexicoStates: SubdivisionOverview[] = [
  {
    code: 'MX-CMX',
    name_es: 'Ciudad de México',
    status: 'visited',
    is_home: true,
    first_visited_on: null,
  },
  {
    code: 'MX-OAX',
    name_es: 'Oaxaca',
    status: 'visited',
    is_home: false,
    first_visited_on: '2019-04-13',
  },
  { code: 'MX-YUC', name_es: 'Yucatán', status: null, is_home: false, first_visited_on: null },
];

export const mexicoCities: CityOverview[] = [
  {
    id: 3530597,
    name_es: 'Ciudad de México',
    subdivision_code: 'MX-CMX',
    subdivision_name: 'Ciudad de México',
    status: 'visited',
    is_home: true,
    trips: 0,
    last_visited_on: null,
  },
  {
    id: 3522507,
    name_es: 'Oaxaca de Juárez',
    subdivision_code: 'MX-OAX',
    subdivision_name: 'Oaxaca',
    status: 'visited',
    is_home: false,
    trips: 2,
    last_visited_on: '2024-12-20',
  },
];

export const OAXACA_TRIP_ID = 'cbc5749f-396f-4972-b18b-5c3a898a022b';

export const mexicoPassport: Passport = {
  country_iso3: 'MEX',
  stamps: [
    {
      id: 3,
      slug: 'teotihuacan',
      name_es: 'Teotihuacán',
      stamp_code: 'TEO',
      kind: 'unesco',
      subdivision_code: 'MX-MEX',
      subdivision_name: 'Estado de México',
      location: { lon: -98.84, lat: 19.69 },
      first_stamped_on: '2019-04-13',
      memories: 1,
      photo_count: 0,
      photo_ids: [],
      trip: { id: 'a1b2c3d4-0000-4000-8000-000000000001', title: 'Escapada', stop_number: 1 },
    },
    {
      id: 4,
      slug: 'monte-alban',
      name_es: 'Monte Albán',
      stamp_code: 'MA',
      kind: 'unesco',
      subdivision_code: 'MX-OAX',
      subdivision_name: 'Oaxaca',
      location: { lon: -96.77, lat: 17.04 },
      first_stamped_on: '2024-12-20',
      memories: 2,
      photo_count: 24,
      photo_ids: [
        'f0000000-0000-4000-8000-000000000001',
        'f0000000-0000-4000-8000-000000000002',
        'f0000000-0000-4000-8000-000000000003',
      ],
      trip: { id: OAXACA_TRIP_ID, title: 'Oaxaca y Chiapas', stop_number: 2 },
    },
  ],
  suggested: [
    {
      id: 41,
      slug: 'teopanzolco',
      name_es: 'Teopanzolco',
      stamp_code: 'TPZ',
      kind: 'archaeological',
      subdivision_code: 'MX-MOR',
      subdivision_name: 'Morelos',
      location: { lon: -99.22, lat: 18.93 },
      near: 'Cuernavaca',
      distance_km: 0.7,
    },
  ],
};

export const me: Me = {
  id: '0f1e2a3b-0000-4000-8000-00000000ca71',
  handle: 'carlos',
  display_name: 'Carlos Barrón',
  home_city: {
    id: 3530597,
    name_es: 'Ciudad de México',
    country_iso3: 'MEX',
    subdivision_code: 'MX-CMX',
  },
  theme: 'system',
  profile_public: false,
};

/** /api/search?q=kioto con las semillas: la ciudad, el viaje y el recuerdo de Fushimi Inari. */
export const kyotoSearch: SearchResults = {
  places: [
    {
      kind: 'city',
      key: '1857910',
      name: 'Kioto',
      context: 'Japón',
      country_iso3: 'JPN',
      is_home: false,
      trip_id: JAPAN_TRIP_ID,
      stop_number: 3,
    },
  ],
  trips: [
    {
      id: JAPAN_TRIP_ID,
      title: 'Japón',
      starts_on: '2025-03-08',
      ends_on: '2025-03-21',
      matched_place: 'Kioto',
    },
  ],
  memories: [
    {
      id: '4c29efd8-735d-433d-a531-11666393f9f5',
      trip_id: JAPAN_TRIP_ID,
      trip_title: 'Japón',
      stop_number: 3,
      place_name: 'Kioto',
      monument_name: 'Fushimi Inari-taisha',
      occurred_on: '2025-03-13',
      snippet: 'Subimos Fushimi Inari a las siete de la mañana para evitar a la gente.',
      photo_id: null,
    },
  ],
};
