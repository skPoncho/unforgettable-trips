import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowRight } from '@lucide/angular';

import { count, monthYear } from '../../core/format';
import type { CountrySummary } from '../../core/me-api';
import { photoUrl } from '../../core/trips-api';

/** Cuántos viajes se listan en la tarjeta cuando hay varios. */
const MAX_TRIPS = 3;

/** Tarjeta de un país visitado en Mi mapa: fotos, fecha, conteos y acceso a sus viajes. */
@Component({
  selector: 'app-country-card',
  imports: [RouterLink, LucideArrowRight],
  template: `
    @if (summary(); as s) {
      @if (photos().length) {
        <div class="photos" [class.photos--single]="photos().length === 1">
          @for (src of photos(); track src; let i = $index) {
            <span class="photo" [class.photo--cover]="i === 0">
              <img [src]="src" alt="" />
              @if (i === 2 && morePhotos()) {
                <span class="photo__more">+{{ morePhotos() }}</span>
              }
            </span>
          }
        </div>
      }
      <div class="head">
        <h3 class="name">{{ s.name_es }}</h3>
        <span class="when">{{ when() }}</span>
      </div>
      @if (tags().length) {
        <div class="tags">
          @for (tag of tags(); track tag) {
            <span class="tag">{{ tag }}</span>
          }
        </div>
      }
      <p class="stats">{{ stats() }}</p>
      @if (s.trips.length === 1) {
        <a class="open" [routerLink]="['/viajes', s.trips[0].id]">
          Abrir viaje
          <svg lucideArrowRight [size]="16" [strokeWidth]="2.2" aria-hidden="true"></svg>
        </a>
      } @else if (s.trips.length > 1) {
        <ul class="trips" aria-label="Viajes a {{ s.name_es }}">
          @for (t of shownTrips(); track t.id) {
            <li>
              <a class="trip" [routerLink]="['/viajes', t.id]">
                <span class="trip__title">{{ t.title }}</span>
                <span class="trip__when">{{ month(t.starts_on) }}</span>
                <svg lucideArrowRight [size]="15" aria-hidden="true"></svg>
              </a>
            </li>
          }
        </ul>
        @if (s.trips.length > shownTrips().length) {
          <span class="more-trips">y {{ count(s.trips.length - shownTrips().length) }}</span>
        }
      }
    } @else {
      <div class="head">
        <h3 class="name">{{ name() }}</h3>
      </div>
      <p class="stats" role="status">Cargando…</p>
    }
  `,
  styleUrl: './country-card.scss',
})
export class CountryCard {
  /** Undefined mientras llega de la API. */
  readonly summary = input.required<CountrySummary | undefined>();
  readonly name = input.required<string>();

  protected readonly photos = computed(() =>
    (this.summary()?.photo_ids ?? []).map((id) => photoUrl(id)),
  );

  /** Las que no caben: la tercera muestra "+N" encima. */
  protected readonly morePhotos = computed(() => Math.max(0, (this.summary()?.photos ?? 0) - 3));

  protected readonly when = computed(() => {
    const s = this.summary();
    if (!s) return '';
    if (s.last_visited_on) return monthYear(s.last_visited_on).toUpperCase();
    return s.is_home ? 'DESDE SIEMPRE' : '';
  });

  protected readonly tags = computed(() => {
    const s = this.summary();
    if (!s) return [];
    return [
      s.is_home ? 'Casa' : null,
      s.status === 'stopover' ? 'Escala' : null,
      s.counts_in_progress ? null : 'No suma al progreso',
    ].filter((t): t is string => t !== null);
  });

  protected readonly stats = computed(() => {
    const s = this.summary();
    if (!s) return '';
    if (s.status === 'stopover') {
      const stop = s.stopovers[0];
      const detail = stop ? (stop.note ?? stop.place_name) : null;
      return ['Solo escala', detail].filter(Boolean).join(' · ');
    }
    const parts = [
      s.trips.length > 1 ? count(s.trips.length, 'viaje', 'viajes') : null,
      s.days ? count(s.days, 'día', 'días') : null,
      count(s.cities, 'ciudad', 'ciudades'),
      s.monuments ? count(s.monuments, 'monumento', 'monumentos') : null,
      count(s.photos, 'foto', 'fotos'),
    ];
    return parts.filter(Boolean).join(' · ');
  });

  protected readonly shownTrips = computed(() => (this.summary()?.trips ?? []).slice(0, MAX_TRIPS));

  protected month(isoDate: string): string {
    return monthYear(isoDate);
  }

  protected count(n: number): string {
    return count(n, 'viaje más', 'viajes más');
  }
}
