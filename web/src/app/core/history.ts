import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import type { PlaceStatus, Timeline, TimelineProgress, UserMap } from './api/types';

/** Cuánto dura cada año al reproducir la historia. */
export const HISTORY_STEP_MS = 1400;

/** El mapa como estaba al cierre de un año, con lo que se encendió ese año. */
export interface HistoryFrame {
  year: number;
  map: UserMap;
  progress: TimelineProgress;
  lit: { countries: ReadonlySet<string>; cities: ReadonlySet<number> };
}

/**
 * Recorta el mapa del usuario a lo encendido hasta `year`, con el estado de ese momento
 * (Panamá como escala hasta que hubo una estancia). Los cambios por año y la casa vienen de
 * /api/me/timeline: aquí solo se acumulan, sin repetir reglas de negocio.
 */
export function mapAtYear(map: UserMap, timeline: Timeline, year: number): HistoryFrame | null {
  const frame = timeline.years.find((y) => y.year === year);
  if (!frame) return null;

  const countries = new Map<string, PlaceStatus>(
    timeline.home.countries.map((iso3) => [iso3, 'visited']),
  );
  const subdivisions = new Map<string, PlaceStatus>(
    timeline.home.subdivisions.map((code) => [code, 'visited']),
  );
  const cities = new Map<number, PlaceStatus>(timeline.home.cities.map((id) => [id, 'visited']));
  for (const y of timeline.years) {
    if (y.year > year) break;
    for (const c of y.countries) countries.set(c.iso3, c.status);
    for (const s of y.subdivisions) subdivisions.set(s.code, s.status);
    for (const c of y.cities) cities.set(c.id, c.status);
  }

  return {
    year,
    progress: frame.progress,
    lit: {
      countries: new Set(frame.countries.map((c) => c.iso3)),
      cities: new Set(frame.cities.map((c) => c.id)),
    },
    map: {
      ...map,
      countries: map.countries.flatMap((c) => {
        const status = countries.get(c.iso3);
        return status ? [{ ...c, status }] : [];
      }),
      subdivisions: map.subdivisions.flatMap((s) => {
        const status = subdivisions.get(s.code);
        return status ? [{ ...s, status }] : [];
      }),
      cities: map.cities.flatMap((c) => {
        const status = cities.get(c.id);
        return status ? [{ ...c, status }] : [];
      }),
      monuments: map.monuments.filter((m) => Number(m.first_stamped_on.slice(0, 4)) <= year),
    },
  };
}

/**
 * Reproduce tu historia: el año que se muestra y la reproducción automática.
 * `year` nulo es hoy (el mapa completo, sin animar). Se provee en Mi mapa.
 */
@Injectable()
export class HistoryPlayer {
  /** Años de la línea de tiempo, del primero al actual. */
  readonly years = signal<readonly number[]>([]);
  /** Año elegido; null = hoy. */
  readonly year = signal<number | null>(null);
  readonly playing = signal(false);

  /** El año que se marca en la barra (hoy es el último). */
  readonly shown = computed(() => this.year() ?? this.years().at(-1) ?? null);

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  /** Nuevos años (al cargar o al cambiar los datos): vuelve a hoy. */
  setYears(years: readonly number[]): void {
    this.pause();
    this.years.set(years);
    this.year.set(null);
  }

  toggle(): void {
    if (this.playing()) this.pause();
    else this.play();
  }

  /** Desde el año elegido o, si está en hoy o en el último, desde el principio. */
  play(): void {
    const years = this.years();
    if (!years.length) return;
    const current = this.year();
    if (current === null || current === years.at(-1)) this.year.set(years[0]);
    this.playing.set(true);
    this.clearTimer();
    if (years.length === 1) {
      this.pause();
      return;
    }
    this.timer = setInterval(() => this.step(), HISTORY_STEP_MS);
  }

  pause(): void {
    this.playing.set(false);
    this.clearTimer();
  }

  /** Vuelve a hoy (el mapa completo). */
  present(): void {
    this.pause();
    this.year.set(null);
  }

  /** Elegir un año pausa la reproducción. */
  pick(year: number): void {
    this.pause();
    this.year.set(year);
  }

  private step(): void {
    const years = this.years();
    const next = years[years.indexOf(this.year() ?? years[0]) + 1];
    if (next === undefined) {
      this.pause();
      return;
    }
    this.year.set(next);
    // Se queda en el último año: es el mapa completo, con lo de ese año recién encendido.
    if (next === years.at(-1)) this.pause();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
