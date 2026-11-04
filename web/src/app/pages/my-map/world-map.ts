import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { LucideGlobe, LucideMinus, LucidePlay, LucidePlus } from '@lucide/angular';
import { select } from 'd3-selection';
import 'd3-transition';
import { type ZoomBehavior, zoom } from 'd3-zoom';

import type { MapDrawing, Point } from '../../core/map/geo-shapes';
import type { CountryStatus, UserMap } from '../../core/me-api';
import { firstVisitYear } from '../../core/user-map';
import { CountryCard } from './country-card';
import { CountrySummaries } from './country-summaries';

export type Layer = 'countries' | 'cities' | 'monuments' | 'wishes';

/** Cómo se pinta un país; null = por descubrir. */
type Paint = 'visited' | 'stopover' | 'wish' | null;

interface Transform {
  k: number;
  x: number;
  y: number;
}

interface Tooltip {
  name: string;
  detail: string;
  x: number;
  y: number;
}

const LAYERS: readonly { id: Layer; label: string }[] = [
  { id: 'countries', label: 'Países' },
  { id: 'cities', label: 'Ciudades' },
  { id: 'monuments', label: 'Monumentos' },
  { id: 'wishes', label: 'Lista de deseos' },
];

const MAX_ZOOM = 8;
const ZOOM_STEP = 1.6;
/** Medidas de la tarjeta para colocarla junto al país sin salirse del mapa. */
const CARD = { width: 290, height: 300, gap: 28 };
/** Tiempo antes de cerrar la tarjeta al salir del país (para poder llegar a ella). */
const HIDE_DELAY_MS = 150;

/**
 * Mapa mundial de Mi mapa (D3 + TopoJSON en SVG).
 * D3 calcula los trazos (geo-shapes) y el zoom; Angular dibuja el SVG.
 * Las reglas de "visitado" vienen ya resueltas de la API (/api/me/map).
 */
@Component({
  selector: 'app-world-map',
  imports: [CountryCard, LucidePlus, LucideMinus, LucideGlobe, LucidePlay],
  templateUrl: './world-map.html',
  styleUrl: './world-map.scss',
  host: {
    '(document:keydown.escape)': 'close()',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class WorldMap {
  readonly drawing = input.required<MapDrawing>();
  readonly userMap = input.required<UserMap>();

  protected readonly summaries = inject(CountrySummaries);
  private readonly destroyRef = inject(DestroyRef);

  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  private readonly card = viewChild('card', { read: ElementRef<HTMLElement> });

  protected readonly layerOptions = LAYERS;
  protected readonly layers = signal<ReadonlySet<Layer>>(
    new Set<Layer>(['countries', 'cities', 'wishes']),
  );

  protected readonly transform = signal<Transform>({ k: 1, x: 0, y: 0 });
  /** Pixeles de pantalla por unidad del dibujo (el SVG se escala al ancho disponible). */
  private readonly scale = signal(1);
  private zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;

  /** País bajo el mouse o con el foco, y país fijado con clic. */
  private readonly hovered = signal<string | null>(null);
  protected readonly pinned = signal<string | null>(null);
  protected readonly tooltip = signal<Tooltip | null>(null);
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Las etiquetas de escala necesitan su resumen (p. ej. "3 h en Tocumen").
    effect(() => {
      for (const c of this.userMap().countries) {
        if (c.status === 'stopover') this.summaries.load(c.iso3);
      }
    });

    afterNextRender(() => this.setUpZoom());
    this.destroyRef.onDestroy(() => this.cancelHide());
  }

  // --- Estado de los países ------------------------------------------------------------

  private readonly statuses = computed(
    () => new Map<string, CountryStatus>(this.userMap().countries.map((c) => [c.iso3, c])),
  );

  private readonly paints = computed(() => {
    const layers = this.layers();
    const paints = new Map<string, Paint>();
    if (layers.has('wishes')) {
      for (const iso3 of this.userMap().wishlist) paints.set(iso3, 'wish');
    }
    // Visitado o escala gana sobre el deseo.
    if (layers.has('countries')) {
      for (const c of this.userMap().countries) paints.set(c.iso3, c.status);
    }
    return paints;
  });

  protected paint(iso3: string): Paint {
    return this.paints().get(iso3) ?? null;
  }

  /** Grupos de trazos por estado: cada grupo lleva su estilo (y el halo en oscuro). */
  protected readonly groups = computed(() => {
    const groups = { land: [], wish: [], visited: [], stopover: [] } as Record<
      'land' | 'wish' | 'visited' | 'stopover',
      MapDrawing['shapes']
    >;
    for (const shape of this.drawing().shapes) {
      groups[this.paint(shape.id) ?? 'land'].push(shape);
    }
    return groups;
  });

  protected isOpenable(iso3: string): boolean {
    const p = this.paint(iso3);
    return p === 'visited' || p === 'stopover';
  }

  protected countryLabel(iso3: string, name: string): string {
    const status = this.statuses().get(iso3);
    if (!status) return name;
    const state = status.is_home ? 'casa' : status.status === 'stopover' ? 'escala' : 'visitado';
    return `${name}, ${state}. Ver tarjeta`;
  }

  // --- Puntos (no crecen con el zoom: se colocan ya transformados) ---------------------

  private toView([x, y]: Point): Point {
    const t = this.transform();
    return [x * t.k + t.x, y * t.k + t.y];
  }

  protected readonly smallCountries = computed(() =>
    this.drawing().dots.map((dot) => {
      const [x, y] = this.toView([dot.x, dot.y]);
      return { ...dot, x, y };
    }),
  );

  protected readonly cityLights = computed(() => {
    if (!this.layers().has('cities')) return [];
    const { project } = this.drawing();
    return this.userMap().cities.flatMap((city) => {
      const p = project(city.location);
      if (!p) return [];
      const [x, y] = this.toView(p);
      return [{ id: city.id, name: city.name_es, x, y }];
    });
  });

  protected readonly monumentPins = computed(() => {
    if (!this.layers().has('monuments')) return [];
    const { project } = this.drawing();
    return this.userMap().monuments.flatMap((m) => {
      const p = project(m.location);
      if (!p) return [];
      const [x, y] = this.toView(p);
      return [{ id: m.id, name: m.name_es, x, y }];
    });
  });

  // --- Etiquetas y tarjeta (HTML encima del SVG, en pixeles) ---------------------------

  private readonly anchors = computed(() => {
    const anchors = new Map<string, { name: string; point: Point }>();
    for (const s of this.drawing().shapes) anchors.set(s.id, { name: s.name, point: s.anchor });
    for (const d of this.drawing().dots) anchors.set(d.id, { name: d.name, point: [d.x, d.y] });
    return anchors;
  });

  private toScreen(point: Point): Point {
    const [x, y] = this.toView(point);
    const s = this.scale();
    return [x * s, y * s];
  }

  protected readonly stopoverLabels = computed(() => {
    if (!this.layers().has('countries')) return [];
    return this.userMap()
      .countries.filter((c) => c.status === 'stopover')
      .flatMap((c) => {
        const anchor = this.anchors().get(c.iso3);
        if (!anchor) return [];
        const stop = this.summaries.get(c.iso3)?.stopovers[0];
        const detail = stop ? (stop.note ?? stop.place_name) : null;
        const [x, y] = this.toScreen(anchor.point);
        return [{ iso3: c.iso3, text: [anchor.name, detail].filter(Boolean).join(' · '), x, y }];
      });
  });

  /** El país cuya tarjeta se ve: el fijado o, si no hay, el que está bajo el mouse. */
  protected readonly open = computed(() => {
    const iso3 = this.pinned() ?? this.hovered();
    if (!iso3 || !this.isOpenable(iso3)) return null;
    const anchor = this.anchors().get(iso3);
    if (!anchor) return null;
    const [x, y] = this.toScreen(anchor.point);
    const width = this.drawing().width * this.scale();
    const height = this.drawing().height * this.scale();
    // Como en la maqueta: abajo del país y a su izquierda si está en la mitad derecha (y al
    // revés). Si no cabe abajo, sube lo necesario.
    const left = x > width / 2 ? x - CARD.width - CARD.gap : x + CARD.gap;
    const top = Math.max(8, Math.min(y + 22, height - CARD.height));
    return { iso3, name: anchor.name, x, y, left, top };
  });

  protected readonly openSummary = computed(() => {
    const open = this.open();
    return open ? this.summaries.get(open.iso3) : undefined;
  });

  // --- Eventos ----------------------------------------------------------------------------

  protected enter(iso3: string): void {
    this.cancelHide();
    this.tooltip.set(null);
    this.summaries.load(iso3);
    this.hovered.set(iso3);
  }

  protected leave(): void {
    this.cancelHide();
    this.hideTimer = setTimeout(() => this.hovered.set(null), HIDE_DELAY_MS);
  }

  protected keepCard(): void {
    this.cancelHide();
  }

  protected pin(event: Event, iso3: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.summaries.load(iso3);
    this.pinned.set(this.pinned() === iso3 ? null : iso3);
  }

  /** Nombre y estado de un país sin tarjeta (por descubrir, deseo o territorio). */
  protected showTooltip(event: PointerEvent, name: string, territory: boolean): void {
    const stage = (event.currentTarget as Element).closest('.stage');
    const box = stage?.getBoundingClientRect();
    const paint = this.paint(this.idOf(event));
    const detail = [
      paint === 'wish' ? 'Lista de deseos' : 'Por descubrir',
      territory ? 'Territorio · no suma al progreso' : null,
    ]
      .filter(Boolean)
      .join(' · ');
    this.tooltip.set({
      name,
      detail,
      x: box ? event.clientX - box.left : 0,
      y: box ? event.clientY - box.top : 0,
    });
  }

  protected hideTooltip(): void {
    this.tooltip.set(null);
  }

  close(): void {
    this.pinned.set(null);
    this.hovered.set(null);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.pinned()) return;
    const card = this.card()?.nativeElement;
    if (card && event.target instanceof Node && card.contains(event.target)) return;
    this.pinned.set(null);
  }

  protected toggleLayer(layer: Layer): void {
    this.layers.update((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }

  protected zoomBy(factor: number): void {
    if (!this.zoomBehavior) return;
    select(this.svg().nativeElement)
      .transition()
      .duration(300)
      .call(this.zoomBehavior.scaleBy, factor);
  }

  /** Años de la historia (fase 7 la reproduce): desde la primera visita hasta hoy. */
  protected readonly years = computed(() => {
    const now = new Date().getFullYear();
    const start = firstVisitYear(this.userMap()) ?? now;
    return Array.from({ length: now - start + 1 }, (_, i) => start + i);
  });

  protected readonly zoomStep = ZOOM_STEP;
  protected readonly canZoomIn = computed(() => this.transform().k < MAX_ZOOM - 0.01);
  protected readonly canZoomOut = computed(() => this.transform().k > 1.01);

  // --- Zoom y tamaño ------------------------------------------------------------------

  private setUpZoom(): void {
    const element = this.svg().nativeElement;
    const { width, height } = this.drawing();
    const extent: [[number, number], [number, number]] = [
      [0, 0],
      [width, height],
    ];
    this.zoomBehavior = zoom<SVGSVGElement, unknown>()
      .extent(extent)
      .scaleExtent([1, MAX_ZOOM])
      .translateExtent(extent)
      // La rueda sola desplaza la página; con Ctrl/⌘ (o pellizco en el trackpad) hace zoom.
      .filter((event: MouseEvent | WheelEvent) =>
        event.type === 'wheel' ? event.ctrlKey || event.metaKey : !event.button,
      )
      .on('zoom', (event: { transform: Transform }) => {
        const { k, x, y } = event.transform;
        this.transform.set({ k, x, y });
      });
    select(element).call(this.zoomBehavior);

    const measure = () => {
      const w = element.getBoundingClientRect().width;
      if (w > 0) this.scale.set(w / width);
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
  }

  private cancelHide(): void {
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  private idOf(event: Event): string {
    return (event.currentTarget as Element).getAttribute('data-id') ?? '';
  }
}
