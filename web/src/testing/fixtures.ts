/**
 * Datos de prueba con la forma exacta de la API (tipos generados desde el OpenAPI).
 * Reproducen en pequeño las semillas: Japón visitado, Panamá como escala, México casa.
 */
import type { Topology } from 'topojson-specification';

import type { Country, CountrySummary, Progress, Trip, UserMap } from '../app/core/api/types';

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
