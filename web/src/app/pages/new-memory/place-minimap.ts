import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { geoCircle, geoMercator, geoPath } from 'd3-geo';
import type { Topology } from 'topojson-specification';

import type { LonLat } from '../../core/api/types';
import { features } from '../../core/map/geo-shapes';

const WIDTH = 520;
const HEIGHT = 120;
/** Radio en grados de la región que se ve alrededor del punto. */
const REGION_DEGREES = 2.5;

/** Convertir el TopoJSON del mundo cuesta; se hace una vez por topología. */
const featuresCache = new WeakMap<Topology, ReturnType<typeof features>>();

function countriesOf(topology: Topology) {
  let found = featuresCache.get(topology);
  if (!found) {
    found = features(topology, 'countries');
    featuresCache.set(topology, found);
  }
  return found;
}

/** Minimapa del lugar detectado: la región alrededor del punto, con su país resaltado. */
@Component({
  selector: 'app-place-minimap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (paths(); as p) {
      <svg
        class="minimap"
        [attr.viewBox]="'0 0 ' + width + ' ' + height"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        @for (shape of p; track shape.id) {
          <path class="land" [class.land--here]="shape.id === countryIso3()" [attr.d]="shape.d" />
        }
      </svg>
    }
    <span class="pin" aria-hidden="true"></span>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      height: 120px;
      overflow: hidden;
      background: var(--map-ocean);
    }

    .minimap {
      width: 100%;
      height: 100%;
      display: block;
    }

    .land {
      fill: var(--map-land);
      stroke: var(--map-land-line);
      stroke-width: 0.8;
    }

    .land--here {
      fill: var(--accent-stopover);
      stroke: var(--visited-line);
    }

    .pin {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 22px;
      height: 22px;
      margin: -11px 0 0 -11px;
      border-radius: 50%;
      background: var(--accent);
      border: 3px solid var(--panel);
      box-shadow: 0 0 0 6px var(--accent-ring);
    }
  `,
})
export class PlaceMinimap {
  readonly location = input.required<LonLat>();
  readonly countryIso3 = input<string | null>(null);

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;

  private readonly topology = httpResource<Topology>(() => '/geo/world.topo.json');

  protected readonly paths = computed(() => {
    const topology = this.topology.value();
    if (!topology) return null;
    const { lon, lat } = this.location();
    const region = geoCircle().center([lon, lat]).radius(REGION_DEGREES)();
    const projection = geoMercator()
      .fitExtent(
        [
          [0, -HEIGHT],
          [WIDTH, HEIGHT * 2],
        ],
        region,
      )
      // El punto queda en el centro y se recorta lo que no se ve.
      .clipExtent([
        [-10, -10],
        [WIDTH + 10, HEIGHT + 10],
      ]);
    const [x, y] = projection([lon, lat]) ?? [WIDTH / 2, HEIGHT / 2];
    const [tx, ty] = projection.translate();
    projection.translate([tx + WIDTH / 2 - x, ty + HEIGHT / 2 - y]);
    const path = geoPath(projection).digits(1);
    return countriesOf(topology).flatMap((f) => {
      const d = path(f);
      return d ? [{ id: String(f.id), d }] : [];
    });
  });
}
