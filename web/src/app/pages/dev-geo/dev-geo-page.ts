import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of } from 'rxjs';

import { GeoApi } from '../../core/geo-api';
import { drawMexico, drawWorld } from './geo-shapes';

interface Hovered {
  map: 'world' | 'mexico';
  name: string;
  detail: string | null;
  x: number;
  y: number;
}

/**
 * Página de verificación de la fase 1 (/dev/geo): mundo en Equal Earth y México por estados,
 * con los nombres en español que da la API. No es una pantalla de la app.
 */
@Component({
  selector: 'app-dev-geo-page',
  template: `
    <section class="dev-geo">
      <header class="dev-geo__header">
        <span class="dev-geo__eyebrow">Fase 1 · verificación</span>
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
              <path
                class="map__land"
                [class.map__land--territory]="shape.territory"
                [class.map__land--active]="hovered()?.name === shape.name"
                [attr.d]="shape.d"
                [attr.data-id]="shape.id"
                (pointerenter)="hover($event, 'world', shape.name, shape.territory)"
                (pointermove)="hover($event, 'world', shape.name, shape.territory)"
              />
            }
            @for (dot of w.dots; track dot.id) {
              <circle
                class="map__dot"
                [class.map__dot--active]="hovered()?.name === dot.name"
                [attr.cx]="dot.x"
                [attr.cy]="dot.y"
                r="3.5"
                [attr.data-id]="dot.id"
                (pointerenter)="hover($event, 'world', dot.name, dot.territory)"
                (pointermove)="hover($event, 'world', dot.name, dot.territory)"
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
              <path
                class="map__land map__land--state"
                [class.map__land--active]="hovered()?.name === shape.name"
                [attr.d]="shape.d"
                [attr.data-id]="shape.id"
                (pointerenter)="hover($event, 'mexico', shape.name, false)"
                (pointermove)="hover($event, 'mexico', shape.name, false)"
              />
            }
          </svg>
          @if (hovered(); as h) {
            @if (h.map === 'mexico') {
              <div class="tooltip" [style.left.px]="h.x" [style.top.px]="h.y">
                <strong>{{ h.name }}</strong>
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

  protected readonly hovered = signal<Hovered | null>(null);

  protected hover(event: PointerEvent, mapName: Hovered['map'], name: string, territory: boolean) {
    const card = (event.target as Element).closest('.map-card');
    const box = card?.getBoundingClientRect();
    this.hovered.set({
      map: mapName,
      name,
      detail: territory ? 'Territorio · no suma al progreso' : null,
      x: box ? event.clientX - box.left : 0,
      y: box ? event.clientY - box.top : 0,
    });
  }
}
