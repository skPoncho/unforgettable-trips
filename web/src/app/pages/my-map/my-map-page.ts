import { httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import type { Topology } from 'topojson-specification';

import type { Country, Progress, Trip, UserMap } from '../../core/api/types';
import { drawWorld } from '../../core/map/geo-shapes';
import { MemoryEvents } from '../../core/memory-events';
import { TripCard } from '../../shared/trip-card';
import { CountrySummaries } from './country-summaries';
import { ProgressPanel } from './progress-panel';
import { WorldMap } from './world-map';

/** Cuántos viajes caben en la tira antes de "Ver los N viajes". */
const STRIP_TRIPS = 8;

/** Pantalla 1 · Mi mapa (design/pantallas/Main.dc.html). Todos los números vienen de la API. */
@Component({
  selector: 'app-my-map-page',
  imports: [ProgressPanel, WorldMap, TripCard, RouterLink, RouterOutlet],
  providers: [CountrySummaries],
  template: `
    @if (failed()) {
      <section class="notice" role="alert">
        <h1 class="notice__title">No se pudo cargar tu mapa</h1>
        <p>
          ¿Corriste <code>make load-geo</code> y <code>make seed</code>? Sin el usuario semilla la
          API responde 503.
        </p>
      </section>
    } @else if (ready(); as r) {
      <h1 class="visually-hidden">Mi mapa</h1>
      <div class="main">
        <app-progress-panel
          class="panel"
          [progress]="r.progress"
          [map]="r.userMap"
          [countries]="r.countries"
        />
        <app-world-map
          class="world"
          [drawing]="r.drawing"
          [userMap]="r.userMap"
          [saved]="saved()"
          (savedShown)="events.clear()"
        />
      </div>

      <section class="trips" aria-labelledby="trips-title">
        <div class="trips__head">
          <h2 id="trips-title" class="trips__title">Tus viajes</h2>
          @if (r.trips.length) {
            <a class="trips__all" routerLink="/viajes">{{ allTripsLabel() }}</a>
          }
        </div>
        @if (r.trips.length) {
          <ul class="strip">
            @for (trip of stripTrips(); track trip.id) {
              <li><app-trip-card [trip]="trip" /></li>
            }
          </ul>
        } @else {
          <p class="trips__empty">Todavía no hay viajes. Tu primer recuerdo creará uno.</p>
        }
      </section>
    } @else {
      <p class="loading" role="status">Cargando tu mapa…</p>
    }

    <!-- Nuevo recuerdo (/nuevo-recuerdo) se abre encima del mapa. -->
    <router-outlet />
  `,
  styleUrl: './my-map-page.scss',
})
export class MyMapPage {
  protected readonly events = inject(MemoryEvents);
  private readonly summaries = inject(CountrySummaries);

  private readonly countries = httpResource<Country[]>(() => ({
    url: '/api/geo/countries',
    params: { all: 'true' },
  }));
  private readonly topology = httpResource<Topology>(() => '/geo/world.topo.json');
  private readonly progress = httpResource<Progress>(() => '/api/me/progress');
  private readonly userMap = httpResource<UserMap>(() => '/api/me/map');
  private readonly trips = httpResource<Trip[]>(() => '/api/trips');

  private readonly resources = [
    this.countries,
    this.topology,
    this.progress,
    this.userMap,
    this.trips,
  ];

  protected readonly failed = computed(() => this.resources.some((r) => r.error()));

  /** El dibujo del mundo solo depende del catálogo y del TopoJSON. */
  private readonly drawing = computed(() => {
    const topology = this.topology.value();
    const countries = this.countries.value();
    return topology && countries ? drawWorld(topology, countries) : null;
  });

  protected readonly ready = computed(() => {
    const drawing = this.drawing();
    const progress = this.progress.value();
    const userMap = this.userMap.value();
    const trips = this.trips.value();
    const countries = this.countries.value();
    if (!drawing || !progress || !userMap || !trips || !countries) return null;
    return { drawing, progress, userMap, trips, countries };
  });

  /** El recuerdo recién guardado: se anima en cuanto el mapa tiene los datos nuevos. */
  protected readonly saved = computed(() => {
    const saved = this.events.lastSaved();
    return saved && !this.userMap.isLoading() ? saved : null;
  });

  constructor() {
    // Al guardar un recuerdo cambian el mapa, el progreso y los viajes.
    effect(() => {
      if (!this.events.lastSaved()) return;
      untracked(() => {
        this.summaries.invalidate();
        this.progress.reload();
        this.userMap.reload();
        this.trips.reload();
      });
    });
  }

  protected readonly stripTrips = computed(() => (this.trips.value() ?? []).slice(0, STRIP_TRIPS));

  protected readonly allTripsLabel = computed(() => {
    const n = this.trips.value()?.length ?? 0;
    return n === 1 ? 'Ver el viaje' : `Ver los ${n} viajes`;
  });
}
