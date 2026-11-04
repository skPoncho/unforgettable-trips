/** Lo que la pantalla de viaje deriva del detalle de la API (solo presentación). */

import type { TripDetail, TripMemory, TripPhoto, TripStop } from '../../core/trips-api';

export interface StayEntry {
  stop: TripStop;
  /** Número del pin: las estancias se numeran en orden; las escalas no. */
  n: number;
  photos: TripPhoto[];
  monuments: string[];
}

export function stayEntries(trip: TripDetail): StayEntry[] {
  return trip.stops
    .filter((s) => s.visit_type === 'stay')
    .map((stop, i) => ({
      stop,
      n: i + 1,
      photos: stop.memories.flatMap((m) => m.photos),
      monuments: [
        ...new Set(stop.memories.flatMap((m) => (m.monument ? [m.monument.name_es] : []))),
      ],
    }));
}

/** "Ida con escala en Aeropuerto de Tocumen, Panamá (3 h en Tocumen): ya cuenta…". */
export function stopoverNotices(trip: TripDetail): string[] {
  const stays = trip.stops.filter((s) => s.visit_type === 'stay');
  const first = stays[0]?.position ?? Infinity;
  const last = stays[stays.length - 1]?.position ?? -Infinity;
  const stayCountries = new Set(stays.map((s) => s.country.iso3));
  return trip.stops
    .filter((s) => s.visit_type === 'stopover')
    .map((s) => {
      const lead =
        s.position < first
          ? 'Ida con escala en'
          : s.position > last
            ? 'Regreso con escala en'
            : 'Escala en';
      const where = s.place_name.includes(s.country.name_es)
        ? s.place_name
        : `${s.place_name}, ${s.country.name_es}`;
      const note = s.note ? ` (${s.note})` : '';
      const counts = stayCountries.has(s.country.iso3) ? '' : ': ya cuenta como país visitado';
      return `${lead} ${where}${note}${counts}.`;
    });
}

export function findMemory(trip: TripDetail, memoryId: string | null): TripMemory | null {
  if (!memoryId) return null;
  for (const stop of trip.stops) {
    const found = stop.memories.find((m) => m.id === memoryId);
    if (found) return found;
  }
  return null;
}
