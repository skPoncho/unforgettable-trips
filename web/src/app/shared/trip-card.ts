import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideGlobe, LucideLink, LucideLock } from '@lucide/angular';

import { VISIBILITY_LABELS, count, monthYear } from '../core/format';
import { type Trip, photoUrl } from '../core/trips-api';

/** Tarjeta de viaje: portada, código de país, visibilidad, nombre, fecha y estadísticas. */
@Component({
  selector: 'app-trip-card',
  imports: [RouterLink, LucideGlobe, LucideLink, LucideLock],
  template: `
    @let t = trip();
    <a class="trip" [routerLink]="['/viajes', t.id]">
      <span class="cover" [class.cover--empty]="!cover()">
        @if (cover(); as src) {
          <img class="cover__img" [src]="src" alt="" loading="lazy" />
        }
        <span class="code">{{ code() }}</span>
        <span class="visibility">
          @switch (t.visibility) {
            @case ('public') {
              <svg lucideGlobe [size]="12" aria-hidden="true"></svg>
            }
            @case ('link') {
              <svg lucideLink [size]="12" aria-hidden="true"></svg>
            }
            @default {
              <svg lucideLock [size]="12" aria-hidden="true"></svg>
            }
          }
          {{ visibility() }}
        </span>
      </span>
      <span class="body">
        <span class="title">{{ t.title }}</span>
        <span class="meta">{{ meta() }}</span>
      </span>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }

    .trip {
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100%;
      padding: 10px 10px 14px;
      border-radius: 20px;
      background: var(--panel);
      border: 1px solid var(--line);
      color: var(--text);
      text-decoration: none;
      transition: border-color 0.15s ease;

      &:hover {
        border-color: var(--overlay-line);
      }
    }

    .cover {
      position: relative;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      height: 130px;
      padding: 10px;
      border-radius: 14px;
      overflow: hidden;
      background-color: var(--placeholder);
    }

    .cover--empty {
      background-image: repeating-linear-gradient(
        135deg,
        var(--stripe) 0 10px,
        transparent 10px 20px
      );
    }

    .cover__img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .code,
    .visibility {
      position: relative;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 6px;
    }

    .code {
      font-family: var(--font-mono);
      background: var(--inverse);
      color: var(--on-inverse);
    }

    .visibility {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--panel);
      color: var(--text-sub);
    }

    .body {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 0 4px;
    }

    .title {
      font-family: var(--font-display);
      font-weight: 700;
      font-size: 17px;
    }

    .meta {
      font-size: 13px;
      color: var(--text-muted);
    }
  `,
})
export class TripCard {
  readonly trip = input.required<Trip>();

  protected readonly cover = computed(() => {
    const id = this.trip().cover_photo_id;
    return id ? photoUrl(id) : null;
  });

  /** País principal del viaje (el primero con estancia); "+2" si recorrió más. */
  protected readonly code = computed(() => {
    const t = this.trip();
    const all = t.countries.length ? t.countries : t.stopover_countries;
    if (!all.length) return '—';
    return all.length > 1 ? `${all[0]} +${all.length - 1}` : all[0];
  });

  protected readonly visibility = computed(() => VISIBILITY_LABELS[this.trip().visibility]);

  protected readonly meta = computed(() => {
    const t = this.trip();
    const parts = [
      t.starts_on ? monthYear(t.starts_on) : 'Sin fechas',
      count(t.days, 'día', 'días'),
      count(t.photo_count, 'foto', 'fotos'),
    ];
    return parts.join(' · ');
  });
}
