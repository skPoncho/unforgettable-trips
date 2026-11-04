import { httpResource } from '@angular/common/http';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import type { Stop, TripDetail } from '../../core/api/types';
import { VISIBILITY_LABELS, count, monthYear } from '../../core/format';

/**
 * Detalle de viaje (/viajes/:id), versión mínima: título, fechas y paradas.
 * La pantalla completa (mapa regional y bitácora, Viaje.dc.html) llega en la fase 5.
 */
@Component({
  selector: 'app-trip-page',
  imports: [RouterLink],
  template: `
    <nav class="crumbs" aria-label="Migas de pan">
      <a routerLink="/">Mi mapa</a> / <a routerLink="/viajes">Viajes</a>
    </nav>
    @if (trip.error()) {
      <h1 class="title">Viaje no encontrado</h1>
      <p class="note">No existe o no es tuyo.</p>
    } @else if (trip.value(); as t) {
      <span class="eyebrow">{{ meta() }}</span>
      <h1 class="title">{{ t.title }}</h1>
      @if (t.summary) {
        <p class="summary">{{ t.summary }}</p>
      }
      <ol class="stops" aria-label="Paradas">
        @for (stop of t.stops; track stop.id) {
          <li class="stop">
            <span class="stop__n">{{ stop.position + 1 }}</span>
            <span class="stop__name">{{ stop.place_name }}</span>
            <span class="stop__where">
              {{ where(stop) }}
              @if (stop.visit_type === 'stopover') {
                · <span class="stop__tag">Escala</span>
              }
            </span>
          </li>
        }
      </ol>
      <p class="note">El detalle completo del viaje, con mapa y bitácora, llega en la fase 5.</p>
    } @else {
      <p class="note" role="status">Cargando…</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 760px;
    }

    .crumbs {
      font-size: 14px;
      color: var(--text-muted);

      a {
        color: var(--text-sub);
      }
    }

    .eyebrow {
      font-family: var(--font-mono);
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent-text);
    }

    .title {
      margin: 0;
      font-family: var(--font-display);
      font-size: 40px;
      letter-spacing: -0.02em;
    }

    .summary {
      margin: 0;
      font-size: 17px;
      line-height: 1.5;
      color: var(--text-sub);
    }

    .stops {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 8px 0;
      padding: 0;
      list-style: none;
    }

    .stop {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
    }

    .stop__n {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--on-accent);
      font-family: var(--font-mono);
      font-size: 13px;
    }

    .stop__name {
      flex: 1;
      font-weight: 600;
    }

    .stop__where,
    .note {
      color: var(--text-muted);
      font-size: 14px;
    }

    .stop__tag {
      color: var(--accent-text);
    }

    .note {
      margin: 0;
    }
  `,
})
export class TripPage {
  /** De la ruta (withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly trip = httpResource<TripDetail>(() => `/api/trips/${this.id()}`);

  /** Estado (solo México) y país de la parada. */
  protected where(stop: Stop): string {
    return [stop.subdivision?.name_es, stop.country.name_es].filter(Boolean).join(', ');
  }

  protected readonly meta = computed(() => {
    const t = this.trip.value();
    if (!t) return '';
    return [
      t.starts_on ? monthYear(t.starts_on) : null,
      count(t.days, 'día', 'días'),
      count(t.city_count, 'ciudad', 'ciudades'),
      count(t.photo_count, 'foto', 'fotos'),
      VISIBILITY_LABELS[t.visibility],
    ]
      .filter(Boolean)
      .join(' · ');
  });
}
