import { Component, computed, input } from '@angular/core';

import type { Country } from '../../core/geo-api';
import type { Progress, UserMap } from '../../core/me-api';
import { CONTINENT_NAMES, nextMilestone } from '../../core/format';
import { firstVisitYear } from '../../core/user-map';

type DotKind = 'visited' | 'stopover' | 'off';

/** Panel izquierdo de Mi mapa: cifra de países, 195 puntos, continentes, estadísticas y deseos. */
@Component({
  selector: 'app-progress-panel',
  template: `
    @let p = progress();
    <section class="card progress" aria-labelledby="progress-title">
      <h2 id="progress-title" class="eyebrow">{{ eyebrow() }}</h2>
      <p class="headline">
        <span class="headline__figure">{{ p.countries.visited }}</span>
        <span class="headline__total">de {{ p.countries.total }} países</span>
      </p>
      <div class="dots" role="img" [attr.aria-label]="dotsLabel()">
        @for (dot of dots(); track $index) {
          <span class="dot" [class]="'dot--' + dot"></span>
        }
      </div>
      <p class="note">
        Cada punto es un país: se enciende con tu primer recuerdo ahí. Las escalas también cuentan
        (punto hueco).
        @if (milestone(); as m) {
          <span class="note__strong">Próximo hito: {{ m }} países.</span>
        } @else {
          <span class="note__strong">¡Completaste los {{ p.countries.total }}!</span>
        }
      </p>
      <div class="divider"></div>
      <ul class="continents" aria-label="Progreso por continente">
        @for (c of continents(); track c.continent) {
          <li class="continent">
            <span class="continent__row">
              <span>{{ c.name }}</span>
              <span class="continent__count">{{ c.visited }}/{{ c.total }}</span>
            </span>
            <span class="bar" aria-hidden="true">
              <span class="bar__fill" [style.width.%]="c.percent"></span>
            </span>
          </li>
        }
      </ul>
    </section>

    <ul class="stats" aria-label="Estadísticas">
      @for (s of stats(); track s.label) {
        <li class="card stat">
          <span class="stat__value">{{ s.value }}</span>
          <span class="stat__label">{{ s.label }}</span>
        </li>
      }
    </ul>

    <section class="card wishlist" aria-labelledby="wishlist-title">
      <div class="wishlist__head">
        <h2 id="wishlist-title" class="wishlist__title">Lista de deseos</h2>
        <span class="wishlist__count">{{ wishlist().length }}</span>
      </div>
      @if (wishlist().length) {
        <ul class="chips">
          @for (name of wishlist(); track name) {
            <li class="chip">{{ name }}</li>
          }
        </ul>
      } @else {
        <p class="note">Todavía no hay países en tu lista de deseos.</p>
      }
    </section>
  `,
  styleUrl: './progress-panel.scss',
})
export class ProgressPanel {
  readonly progress = input.required<Progress>();
  readonly map = input.required<UserMap>();
  readonly countries = input.required<Country[]>();

  /** "TU MUNDO · 2019 — HOY": desde el año de la primera visita (la casa no tiene fecha). */
  protected readonly eyebrow = computed(() => {
    const first = firstVisitYear(this.map());
    return first === null ? 'Tu mundo' : `Tu mundo · ${first} — hoy`;
  });

  /** Un punto por país: primero los visitados, luego las escalas (hueco), luego el resto. */
  protected readonly dots = computed<DotKind[]>(() => {
    const { visited, total, stopover_only } = this.progress().countries;
    return Array.from({ length: total }, (_, i) =>
      i < visited - stopover_only ? 'visited' : i < visited ? 'stopover' : 'off',
    );
  });

  protected readonly dotsLabel = computed(() => {
    const { visited, total, stopover_only } = this.progress().countries;
    const base = `${visited} de ${total} países encendidos`;
    if (!stopover_only) return base;
    return stopover_only === 1
      ? `${base}, uno de ellos por escala`
      : `${base}, ${stopover_only} de ellos por escala`;
  });

  protected readonly milestone = computed(() => nextMilestone(this.progress().countries.visited));

  protected readonly continents = computed(() =>
    this.progress().continents.map((c) => ({
      ...c,
      name: CONTINENT_NAMES[c.continent],
      percent: c.total ? (c.visited / c.total) * 100 : 0,
    })),
  );

  protected readonly stats = computed(() => {
    const p = this.progress();
    return [
      { value: p.trips, label: p.trips === 1 ? 'viaje' : 'viajes' },
      { value: p.cities, label: p.cities === 1 ? 'ciudad' : 'ciudades' },
      { value: p.monuments, label: p.monuments === 1 ? 'monumento' : 'monumentos' },
      { value: p.photos, label: p.photos === 1 ? 'foto' : 'fotos' },
    ].map((s) => ({ ...s, value: s.value.toLocaleString('es-MX') }));
  });

  /** Nombres en español, en orden alfabético. */
  protected readonly wishlist = computed(() => {
    const names = new Map(this.countries().map((c) => [c.iso3, c.name_es]));
    return this.map()
      .wishlist.map((iso3) => names.get(iso3) ?? iso3)
      .sort((a, b) => a.localeCompare(b, 'es'));
  });
}
