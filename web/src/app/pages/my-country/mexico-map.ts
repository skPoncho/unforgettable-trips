import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { count } from '../../core/format';
import type { MapDrawing } from '../../core/map/geo-shapes';
import type { PassportStamp, SubdivisionOverview } from '../../core/me-api';
import { photoUrl } from '../../core/trips-api';

interface Pin {
  stamp: PassportStamp;
  /** Posición en porcentaje del dibujo, para que los pines sigan al mapa al cambiar de tamaño. */
  left: number;
  top: number;
}

/** México por estados con los monumentos sellados y la tarjeta del elegido (Mexico.dc.html). */
@Component({
  selector: 'app-mexico-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="legend" aria-hidden="true">
      <span class="legend__item"><span class="legend__swatch"></span>Estado visitado</span>
      <span class="legend__item"><span class="legend__pin"></span>Monumento sellado</span>
    </div>

    <div class="canvas">
      <div class="stage" [style.aspect-ratio]="drawing().width + ' / ' + drawing().height">
        <svg
          class="svg"
          [attr.viewBox]="'0 0 ' + drawing().width + ' ' + drawing().height"
          role="img"
          [attr.aria-label]="mapLabel()"
        >
          <defs>
            <filter id="state-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g class="states">
            @for (shape of others(); track shape.id) {
              <path class="state" [attr.d]="shape.d">
                <title>{{ shape.name }}</title>
              </path>
            }
          </g>
          <g class="states states--lit">
            @for (shape of lit(); track shape.id) {
              <path
                class="state"
                [class.state--stopover]="statusOf(shape.id) === 'stopover'"
                [class.state--highlight]="shape.id === highlighted()"
                [attr.d]="shape.d"
              >
                <title>{{ shape.name }}</title>
              </path>
            }
          </g>
        </svg>

        @for (pin of pins(); track pin.stamp.id) {
          <button
            type="button"
            class="pin"
            [class.pin--active]="pin.stamp.slug === selected()?.slug"
            [style.left.%]="pin.left"
            [style.top.%]="pin.top"
            [attr.aria-label]="pin.stamp.name_es"
            [attr.aria-pressed]="pin.stamp.slug === selected()?.slug"
            (click)="picked.emit(pin.stamp.slug)"
          ></button>
        }
      </div>

      @if (selected(); as s) {
        <article class="card" aria-live="polite">
          <div class="card__head">
            <h3 class="card__name">{{ s.name_es }}</h3>
            <span class="card__year">{{ s.first_stamped_on.slice(0, 4) }}</span>
          </div>
          <p class="card__where">{{ where(s) }}</p>
          @if (photos().length) {
            <div class="card__photos">
              @for (src of photos(); track src; let i = $index) {
                <span class="photo">
                  <img [src]="src" alt="" />
                  @if (i === 2 && morePhotos()) {
                    <span class="photo__more">+{{ morePhotos() }}</span>
                  }
                </span>
              }
            </div>
          } @else {
            <p class="card__note">{{ memoriesLabel(s) }}</p>
          }
          <a
            class="card__link"
            [routerLink]="['/viajes', s.trip.id]"
            [queryParams]="s.trip.stop_number ? { parada: s.trip.stop_number } : null"
            >Ver recuerdos de este lugar</a
          >
        </article>
      }
    </div>
  `,
  styleUrl: './mexico-map.scss',
})
export class MexicoMap {
  readonly drawing = input.required<MapDrawing>();
  readonly states = input.required<SubdivisionOverview[]>();
  readonly stamps = input.required<PassportStamp[]>();
  readonly selected = input<PassportStamp | null>(null);
  /** Estado resaltado (?estado=MX-OAX, p. ej. desde la búsqueda). */
  readonly highlighted = input<string | null>(null);
  readonly picked = output<string>();

  private readonly statusByCode = computed(
    () => new Map(this.states().map((s) => [s.code, s.status])),
  );

  protected statusOf(code: string) {
    return this.statusByCode().get(code) ?? null;
  }

  /** Los visitados van en su propio grupo para el halo en oscuro (--state-glow). */
  protected readonly lit = computed(() =>
    this.drawing().shapes.filter((s) => this.statusOf(s.id) !== null),
  );
  protected readonly others = computed(() =>
    this.drawing().shapes.filter((s) => this.statusOf(s.id) === null),
  );

  protected readonly mapLabel = computed(() => {
    const visited = this.lit().length;
    return `Mapa de México con ${count(visited, 'estado visitado', 'estados visitados')} y ${count(
      this.stamps().length,
      'monumento sellado',
      'monumentos sellados',
    )}`;
  });

  protected readonly pins = computed<Pin[]>(() => {
    const { width, height, project } = this.drawing();
    return this.stamps().flatMap((stamp) => {
      const point = project(stamp.location);
      if (!point) return [];
      return [{ stamp, left: (point[0] / width) * 100, top: (point[1] / height) * 100 }];
    });
  });

  protected readonly photos = computed(() =>
    (this.selected()?.photo_ids ?? []).map((id) => photoUrl(id)),
  );

  protected readonly morePhotos = computed(() =>
    Math.max(0, (this.selected()?.photo_count ?? 0) - 3),
  );

  protected where(stamp: PassportStamp): string {
    return [stamp.subdivision_name, stamp.trip.title].filter(Boolean).join(' · ');
  }

  protected memoriesLabel(stamp: PassportStamp): string {
    return count(stamp.memories, 'recuerdo sin fotos', 'recuerdos sin fotos');
  }
}
