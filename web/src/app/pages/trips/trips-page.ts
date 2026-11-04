import { httpResource } from '@angular/common/http';
import { Component } from '@angular/core';

import type { Trip } from '../../core/api/types';
import { TripCard } from '../../shared/trip-card';

/** Todos los viajes (/viajes), del más reciente al más antiguo. */
@Component({
  selector: 'app-trips-page',
  imports: [TripCard],
  template: `
    <h1 class="title">Tus viajes</h1>
    @if (trips.error()) {
      <p class="note" role="alert">No se pudieron cargar tus viajes.</p>
    } @else if (trips.value(); as list) {
      <p class="note">{{ list.length }} {{ list.length === 1 ? 'viaje' : 'viajes' }}</p>
      <ul class="grid">
        @for (trip of list; track trip.id) {
          <li><app-trip-card [trip]="trip" /></li>
        }
      </ul>
    } @else {
      <p class="note" role="status">Cargando…</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .title {
      margin: 0;
      font-family: var(--font-display);
      font-size: 34px;
      letter-spacing: -0.01em;
    }

    .note {
      margin: 0;
      color: var(--text-muted);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(236px, 1fr));
      gap: 14px;
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }
  `,
})
export class TripsPage {
  protected readonly trips = httpResource<Trip[]>(() => '/api/trips');
}
