import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideGlobe, LucideMinus, LucidePlus, LucideX } from '@lucide/angular';
import { select } from 'd3-selection';
import 'd3-transition';
import { type ZoomBehavior, zoom, zoomIdentity } from 'd3-zoom';

import type { GlobeView, Point, WorldDrawing } from '../../core/map/geo-shapes';
import type { CountryStatus, UserMap } from '../../core/me-api';
import type { SavedMemory } from '../../core/memory-events';
import type { HistoryFrame } from '../../core/history';
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
/** Cuánto se queda el aviso de "se encendió" después de guardar un recuerdo. */
const LIT_NOTICE_MS = 7000;
/** Globo: duración de la transición, acercamiento máximo, giro con flechas y límite de latitud. */
const GLOBE_MS = 1000;
const GLOBE_MAX_ZOOM = 4;
const GLOBE_KEY_STEP = 10;
const GLOBE_MAX_LAT = 70;
/** Centro del globo si no hay casa. */
const GLOBE_DEFAULT_CENTER: readonly [number, number] = [0, 20];
/** Un arrastre de más de esto no cuenta como clic. */
const DRAG_THRESHOLD_PX = 4;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** "Islandia", "Islandia y Reikiavik", "Japón, Kioto y Nara". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/**
 * Mapa mundial de Mi mapa (D3 + TopoJSON en SVG).
 * D3 calcula los trazos (geo-shapes) y el zoom; Angular dibuja el SVG.
 * Las reglas de "visitado" vienen ya resueltas de la API (/api/me/map).
 */
@Component({
  selector: 'app-world-map',
  imports: [CountryCard, LucidePlus, LucideMinus, LucideGlobe, LucideX, RouterLink],
  templateUrl: './world-map.html',
  styleUrl: './world-map.scss',
  host: {
    '(document:keydown.escape)': 'close()',
    '(document:click)': 'onDocumentClick($event)',
    '(document:pointermove)': 'onDrag($event)',
    '(document:pointerup)': 'endDrag()',
    '(document:pointercancel)': 'endDrag()',
  },
})
export class WorldMap {
  readonly drawing = input.required<WorldDrawing>();
  readonly userMap = input.required<UserMap>();
  /** Recuerdo recién guardado: se animan los lugares que encendió. */
  readonly saved = input<SavedMemory | null>(null);
  /** El aviso ya se mostró. */
  readonly savedShown = output<void>();
  /** Reproduce tu historia: el año que se muestra (userMap ya viene recortado a ese año). */
  readonly history = input<HistoryFrame | null>(null);
  /** País cuya tarjeta se abre al llegar (?pais=JPN, p. ej. desde la búsqueda). */
  readonly focus = input<string | null>(null);
  /** Se cerró la tarjeta del país de `focus`. */
  readonly focusCleared = output<void>();

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

  // --- Globo 3D ------------------------------------------------------------------------

  /** El usuario pidió el globo (la transición puede ir a medias). */
  protected readonly globe = signal(false);
  /** 0 = plano, 1 = globo; en medio, la transición. */
  private readonly alpha = signal(0);
  private readonly center = signal<readonly [number, number]>(GLOBE_DEFAULT_CENTER);
  private readonly globeZoom = signal(1);
  private frame: number | null = null;
  private drag: { x: number; y: number; center: readonly [number, number]; moved: boolean } | null =
    null;
  /** El último arrastre movió el globo: el clic que lo termina no abre la tarjeta. */
  private dragged = false;

  /** Lo que se dibuja: el mundo plano o el globo con su giro y acercamiento. */
  protected readonly view = computed<WorldDrawing>(() => {
    const view: GlobeView = { alpha: this.alpha(), center: this.center(), zoom: this.globeZoom() };
    return this.drawing().view(view);
  });

  /** El globo ya terminó de abrirse (se puede girar). */
  protected readonly isGlobe = computed(() => this.alpha() >= 1);

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

    afterNextRender(() => {
      this.setUpZoom();
      // El mundo simplificado del globo se prepara cuando el navegador está libre.
      if (typeof requestIdleCallback === 'function') {
        const idle = requestIdleCallback(() =>
          this.drawing().view({ alpha: 1, center: GLOBE_DEFAULT_CENTER, zoom: 1 }),
        );
        this.destroyRef.onDestroy(() => cancelIdleCallback(idle));
      }
    });
    this.destroyRef.onDestroy(() => {
      this.cancelHide();
      this.clearLitTimer();
      this.cancelFrame();
    });

    // ?pais=: abre su tarjeta y, en el globo, gira hacia él.
    effect(() => {
      const iso3 = this.focus();
      if (!iso3 || !this.isOpenable(iso3)) return;
      untracked(() => {
        this.summaries.load(iso3);
        this.pinned.set(iso3);
        const location = this.drawing().locate(iso3);
        if (this.globe() && location) this.center.set([location.lon, location.lat]);
      });
    });

    // El aviso de "se encendió" se va solo.
    effect(() => {
      if (!this.saved()) return;
      untracked(() => {
        this.clearLitTimer();
        this.litTimer = setTimeout(() => this.savedShown.emit(), LIT_NOTICE_MS);
      });
    });
  }

  // --- Recién encendido ------------------------------------------------------------------

  private litTimer: ReturnType<typeof setTimeout> | null = null;

  /** Lo recién encendido: por el recuerdo guardado o por el año de la historia. */
  protected readonly litCountries = computed(
    () =>
      new Set([...(this.saved()?.lit.countries ?? []), ...(this.history()?.lit.countries ?? [])]),
  );
  protected readonly litCities = computed(
    () => new Set([...(this.saved()?.lit.cities ?? []), ...(this.history()?.lit.cities ?? [])]),
  );

  protected readonly litNotice = computed(() => {
    const saved = this.saved();
    if (!saved) return null;
    const countries = saved.lit.countries.map((iso3) => this.anchors().get(iso3)?.name ?? iso3);
    const cityNames = new Map(this.userMap().cities.map((c) => [c.id, c.name_es]));
    const cities = saved.lit.cities.flatMap((id) => cityNames.get(id) ?? []);
    const names = [...countries, ...cities];
    const text = names.length
      ? `${listNames(names)} ${names.length === 1 ? 'se encendió' : 'se encendieron'} en tu mapa`
      : 'Recuerdo guardado';
    return { text, tripId: saved.tripId };
  });

  protected dismissLit(): void {
    this.clearLitTimer();
    this.savedShown.emit();
  }

  private clearLitTimer(): void {
    if (this.litTimer !== null) clearTimeout(this.litTimer);
    this.litTimer = null;
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
      WorldDrawing['shapes']
    >;
    for (const shape of this.view().shapes) {
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
    this.view().dots.map((dot) => {
      const [x, y] = this.toView([dot.x, dot.y]);
      return { ...dot, x, y };
    }),
  );

  protected readonly cityLights = computed(() => {
    if (!this.layers().has('cities')) return [];
    const { project } = this.view();
    return this.userMap().cities.flatMap((city) => {
      const p = project(city.location);
      if (!p) return [];
      const [x, y] = this.toView(p);
      return [{ id: city.id, name: city.name_es, x, y, lit: this.litCities().has(city.id) }];
    });
  });

  protected readonly monumentPins = computed(() => {
    if (!this.layers().has('monuments')) return [];
    const { project } = this.view();
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
    for (const s of this.view().shapes) anchors.set(s.id, { name: s.name, point: s.anchor });
    for (const d of this.view().dots) anchors.set(d.id, { name: d.name, point: [d.x, d.y] });
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
    // Mientras se gira el globo no se abren tarjetas al pasar.
    if (this.drag?.moved) return;
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
    if (this.dragged) return;
    this.summaries.load(iso3);
    if (this.pinned() === iso3) this.unpin();
    else this.pinned.set(iso3);
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
    this.unpin();
    this.hovered.set(null);
  }

  private unpin(): void {
    if (this.pinned() === null) return;
    this.pinned.set(null);
    if (this.focus()) this.focusCleared.emit();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.pinned()) return;
    const card = this.card()?.nativeElement;
    if (card && event.target instanceof Node && card.contains(event.target)) return;
    this.unpin();
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
    if (this.globe()) {
      this.zoomGlobe(factor);
      return;
    }
    if (!this.zoomBehavior) return;
    select(this.svg().nativeElement)
      .transition()
      .duration(300)
      .call(this.zoomBehavior.scaleBy, factor);
  }

  protected readonly zoomStep = ZOOM_STEP;
  protected readonly canZoomIn = computed(() =>
    this.globe() ? this.globeZoom() < GLOBE_MAX_ZOOM - 0.01 : this.transform().k < MAX_ZOOM - 0.01,
  );
  protected readonly canZoomOut = computed(() =>
    this.globe() ? this.globeZoom() > 1.01 : this.transform().k > 1.01,
  );

  // --- Globo: abrir y cerrar, girar y acercar ----------------------------------------------

  /** Centro inicial del globo: la casa (o la primera ciudad visitada). */
  private readonly homeCenter = computed<readonly [number, number]>(() => {
    const cities = this.userMap().cities;
    const city = cities.find((c) => c.is_home) ?? cities[0];
    return city ? [city.location.lon, city.location.lat] : GLOBE_DEFAULT_CENTER;
  });

  protected async toggleGlobe(): Promise<void> {
    const toGlobe = !this.globe();
    this.globe.set(toGlobe);
    this.close();
    this.tooltip.set(null);
    if (toGlobe) {
      // El globo se abre sin el zoom del mapa plano, mirando hacia tu casa.
      await this.resetFlatZoom();
      this.center.set(this.homeCenter());
      this.globeZoom.set(1);
    }
    this.animateAlpha(toGlobe ? 1 : 0);
  }

  private async resetFlatZoom(): Promise<void> {
    const t = this.transform();
    if (!this.zoomBehavior || (t.k === 1 && t.x === 0 && t.y === 0)) return;
    const selection = select(this.svg().nativeElement);
    if (prefersReducedMotion()) {
      selection.call(this.zoomBehavior.transform, zoomIdentity);
      return;
    }
    await selection
      .transition()
      .duration(300)
      .call(this.zoomBehavior.transform, zoomIdentity)
      .end()
      .catch(() => undefined);
  }

  private animateAlpha(to: number): void {
    this.cancelFrame();
    const from = this.alpha();
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      this.alpha.set(to);
      return;
    }
    const start = performance.now();
    const duration = GLOBE_MS * Math.abs(to - from);
    const tick = (now: number) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      this.alpha.set(from + (to - from) * easeInOut(t));
      this.frame = t < 1 ? requestAnimationFrame(tick) : null;
    };
    this.frame = requestAnimationFrame(tick);
  }

  private cancelFrame(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private zoomGlobe(factor: number): void {
    this.globeZoom.update((z) => Math.min(GLOBE_MAX_ZOOM, Math.max(1, z * factor)));
  }

  /** Gira el globo: el punto del frente se mueve dlon/dlat grados. */
  private rotateGlobe(from: readonly [number, number], dlon: number, dlat: number): void {
    const lon = ((((from[0] + dlon) % 360) + 540) % 360) - 180;
    const lat = Math.max(-GLOBE_MAX_LAT, Math.min(GLOBE_MAX_LAT, from[1] + dlat));
    this.center.set([lon, lat]);
  }

  protected startDrag(event: PointerEvent): void {
    this.dragged = false;
    if (!this.isGlobe() || event.button !== 0) return;
    this.drag = { x: event.clientX, y: event.clientY, center: this.center(), moved: false };
  }

  protected onDrag(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      this.tooltip.set(null);
      this.hovered.set(null);
    }
    // Grados por pixel: el borde del globo queda a 90° del centro.
    const radius = (this.view().disc?.r ?? 1) * this.scale();
    const degrees = 180 / (Math.PI * radius);
    this.rotateGlobe(drag.center, -dx * degrees, dy * degrees);
  }

  protected endDrag(): void {
    if (!this.drag) return;
    this.dragged = this.drag.moved;
    this.drag = null;
    // El clic llega justo después de soltar; después ya se vale.
    setTimeout(() => (this.dragged = false));
  }

  protected onGlobeWheel(event: WheelEvent): void {
    if (!this.isGlobe() || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    this.zoomGlobe(Math.exp(-event.deltaY * 0.002));
  }

  protected onGlobeKey(event: KeyboardEvent): void {
    if (!this.isGlobe() || event.target !== this.svg().nativeElement) return;
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-GLOBE_KEY_STEP, 0],
      ArrowRight: [GLOBE_KEY_STEP, 0],
      ArrowUp: [0, GLOBE_KEY_STEP],
      ArrowDown: [0, -GLOBE_KEY_STEP],
    };
    const step = steps[event.key];
    if (step) {
      event.preventDefault();
      this.rotateGlobe(this.center(), ...step);
    } else if (event.key === '+' || event.key === '=') {
      this.zoomGlobe(ZOOM_STEP);
    } else if (event.key === '-') {
      this.zoomGlobe(1 / ZOOM_STEP);
    }
  }

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
      .filter((event: MouseEvent | WheelEvent) => {
        // En el globo (y durante la transición) el arrastre gira en vez de desplazar.
        if (this.alpha() > 0) return false;
        return event.type === 'wheel' ? event.ctrlKey || event.metaKey : !event.button;
      })
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
