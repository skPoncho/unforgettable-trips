/** Formatos de la interfaz (español de México). Solo presentación: los datos vienen de la API. */

import type { Continent, Visibility } from './api/types';

const MONTH_YEAR = new Intl.DateTimeFormat('es-MX', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Fecha ISO (`2025-03-08`) → `mar 2025`. */
export function monthYear(isoDate: string): string {
  const parts = MONTH_YEAR.formatToParts(new Date(`${isoDate}T00:00:00Z`));
  const month = parts.find((p) => p.type === 'month')?.value.replace('.', '') ?? '';
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  return `${month} ${year}`;
}

const DAY_MONTH_YEAR = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function dateParts(isoDate: string) {
  const parts = DAY_MONTH_YEAR.formatToParts(new Date(`${isoDate}T00:00:00Z`));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: get('day'), month: get('month').replace('.', ''), year: get('year') };
}

/** Fechas ISO → `13 mar 2025`, `13–16 mar 2025`, `28 feb – 2 mar 2025`. */
export function dateRange(from: string, to: string = from): string {
  const a = dateParts(from);
  const b = dateParts(to);
  if (from === to) return `${a.day} ${a.month} ${a.year}`;
  if (a.year !== b.year) return `${a.day} ${a.month} ${a.year} – ${b.day} ${b.month} ${b.year}`;
  if (a.month !== b.month) return `${a.day} ${a.month} – ${b.day} ${b.month} ${b.year}`;
  return `${a.day}–${b.day} ${a.month} ${a.year}`;
}

/** Fechas ISO → `12 mar`, `8–11 mar`, `28 feb – 2 mar` (sin año, dentro de un viaje). */
export function dayMonthRange(from: string, to: string = from): string {
  const a = dateParts(from);
  const b = dateParts(to);
  if (from === to) return `${a.day} ${a.month}`;
  if (a.month !== b.month || a.year !== b.year) return `${a.day} ${a.month} – ${b.day} ${b.month}`;
  return `${a.day}–${b.day} ${a.month}`;
}

/** Días transcurridos desde `start` (el día de inicio es el 1): `Día 5`, `Días 1–4`. */
export function tripDays(start: string, from: string, to: string = from): string {
  const day = (iso: string) =>
    Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) +
    1;
  const a = day(from);
  const b = day(to);
  return a === b ? `Día ${a}` : `Días ${a}–${b}`;
}

/** `14 días`, `1 ciudad`, `3 ciudades`. */
export function count(n: number, singular: string, plural: string): string {
  return `${n.toLocaleString('es-MX')} ${n === 1 ? singular : plural}`;
}

export const CONTINENT_NAMES: Record<Continent, string> = {
  america: 'América',
  europe: 'Europa',
  asia: 'Asia',
  africa: 'África',
  oceania: 'Oceanía',
};

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: 'Privado',
  link: 'Con enlace',
  public: 'Público',
};

/** Qué significa cada visibilidad, para quien la elige. */
export const VISIBILITY_HINTS: Record<Visibility, string> = {
  private: 'Solo tú puedes verlo',
  link: 'Cualquiera con el enlace puede verlo',
  public: 'Visible en tu perfil público',
};

/** Hitos de países: de 5 en 5 al principio, después más espaciados, hasta los 195. */
const MILESTONES = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175, 195];

/** Próximo hito por encima de `visited`, o null si ya están todos. */
export function nextMilestone(visited: number): number | null {
  return MILESTONES.find((m) => m > visited) ?? null;
}
