import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of } from 'rxjs';

import { type Continent, GeoApi } from '../../core/geo-api';
import { MeApi, type PlaceStatus } from '../../core/me-api';
import { drawMexico, drawWorld, type Shape } from './geo-shapes';

/** Cómo se pinta un lugar: lo que diga la API para el usuario actual. */
type Paint = PlaceStatus | 'wish' | null;

interface PlaceInfo {
  paint: Paint;
  detail: string | null;
}

interface Hovered {
  map: 'world' | 'mexico';
  name: string;
  detail: string | null;
  x: number;
  y: number;
}

const CONTINENT_NAMES: Record<Continent, string> = {
  america: 'América',
  europe: 'Europa',
  asia: 'Asia',
  africa: 'África',
  oceania: 'Oceanía',
};

const NO_INFO: PlaceInfo = { paint: null, detail: null };

function describe(status: PlaceStatus, firstVisitedOn: string | null, isHome: boolean): string {
  const label = status === 'visited' ? 'Visitado' : 'Escala';
  if (isHome) return `${label} · Casa`;
  return firstVisitedOn ? `${label} · ${firstVisitedOn.slice(0, 4)}` : label;
}

/**
 * Página de verificación (/dev/geo), no es una pantalla de la app.
 * Fase 1: mundo en Equal Earth y México por estados con los nombres de la API.
 * Fase 2: los pinta con el progreso del usuario semilla (/api/me/map y /api/me/progress).
 */
@Component({
  selector: 'app-dev-geo-page',
  template: `
    <section class="dev-geo">
      <header class="dev-geo__header">
        <span class="dev-geo__eyebrow">Fases 1 y 2 · verificación</span>
        <h1 class="dev-geo__title">Datos geográficos</h1>
        @if (data(); as d) {
          @if (d.ok) {
            <p class="dev-geo__summary">
              {{ counted() }} países que suman · {{ territories() }} territorios que no suman ·
              {{ d.states.length }} estados de México
            </p>
          } @else {
            <p class="dev-geo__error" role="alert">
              No se pudieron cargar los datos. ¿Corriste <code>make load-geo</code>?
            </p>
          }
        } @else {
          <p class="dev-geo__summary">Cargando…</p>
        }
      </header>

      @if (user(); as u) {
        @if (u.ok) {
          <section class="progress" aria-label="Progreso del usuario">
            <p class="progress__headline">
              <strong class="progress__figure">{{ u.progress.countries.visited }}</strong>
              de {{ u.progress.countries.total }} países
              @if (u.progress.countries.stopover_only) {
                <span class="progress__note">
                  ({{ u.progress.countries.stopover_only }} solo escala)
                </span>
              }
            </p>
            <ul class="progress__list">
              @for (c of u.progress.continents; track c.continent) {
                <li>{{ continentName(c.continent) }} {{ c.visited }}/{{ c.total }}</li>
              }
              <li>
                Estados {{ u.progress.subdivisions.visited }}/{{ u.progress.subdivisions.total }}
              </li>
            </ul>
            <ul class="progress__list progress__list--muted">
              <li>{{ u.progress.trips }} viajes</li>
              <li>{{ u.progress.cities }} ciudades</li>
              <li>{{ u.progress.monuments }} monumentos</li>
              <li>{{ u.progress.photos }} fotos</li>
              <li>{{ u.progress.wishlist }} deseos</li>
            </ul>
            <ul class="legend" aria-label="Leyenda">
              <li><span class="legend__swatch legend__swatch--visited"></span>Visitado</li>
              <li><span class="legend__swatch legend__swatch--stopover"></span>Escala</li>
              <li><span class="legend__swatch legend__swatch--wish"></span>Lista de deseos</li>
            </ul>
          </section>
        } @else {
          <p class="dev-geo__summary" role="status">
            Sin progreso del usuario. ¿Corriste <code>make seed</code>?
          </p>
        }
      }

      @if (world(); as w) {
        <figure class="map-card" (pointerleave)="hovered.set(null)">
          <figcaption class="map-card__caption">Mundo · Equal Earth</figcaption>
          <svg
            class="map"
            [attr.viewBox]="'0 0 ' + w.width + ' ' + w.height"
            role="img"
            aria-label="Mapa del mundo"
          >
            <path class="map__sphere" [attr.d]="w.sphere" />
            <path class="map__graticule" [attr.d]="w.graticule" />
            @for (shape of w.shapes; track shape.id) {
              @let paint = countryInfo(shape.id).paint;
              <path
                class="map__land"
                [class.map__land--territory]="shape.territory"
                [class.map__land--visited]="paint === 'visited'"
                [class.map__land--stopover]="paint === 'stopover'"
                [class.map__land--wish]="paint === 'wish'"
                [class.map__land--active]="hovered()?.name === shape.name"
                [attr.d]="shape.d"
                [attr.data-id]="shape.id"
                (pointerenter)="hover($event, 'world', shape)"
                (pointermove)="hover($event, 'world', shape)"
              />
            }
            @for (dot of w.dots; track dot.id) {
              @let paint = countryInfo(dot.id).paint;
              <circle
                class="map__dot"
                [class.map__dot--visited]="paint === 'visited'"
                [class.map__dot--stopover]="paint === 'stopover'"
                [class.map__dot--wish]="paint === 'wish'"
                [class.map__dot--active]="hovered()?.name === dot.name"
                [attr.cx]="dot.x"
                [attr.cy]="dot.y"
                r="3.5"
                [attr.data-id]="dot.id"
                (pointerenter)="hover($event, 'world', dot)"
                (pointermove)="hover($event, 'world', dot)"
              />
            }
          </svg>
          @if (hovered(); as h) {
            @if (h.map === 'world') {
              <div class="tooltip" [style.left.px]="h.x" [style.top.px]="h.y">
                <strong>{{ h.name }}</strong>
                @if (h.detail) {
                  <span class="tooltip__detail">{{ h.detail }}</span>
                }
              </div>
            }
          }
        </figure>
      }

      @if (mexico(); as m) {
        <figure class="map-card map-card--mexico" (pointerleave)="hovered.set(null)">
          <figcaption class="map-card__caption">México · {{ m.shapes.length }} estados</figcaption>
          <svg
            class="map"
            [attr.viewBox]="'0 0 ' + m.width + ' ' + m.height"
            role="img"
            aria-label="Mapa de México por estados"
          >
            @for (shape of m.shapes; track shape.id) {
              @let paint = stateInfo(shape.id).paint;
              <path
                class="map__land map__land--state"
                [class.map__land--visited]="paint === 'visited'"
                [class.map__land--stopover]="paint === 'stopover'"
                [class.map__land--active]="hovered()?.name === shape.name"
                [attr.d]="shape.d"
                [attr.data-id]="shape.id"
                (pointerenter)="hover($event, 'mexico', shape)"
                (pointermove)="hover($event, 'mexico', shape)"
              />
            }
          </svg>
          @if (hovered(); as h) {
            @if (h.map === 'mexico') {
              <div class="tooltip" [style.left.px]="h.x" [style.top.px]="h.y">
                <strong>{{ h.name }}</strong>
                @if (h.detail) {
                  <span class="tooltip__detail">{{ h.detail }}</span>
                }
              </div>
            }
          }
        </figure>
      }
    </section>
  `,
  styleUrl: './dev-geo-page.scss',
})
export class DevGeoPage {
  private readonly api = inject(GeoApi);
  private readonly meApi = inject(MeApi);

  protected readonly data = toSignal(
    forkJoin({
      countries: this.api.countries({ includeTerritories: true }),
      states: this.api.subdivisions('MEX'),
      world: this.api.topology('world'),
      mexico: this.api.topology('mexico'),
    }).pipe(
      map((d) => ({ ok: true as const, ...d })),
      catchError(() => of({ ok: false as const })),
    ),
  );

  /** Progreso del usuario: si falla (sin make seed), los mapas se ven igual, sin pintar. */
  protected readonly user = toSignal(
    forkJoin({ progress: this.meApi.progress(), map: this.meApi.map() }).pipe(
      map((d) => ({ ok: true as const, ...d })),
      catchError(() => of({ ok: false as const })),
    ),
  );

  protected readonly world = computed(() => {
    const d = this.data();
    return d?.ok ? drawWorld(d.world, d.countries) : null;
  });

  protected readonly mexico = computed(() => {
    const d = this.data();
    return d?.ok ? drawMexico(d.mexico, d.states) : null;
  });

  protected readonly counted = computed(() => {
    const d = this.data();
    return d?.ok ? d.countries.filter((c) => c.counts_in_progress).length : 0;
  });

  protected readonly territories = computed(() => {
    const d = this.data();
    return d?.ok ? d.countries.filter((c) => !c.counts_in_progress).length : 0;
  });

  private readonly countryInfos = computed(() => {
    const u = this.user();
    const infos = new Map<string, PlaceInfo>();
    if (!u?.ok) return infos;
    for (const iso3 of u.map.wishlist) {
      infos.set(iso3, { paint: 'wish', detail: 'Lista de deseos' });
    }
    // Visitado o escala gana sobre el deseo.
    for (const c of u.map.countries) {
      infos.set(c.iso3, {
        paint: c.status,
        detail: describe(c.status, c.first_visited_on, c.is_home),
      });
    }
    return infos;
  });

  private readonly stateInfos = computed(() => {
    const u = this.user();
    const infos = new Map<string, PlaceInfo>();
    if (!u?.ok) return infos;
    for (const s of u.map.subdivisions) {
      infos.set(s.code, {
        paint: s.status,
        detail: describe(s.status, s.first_visited_on, s.is_home),
      });
    }
    return infos;
  });

  protected countryInfo(iso3: string): PlaceInfo {
    return this.countryInfos().get(iso3) ?? NO_INFO;
  }

  protected stateInfo(code: string): PlaceInfo {
    return this.stateInfos().get(code) ?? NO_INFO;
  }

  protected continentName(continent: Continent): string {
    return CONTINENT_NAMES[continent];
  }

  protected readonly hovered = signal<Hovered | null>(null);

  protected hover(
    event: PointerEvent,
    mapName: Hovered['map'],
    place: Pick<Shape, 'id' | 'name' | 'territory'>,
  ) {
    const card = (event.target as Element).closest('.map-card');
    const box = card?.getBoundingClientRect();
    const info = mapName === 'world' ? this.countryInfo(place.id) : this.stateInfo(place.id);
    const details = [
      info.detail,
      place.territory ? 'Territorio · no suma al progreso' : null,
    ].filter((d): d is string => d !== null);
    this.hovered.set({
      map: mapName,
      name: place.name,
      detail: details.length ? details.join(' · ') : null,
      x: box ? event.clientX - box.left : 0,
      y: box ? event.clientY - box.top : 0,
    });
  }
}
