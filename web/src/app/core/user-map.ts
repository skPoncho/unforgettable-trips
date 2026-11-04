import type { UserMap } from './api/types';

/**
 * Año de la primera visita registrada. Se mira también estados y ciudades porque el país de
 * casa no tiene fecha (cuenta desde siempre), pero sus viajes sí. Null si no hay fechas.
 */
export function firstVisitYear(map: UserMap): number | null {
  const years = [...map.countries, ...map.subdivisions, ...map.cities]
    .map((place) => place.first_visited_on)
    .filter((d): d is string => d !== null)
    .map((d) => Number(d.slice(0, 4)));
  return years.length ? Math.min(...years) : null;
}
