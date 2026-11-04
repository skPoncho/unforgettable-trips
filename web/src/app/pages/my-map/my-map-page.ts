import { httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, input, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink, RouterOutlet } from '@angular/router';
import type { Topology } from 'topojson-specification';

import type { Country, Progress, Timeline, Trip, UserMap } from '../../core/api/types';
import { HistoryPlayer, mapAtYear } from '../../core/history';
import { drawWorld } from '../../core/map/geo-shapes';
import { MemoryEvents } from '../../core/memory-events';
import { HomeEvents } from '../../core/home-events';
import { TripCard } from '../../shared/trip-card';
import { CountrySummaries } from './country-summaries';
import { HistoryBar } from './history-bar';
import { ProgressPanel } from './progress-panel';
import { WorldMap } from './world-map';

/** Cuántos viajes caben en la tira antes de "Ver los N viajes". */
const STRIP_TRIPS = 8;

/** Pantalla 1 · Mi mapa (design/pantallas/Main.dc.html). Todos los números vienen de la API. */
@Component({
  selector: 'app-my-map-page',
  imports: [ProgressPanel, WorldMap, HistoryBar, TripCard, RouterLink, RouterOutlet],
  providers: [CountrySummaries, HistoryPlayer],
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
          [frame]="frame()"
        />
        <app-world-map
          class="world"
          [drawing]="r.drawing"
          [userMap]="frame()?.map ?? r.userMap"
          [history]="frame()"
          [saved]="saved()"
          [focus]="pais() ?? null"
          (savedShown)="events.clear()"
          (focusCleared)="clearFocus()"
        >
          <app-history-bar
            [years]="player.years()"
            [shown]="player.shown()"
            [playing]="player.playing()"
            [announcement]="announcement()"
            (playToggle)="player.toggle()"
            (pick)="player.pick($event)"
          />
        </app-world-map>
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
  /** `?pais=JPN`: abre la tarjeta de ese país (lo usa la búsqueda). */
  readonly pais = input<string>();

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly events = inject(MemoryEvents);
  private readonly summaries = inject(CountrySummaries);
  private readonly homeEvents = inject(HomeEvents);

  private readonly countries = httpResource<Country[]>(() => ({
    url: '/api/geo/countries',
    params: { all: 'true' },
  }));
  private readonly topology = httpResource<Topology>(() => '/geo/world.topo.json');
  private readonly progress = httpResource<Progress>(() => '/api/me/progress');
  private readonly userMap = httpResource<UserMap>(() => '/api/me/map');
  private readonly trips = httpResource<Trip[]>(() => '/api/trips');
  private readonly timeline = httpResource<Timeline>(() => '/api/me/timeline');
  protected readonly player = inject(HistoryPlayer);

  private readonly resources = [
    this.countries,
    this.topology,
    this.progress,
    this.userMap,
    this.trips,
    this.timeline,
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

  /** Reproduce tu historia: el mapa y el progreso al cierre del año elegido (null = hoy). */
  protected readonly frame = computed(() => {
    const year = this.player.year();
    const userMap = this.userMap.value();
    const timeline = this.timeline.value();
    if (year === null || !userMap || !timeline) return null;
    return mapAtYear(userMap, timeline, year);
  });

  /** Para el lector de pantalla: "2022: 5 de 195 países". */
  protected readonly announcement = computed(() => {
    const frame = this.frame();
    if (!frame) return '';
    const { visited, total } = frame.progress.countries;
    return `${frame.year}: ${visited} de ${total} países`;
  });

  /** El recuerdo recién guardado: se anima en cuanto el mapa tiene los datos nuevos. */
  protected readonly saved = computed(() => {
    const saved = this.events.lastSaved();
    return saved && !this.userMap.isLoading() ? saved : null;
  });

  constructor() {
    // Para abrir la tarjeta de un país, el mapa vuelve a hoy (en otro año podría no estar).
    effect(() => {
      if (this.pais()) untracked(() => this.player.present());
    });
    // Años de la historia; al recargar los datos se vuelve a hoy.
    effect(() => {
      const timeline = this.timeline.value();
      untracked(() => this.player.setYears(timeline?.years.map((y) => y.year) ?? []));
    });
    // Al guardar un recuerdo cambian el mapa, el progreso y los viajes.
    effect(() => {
      if (!this.events.lastSaved()) return;
      untracked(() => this.reload());
    });
    // La ciudad de casa cuenta como visitada: al cambiarla cambian el mapa y el progreso.
    effect(() => {
      if (!this.homeEvents.changes()) return;
      untracked(() => this.reload());
    });
  }

  protected clearFocus(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { pais: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private reload(): void {
    this.summaries.invalidate();
    this.progress.reload();
    this.userMap.reload();
    this.trips.reload();
    this.timeline.reload();
  }

  protected readonly stripTrips = computed(() => (this.trips.value() ?? []).slice(0, STRIP_TRIPS));

  protected readonly allTripsLabel = computed(() => {
    const n = this.trips.value()?.length ?? 0;
    return n === 1 ? 'Ver el viaje' : `Ver los ${n} viajes`;
  });
}
