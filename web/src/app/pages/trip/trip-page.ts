import {
  CdkDrag,
  type CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { httpResource } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideCamera,
  LucideCheck,
  LucideChevronDown,
  LucideChevronUp,
  LucideGlobe,
  LucideGripVertical,
  LucideLandmark,
  LucideLink,
  LucideLock,
  LucidePencil,
  LucidePlane,
  LucidePlus,
  LucideStar,
  LucideTrash,
  LucideX,
} from '@lucide/angular';
import type { Observable } from 'rxjs';
import type { Topology } from 'topojson-specification';

import type { Visibility } from '../../core/api/types';
import {
  CONTINENT_NAMES,
  VISIBILITY_HINTS,
  VISIBILITY_LABELS,
  count,
  dateRange,
  dayMonthRange,
  monthYear,
  tripDays,
} from '../../core/format';
import { drawTripRoute } from '../../core/map/trip-route';
import {
  type TripDetail,
  type TripMemory,
  type TripPhoto,
  type TripStop,
  TripsApi,
  photoUrl,
} from '../../core/trips-api';
import { ConfirmDialog } from './confirm-dialog';
import { PhotoViewer } from './photo-viewer';
import { TripMap } from './trip-map';
import { type StayEntry, findMemory, stayEntries, stopoverNotices } from './trip-view';

const VISIBILITIES: readonly Visibility[] = ['private', 'link', 'public'];

interface PendingDelete {
  title: string;
  detail: string;
  run: () => Observable<unknown>;
}

interface Gallery {
  photos: TripPhoto[];
  start: number;
  title: string;
}

/**
 * Detalle de viaje (/viajes/:id, pantalla 2, Viaje.dc.html): mapa regional con la ruta,
 * bitácora por parada sincronizada con el mapa, visibilidad, momento favorito y edición.
 */
@Component({
  selector: 'app-trip-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TripMap,
    PhotoViewer,
    ConfirmDialog,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    LucideArrowLeft,
    LucidePlus,
    LucideGlobe,
    LucideLock,
    LucideLink,
    LucideStar,
    LucideCamera,
    LucideLandmark,
    LucidePlane,
    LucidePencil,
    LucideTrash,
    LucideGripVertical,
    LucideChevronUp,
    LucideChevronDown,
    LucideCheck,
    LucideX,
  ],
  templateUrl: './trip-page.html',
  styleUrl: './trip-page.scss',
})
export class TripPage {
  private readonly api = inject(TripsApi);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** De la ruta (withComponentInputBinding). */
  readonly id = input.required<string>();
  /** `?parada=3`: la estancia elegida, para recargar o compartir el enlace. */
  readonly parada = input<string>();

  protected readonly trip = httpResource<TripDetail>(() => `/api/trips/${this.id()}`);
  private readonly topology = httpResource<Topology>(() => '/geo/world.topo.json');

  protected readonly visibilities = VISIBILITIES;
  protected readonly visibilityLabels = VISIBILITY_LABELS;
  protected readonly photoUrl = photoUrl;

  protected readonly entries = computed(() => {
    const t = this.trip.value();
    return t ? stayEntries(t) : [];
  });
  protected readonly notices = computed(() => {
    const t = this.trip.value();
    return t ? stopoverNotices(t) : [];
  });
  protected readonly drawing = computed(() => {
    const t = this.trip.value();
    const topology = this.topology.value();
    return t && topology ? drawTripRoute(topology, t.stops) : null;
  });
  protected readonly favorite = computed(() => {
    const t = this.trip.value();
    return t ? findMemory(t, t.favorite_memory_id) : null;
  });

  // --- Parada elegida (sincronía mapa ↔ bitácora) ---------------------------------------

  private readonly picked = linkedSignal(() => Number(this.parada()) || 1);
  /** Número de la estancia elegida, dentro del rango aunque se borren paradas. */
  protected readonly selected = computed(() => {
    const total = this.entries().length;
    return total ? Math.min(Math.max(this.picked(), 1), total) : null;
  });

  /** Elige una estancia; desde el mapa además lleva su entrada a la vista. */
  protected select(n: number, from: 'map' | 'list'): void {
    this.picked.set(n);
    void this.router.navigate([], {
      queryParams: { parada: n },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (from === 'map') {
      const entry = this.host.nativeElement.querySelector(`#parada-${n}`);
      entry?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // --- Encabezado ------------------------------------------------------------------------

  protected readonly crumb = computed(() => {
    const t = this.trip.value();
    if (!t) return null;
    return {
      continent: t.continent ? CONTINENT_NAMES[t.continent] : null,
      title: t.starts_on ? `${t.title} · ${monthYear(t.starts_on)}` : t.title,
    };
  });

  protected readonly eyebrow = computed(() => {
    const t = this.trip.value();
    if (!t) return '';
    const dates = t.starts_on && t.ends_on ? dateRange(t.starts_on, t.ends_on) : 'Sin fechas';
    return `${dates} · viaje ${t.trip_number} de ${t.trip_total}`;
  });

  protected readonly visibilityHint = computed(() => {
    const t = this.trip.value();
    return t ? VISIBILITY_HINTS[t.visibility] : '';
  });

  protected readonly stats = computed(() => {
    const t = this.trip.value();
    if (!t) return [];
    return [
      { value: t.days, label: t.days === 1 ? 'día' : 'días' },
      { value: t.city_count, label: t.city_count === 1 ? 'ciudad' : 'ciudades' },
      { value: t.monument_count, label: t.monument_count === 1 ? 'monumento' : 'monumentos' },
      { value: t.photo_count, label: t.photo_count === 1 ? 'foto' : 'fotos' },
    ];
  });

  // --- Guardar cambios -------------------------------------------------------------------

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** PATCH del viaje: la respuesta es el detalle completo y reemplaza al actual. */
  private save(patch: Parameters<TripsApi['update']>[1], done?: () => void): void {
    const t = this.trip.value();
    if (!t || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.api.update(t.id, patch).subscribe({
      next: (updated) => {
        this.trip.value.set(updated);
        this.saving.set(false);
        done?.();
      },
      error: () => {
        this.saving.set(false);
        this.error.set('No se pudo guardar el cambio. Intenta de nuevo.');
      },
    });
  }

  /** Cambios que reordenan o borran: después se vuelve a pedir el viaje. */
  private run(request: Observable<unknown>, done?: () => void): void {
    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        done?.();
        this.trip.reload();
      },
      error: () => {
        this.saving.set(false);
        this.error.set('No se pudo guardar el cambio. Intenta de nuevo.');
      },
    });
  }

  // Visibilidad (radiogroup: flechas para moverse, como un grupo de radios nativo).

  protected setVisibility(visibility: Visibility): void {
    if (this.trip.value()?.visibility !== visibility) this.save({ visibility });
  }

  protected onVisibilityKey(event: KeyboardEvent): void {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    const current = this.trip.value()?.visibility;
    if (!delta || !current) return;
    event.preventDefault();
    const next = VISIBILITIES[(VISIBILITIES.indexOf(current) + delta + 3) % 3];
    this.setVisibility(next);
    const group = (event.currentTarget as HTMLElement).parentElement;
    group?.querySelector<HTMLElement>(`[data-visibility="${next}"]`)?.focus();
  }

  // Momento favorito.

  protected toggleFavorite(memory: TripMemory): void {
    const isFavorite = this.trip.value()?.favorite_memory_id === memory.id;
    this.save({ favorite_memory_id: isFavorite ? null : memory.id });
  }

  // Título y resumen, editables en su lugar.

  protected readonly editing = signal<'title' | 'summary' | null>(null);
  protected readonly draft = signal('');

  protected startEditing(field: 'title' | 'summary'): void {
    const t = this.trip.value();
    if (!t) return;
    this.draft.set((field === 'title' ? t.title : t.summary) ?? '');
    this.editing.set(field);
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(`#trip-${field}`)?.focus(),
      { injector: this.injector },
    );
  }

  protected saveEditing(): void {
    const field = this.editing();
    if (!field) return;
    const value = this.draft().trim();
    if (field === 'title' && !value) return;
    const t = this.trip.value();
    const unchanged = field === 'title' ? value === t?.title : value === (t?.summary ?? '');
    if (unchanged) {
      this.editing.set(null);
      return;
    }
    const patch = field === 'title' ? { title: value } : { summary: value || null };
    this.save(patch, () => this.editing.set(null));
  }

  protected onEditKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.editing.set(null);
    } else if (
      event.key === 'Enter' &&
      (this.editing() === 'title' || event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      this.saveEditing();
    }
  }

  protected onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  // --- Bitácora --------------------------------------------------------------------------

  /** Modo edición: todas las paradas (también escalas) para reordenar o borrar. */
  protected readonly editMode = signal(false);

  protected dayLabel(stop: TripStop): string {
    const start = this.trip.value()?.starts_on;
    return start ? tripDays(start, stop.arrived_on, stop.departed_on) : '';
  }

  protected dateLabel(stop: TripStop): string {
    return dayMonthRange(stop.arrived_on, stop.departed_on);
  }

  protected photoCount(entry: StayEntry): string {
    return count(entry.photos.length, 'foto', 'fotos');
  }

  /** Número de estancia de una parada (null para escalas). */
  protected stayNumber(stop: TripStop): number | null {
    return this.entries().find((e) => e.stop.id === stop.id)?.n ?? null;
  }

  protected openGallery(entry: StayEntry, start: number): void {
    this.gallery.set({ photos: entry.photos, start, title: entry.stop.place_name });
  }

  protected readonly gallery = signal<Gallery | null>(null);

  protected drop(event: CdkDragDrop<TripStop[]>): void {
    if (event.previousIndex !== event.currentIndex)
      this.move(event.previousIndex, event.currentIndex);
  }

  /** Mueve la parada de `from` a `to` (índices en la lista completa) y guarda el orden. */
  protected move(from: number, to: number): void {
    const t = this.trip.value();
    if (!t || to < 0 || to >= t.stops.length) return;
    const ids = t.stops.map((s) => s.id);
    moveItemInArray(ids, from, to);
    // Se reordena en pantalla de inmediato; la recarga confirma lo guardado.
    const byId = new Map(t.stops.map((s) => [s.id, s]));
    this.trip.value.set({
      ...t,
      stops: ids.map((id, position) => ({ ...byId.get(id)!, position })),
    });
    this.run(this.api.reorderStops(t.id, ids));
  }

  // --- Borrar (siempre con confirmación) -------------------------------------------------

  protected readonly pendingDelete = signal<PendingDelete | null>(null);

  protected askDeleteStop(stop: TripStop): void {
    const memories = stop.memories.length;
    const photos = stop.memories.reduce((sum, m) => sum + m.photos.length, 0);
    const detail = memories
      ? `Se borrarán también ${count(memories, 'recuerdo', 'recuerdos')} y ${count(photos, 'foto', 'fotos')}. No se puede deshacer.`
      : 'No se puede deshacer.';
    this.pendingDelete.set({
      title: `¿Borrar la parada ${stop.place_name}?`,
      detail,
      run: () => this.api.deleteStop(stop.id),
    });
  }

  protected askDeleteMemory(memory: TripMemory, place: string): void {
    const detail = memory.photos.length
      ? `Se borrarán también sus ${count(memory.photos.length, 'foto', 'fotos')}. No se puede deshacer.`
      : 'No se puede deshacer.';
    this.pendingDelete.set({
      title: `¿Borrar el recuerdo de ${place}?`,
      detail,
      run: () => this.api.deleteMemory(memory.id),
    });
  }

  protected confirmDelete(): void {
    const pending = this.pendingDelete();
    if (pending) this.run(pending.run(), () => this.pendingDelete.set(null));
  }
}
