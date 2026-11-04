/** Búsqueda del encabezado: a dónde lleva cada resultado y cómo se presenta. */

import type { SearchMemory, SearchPlace, SearchResults, SearchTrip } from './api/types';
import { dateRange, monthYear } from './format';

export type SearchGroup = 'places' | 'trips' | 'memories';
export type SearchIcon = 'country' | 'subdivision' | 'city' | 'monument' | 'trip' | 'memory';

export const SEARCH_GROUPS: readonly { id: SearchGroup; label: string }[] = [
  { id: 'places', label: 'Lugares' },
  { id: 'trips', label: 'Viajes' },
  { id: 'memories', label: 'Recuerdos' },
];

/** Destino de un resultado, listo para `router.navigate(commands, { queryParams })`. */
export interface SearchLink {
  commands: string[];
  queryParams?: Record<string, string | number>;
}

export interface SearchOption {
  id: string;
  group: SearchGroup;
  icon: SearchIcon;
  title: string;
  detail: string;
  /** Fragmento del texto del recuerdo. */
  snippet?: string;
  photoId?: string;
  link: SearchLink;
}

/** Mi país solo existe para México por ahora (docs/PLAN.md, fase 6). */
const MY_COUNTRY = 'MEX';

const KIND_LABELS: Record<SearchPlace['kind'], string> = {
  country: 'País',
  subdivision: 'Estado',
  city: 'Ciudad',
  monument: 'Monumento',
};

function tripLink(tripId: string, stopNumber: number | null): SearchLink {
  return stopNumber
    ? { commands: ['/viajes', tripId], queryParams: { parada: stopNumber } }
    : { commands: ['/viajes', tripId] };
}

/**
 * País → su tarjeta en Mi mapa; estado → Mi país resaltado; ciudad o monumento → la estancia
 * más reciente ahí. Una ciudad que solo es la casa va a Ciudades de Mi país (o a su país).
 */
export function placeLink(place: SearchPlace): SearchLink {
  if (place.kind === 'subdivision') {
    return { commands: ['/mi-pais'], queryParams: { estado: place.key } };
  }
  if (place.kind !== 'country' && place.trip_id) return tripLink(place.trip_id, place.stop_number);
  if (place.kind === 'city' && place.country_iso3 === MY_COUNTRY) {
    return { commands: ['/mi-pais'], queryParams: { pestana: 'ciudades' } };
  }
  return { commands: ['/'], queryParams: { pais: place.country_iso3 } };
}

function placeOption(place: SearchPlace): SearchOption {
  const detail = [KIND_LABELS[place.kind], place.context, place.is_home ? 'Casa' : null]
    .filter(Boolean)
    .join(' · ');
  return {
    id: `place-${place.kind}-${place.key}`,
    group: 'places',
    icon: place.kind,
    title: place.name,
    detail,
    link: placeLink(place),
  };
}

function tripOption(trip: SearchTrip): SearchOption {
  const when = trip.starts_on ? dateRange(trip.starts_on, trip.ends_on ?? trip.starts_on) : null;
  const via = trip.matched_place ? `pasa por ${trip.matched_place}` : null;
  return {
    id: `trip-${trip.id}`,
    group: 'trips',
    icon: 'trip',
    title: trip.title,
    detail: [when, via].filter(Boolean).join(' · ') || 'Sin paradas',
    link: { commands: ['/viajes', trip.id] },
  };
}

function memoryOption(memory: SearchMemory): SearchOption {
  const title = memory.monument_name ?? memory.place_name;
  return {
    id: `memory-${memory.id}`,
    group: 'memories',
    icon: 'memory',
    title,
    detail: [memory.trip_title, monthYear(memory.occurred_on)].join(' · '),
    snippet: memory.snippet,
    photoId: memory.photo_id ?? undefined,
    link: tripLink(memory.trip_id, memory.stop_number),
  };
}

/** Resultados en el orden en que se muestran y se recorren con las flechas. */
export function searchOptions(results: SearchResults): SearchOption[] {
  return [
    ...results.places.map(placeOption),
    ...results.trips.map(tripOption),
    ...results.memories.map(memoryOption),
  ];
}

/** Minúsculas sin acentos, carácter por carácter (mismo largo que el original). */
function fold(text: string): string {
  return [...text].map((ch) => ch.toLowerCase().normalize('NFD')[0]).join('');
}

export interface Highlighted {
  text: string;
  match: boolean;
}

/** Parte el texto para resaltar la coincidencia sin acentos ni mayúsculas ("kioto" en "Kiotó"). */
export function highlight(text: string, q: string): Highlighted[] {
  const needle = fold(q.trim());
  if (!needle) return [{ text, match: false }];
  const chars = [...text];
  const haystack = fold(text);
  const parts: Highlighted[] = [];
  let from = 0;
  let at = haystack.indexOf(needle);
  while (at >= 0) {
    if (at > from) parts.push({ text: chars.slice(from, at).join(''), match: false });
    parts.push({ text: chars.slice(at, at + needle.length).join(''), match: true });
    from = at + needle.length;
    at = haystack.indexOf(needle, from);
  }
  if (from < chars.length) parts.push({ text: chars.slice(from).join(''), match: false });
  return parts;
}
