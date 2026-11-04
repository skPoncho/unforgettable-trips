import { httpResource } from '@angular/common/http';
import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { Topology } from 'topojson-specification';

import { count } from '../../core/format';
import { drawMexico } from '../../core/map/geo-shapes';
import type {
  CityOverview,
  Passport as PassportData,
  SubdivisionOverview,
} from '../../core/me-api';
import { HomeEvents } from '../../core/home-events';
import { COUNTRY_TABS, type CountryTab, countryTab } from '../../views';
import { MexicoMap } from './mexico-map';
import { Passport } from './passport';

/** Por ahora solo México tiene estados en el catálogo (docs/PLAN.md, fase 6). */
const COUNTRY = { iso3: 'MEX', name: 'México' } as const;

const TAB_LABELS: Record<CountryTab, string> = {
  estados: 'Estados',
  ciudades: 'Ciudades',
  monumentos: 'Monumentos',
};

type Segment = 'visited' | 'stopover' | 'off';

/** Pantalla 3 · Mi país (design/pantallas/Mexico.dc.html). Todos los números vienen de la API. */
@Component({
  selector: 'app-my-country-page',
  imports: [MexicoMap, Passport],
  templateUrl: './my-country-page.html',
  styleUrl: './my-country-page.scss',
})
export class MyCountryPage {
  /** Query params (?pestana=ciudades&monumento=monte-alban&estado=MX-OAX). */
  readonly pestana = input<string>();
  readonly monumento = input<string>();
  /** Estado resaltado (?estado=MX-OAX), p. ej. al elegirlo en la búsqueda. */
  readonly estado = input<string>();

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly homeEvents = inject(HomeEvents);
  private readonly mapSection = viewChild<ElementRef<HTMLElement>>('mapSection');

  protected readonly country = COUNTRY;
  protected readonly tabs = COUNTRY_TABS.map((id) => ({ id, label: TAB_LABELS[id] }));

  private readonly params = { country: COUNTRY.iso3 };
  private readonly topology = httpResource<Topology>(() => '/geo/mexico.topo.json');
  private readonly states = httpResource<SubdivisionOverview[]>(() => ({
    url: '/api/me/subdivisions',
    params: this.params,
  }));
  private readonly cities = httpResource<CityOverview[]>(() => ({
    url: '/api/me/cities',
    params: this.params,
  }));
  private readonly passport = httpResource<PassportData>(() => ({
    url: '/api/me/passport',
    params: this.params,
  }));
  private readonly resources = [this.topology, this.states, this.cities, this.passport];

  protected readonly failed = computed(() => this.resources.some((r) => r.error()));

  protected readonly ready = computed(() => {
    if (this.failed()) return null;
    const topology = this.topology.value();
    const states = this.states.value();
    const cities = this.cities.value();
    const passport = this.passport.value();
    if (!topology || !states || !cities || !passport) return null;
    return { drawing: drawMexico(topology, states, 793, 498), states, cities, passport };
  });

  constructor() {
    // La ciudad de casa cuenta como visitada: al cambiarla cambian estados y ciudades.
    effect(() => {
      if (!this.homeEvents.changes()) return;
      untracked(() => {
        this.states.reload();
        this.cities.reload();
        this.passport.reload();
      });
    });
  }

  protected readonly tab = computed(() => countryTab(this.pestana()));

  protected readonly visited = computed(() =>
    (this.ready()?.states ?? []).filter((s) => s.status !== null),
  );
  protected readonly pending = computed(() =>
    (this.ready()?.states ?? []).filter((s) => s.status === null),
  );

  protected readonly total = computed(() => this.ready()?.states.length ?? 0);

  /** Sin redondear hacia arriba: 12 de 32 es 37 %, como en la maqueta. */
  protected readonly percent = computed(() =>
    this.total() ? Math.floor((this.visited().length / this.total()) * 100) : 0,
  );

  /** Barra de 32 segmentos: primero las estancias, luego las escalas. */
  protected readonly segments = computed<Segment[]>(() => {
    const visited = this.visited();
    const stays = visited.filter((s) => s.status === 'visited').length;
    return Array.from({ length: this.total() }, (_, i) =>
      i < stays ? 'visited' : i < visited.length ? 'stopover' : 'off',
    );
  });

  protected readonly progressLabel = computed(
    () =>
      `${this.visited().length} de ${count(this.total(), 'estado visitado', 'estados visitados')}`,
  );

  protected readonly stamps = computed(() => this.ready()?.passport.stamps ?? []);

  /** El monumento de la URL o, si no hay, el sello más reciente. */
  protected readonly selected = computed(() => {
    const stamps = this.stamps();
    return stamps.find((s) => s.slug === this.monumento()) ?? stamps.at(-1) ?? null;
  });

  protected cityVisits(city: CityOverview): string {
    if (city.is_home) return 'CASA';
    if (city.status === 'stopover') return 'ESCALA';
    return city.trips === 1 ? '1 VIAJE' : `${city.trips} VIAJES`;
  }

  protected chooseTab(tab: CountryTab): void {
    this.navigate({ pestana: tab === 'estados' ? null : tab });
  }

  /** Flechas izquierda y derecha entre pestañas (patrón tabs de WAI-ARIA). */
  protected onTabKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = COUNTRY_TABS.indexOf(this.tab());
    const next = COUNTRY_TABS[(index + step + COUNTRY_TABS.length) % COUNTRY_TABS.length];
    this.chooseTab(next);
    const list = (event.currentTarget as HTMLElement).closest('[role="tablist"]');
    list?.querySelector<HTMLElement>(`#tab-${next}`)?.focus();
  }

  protected chooseMonument(slug: string, options: { scroll?: boolean } = {}): void {
    this.navigate({ monumento: slug });
    if (options.scroll) {
      this.mapSection()?.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
