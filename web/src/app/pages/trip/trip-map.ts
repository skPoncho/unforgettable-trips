import { Component, computed, input, output } from '@angular/core';

import type { RouteDrawing } from '../../core/map/trip-route';

/**
 * Mapa regional del viaje (Viaje.dc.html): ruta punteada en ámbar y pines numerados.
 * D3 calcula los trazos (core/map/trip-route); Angular dibuja el SVG y los pines son botones.
 */
@Component({
  selector: 'app-trip-map',
  template: `
    @let d = drawing();
    <div class="frame" [style.aspect-ratio]="d.width + ' / ' + d.height">
      <svg
        class="map"
        [attr.viewBox]="'0 0 ' + d.width + ' ' + d.height"
        role="img"
        [attr.aria-label]="description()"
      >
        <defs>
          <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect class="sea" [attr.width]="d.width" [attr.height]="d.height" />
        <path class="graticule" [attr.d]="d.graticule" />
        @for (land of d.land; track land.id) {
          <path class="land" [class.land--trip]="land.inTrip" [attr.d]="land.d" />
        }
        @if (d.route) {
          <path class="route route--under" [attr.d]="d.route" />
          <path class="route" [attr.d]="d.route" />
        }
        @for (s of d.stopovers; track s.stopId) {
          <circle class="stopover" [attr.cx]="s.x" [attr.cy]="s.y" r="6">
            <title>Escala: {{ s.name }}</title>
          </circle>
        }
      </svg>

      <div class="chips">
        @if (routeKm() > 0) {
          <span class="chip chip--accent">RUTA · ≈ {{ km() }} KM</span>
        }
        <span class="chip"
          >{{ d.pins.length }} {{ d.pins.length === 1 ? 'PARADA' : 'PARADAS' }}</span
        >
      </div>

      @for (pin of d.pins; track pin.stopId) {
        @let on = pin.n === selected();
        <div
          class="anchor"
          [class.anchor--on]="on"
          [style.left.%]="(pin.x / d.width) * 100"
          [style.top.%]="(pin.y / d.height) * 100"
        >
          <button
            type="button"
            class="pin"
            [class.pin--on]="on"
            [attr.aria-label]="'Parada ' + pin.n + ': ' + pin.name"
            [attr.aria-pressed]="on"
            (click)="pick.emit(pin.n)"
          >
            {{ pin.n }}
          </button>
          <span class="label" [class]="'label--' + pin.side" [class.label--on]="on">{{
            pin.name
          }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    // Medidas en sincronía con core/map/trip-route.ts (PIN_RADIUS 15, etiqueta de 26 px).
    :host {
      display: block;
    }

    .frame {
      position: relative;
      container-type: inline-size;
      border-radius: var(--radius-map);
      border: 1px solid var(--map-frame);
      overflow: hidden;
      background: var(--route-bg);
    }

    .map {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }

    .sea {
      fill: var(--route-bg);
    }

    .graticule {
      fill: none;
      stroke: var(--route-graticule);
      stroke-width: 1;
    }

    .land {
      fill: var(--route-land);
      stroke: var(--route-land-line);
      stroke-width: 0.8;
    }

    .land--trip {
      fill: var(--route-trip-land);
      stroke: var(--route-trip-line);
      stroke-width: 0.9;
      stroke-linejoin: round;
    }

    .route {
      fill: none;
      stroke: var(--route-line);
      stroke-width: 2.6;
      stroke-dasharray: 1 7;
      stroke-linecap: round;
      filter: var(--route-glow);
    }

    .route--under {
      stroke: var(--route-under);
      stroke-width: 7;
      stroke-opacity: var(--route-under-opacity);
      stroke-dasharray: none;
      filter: none;
    }

    .stopover {
      fill: var(--accent-stopover);
      stroke: var(--accent);
      stroke-width: 2;
    }

    .chips {
      position: absolute;
      top: 16px;
      left: 16px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .chip {
      padding: 8px 12px;
      border-radius: var(--radius-pill);
      background: var(--overlay);
      border: 1px solid var(--line);
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-sub);
    }

    .chip--accent {
      color: var(--accent-text);
    }

    .anchor {
      position: absolute;
      width: 0;
      height: 0;
      z-index: 1;
    }

    .anchor--on {
      z-index: 2;
    }

    .pin {
      position: absolute;
      left: -15px;
      top: -15px;
      width: 30px;
      height: 30px;
      padding: 0;
      border-radius: 50%;
      border: 2px solid var(--bg);
      background: var(--inverse);
      color: var(--on-inverse);
      font-family: var(--font-mono);
      font-weight: 500;
      font-size: 13px;
      cursor: pointer;
      box-shadow: var(--pin-shadow);
      transition:
        background 0.15s,
        box-shadow 0.15s;

      // Objetivo táctil de 44 px sin agrandar el círculo.
      &::before {
        content: '';
        position: absolute;
        inset: -7px;
        border-radius: 50%;
      }
    }

    .pin--on {
      background: var(--accent);
      color: var(--on-accent);
      box-shadow: var(--pin-glow);
    }

    .label {
      position: absolute;
      white-space: nowrap;
      padding: 4px 9px;
      border-radius: 8px;
      background: var(--overlay);
      font-size: 13px;
      font-weight: 600;
      line-height: 18px;
      color: var(--text);
      pointer-events: none;
    }

    .label--on {
      color: var(--accent-text);
    }

    .label--right {
      left: 20px;
      top: -13px;
    }

    .label--left {
      right: 20px;
      top: -13px;
    }

    .label--below {
      top: 20px;
      transform: translateX(-50%);
    }

    .label--above {
      bottom: 20px;
      transform: translateX(-50%);
    }

    .label--upper-right {
      left: 13px;
      bottom: 13px;
    }

    .label--lower-right {
      left: 13px;
      top: 13px;
    }

    .label--upper-left {
      right: 13px;
      bottom: 13px;
    }

    .label--lower-left {
      right: 13px;
      top: 13px;
    }

    // Mapa angosto (teléfono): las etiquetas chocarían; solo queda la de la parada elegida.
    @container (max-width: 460px) {
      .label {
        display: none;
      }

      .label--on {
        display: block;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .pin {
        transition: none;
      }
    }
  `,
})
export class TripMap {
  readonly drawing = input.required<RouteDrawing>();
  /** Número de la estancia elegida. */
  readonly selected = input<number | null>(null);
  readonly routeKm = input(0);
  readonly pick = output<number>();

  protected readonly km = computed(() => Math.round(this.routeKm()).toLocaleString('es-MX'));

  protected readonly description = computed(() => {
    const names = this.drawing().pins.map((p) => p.name);
    return names.length ? `Mapa con la ruta del viaje: ${names.join(', ')}` : 'Mapa del viaje';
  });
}
