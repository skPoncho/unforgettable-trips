import { A11yModule } from '@angular/cdk/a11y';
import { CdkDrag, type CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideCheck,
  LucideInfo,
  LucideLoaderCircle,
  LucideMapPin,
  LucidePlus,
  LucideTriangleAlert,
  LucideUpload,
  LucideX,
} from '@lucide/angular';

import type { Trip, Visibility, VisitType } from '../../core/api/types';
import { VISIBILITY_LABELS, count, dateRange, monthYear } from '../../core/format';
import {
  type City,
  MemoriesApi,
  type MemoryIn,
  type MemorySuggestion,
  type SuggestedPlace,
  type UploadedPhoto,
} from '../../core/memories-api';
import { MemoryEvents } from '../../core/memory-events';
import { photoUrl } from '../../core/trips-api';
import { PlaceMinimap } from './place-minimap';
import { PlaceSearch } from '../../shared/place-search';

/** Subidas en paralelo. */
const PARALLEL_UPLOADS = 3;
/** Lo que acepta la API; HEIC a veces llega sin tipo MIME, por eso también la extensión. */
export const ACCEPTED_FILES = 'image/jpeg,image/png,image/heic,image/heif,.heic,.heif';
/** Tipos que el navegador puede mostrar antes de subir (HEIC no). */
const PREVIEWABLE = new Set(['image/jpeg', 'image/png']);

/** De más privada a más abierta: el recuerdo puede ser igual o más privado que su viaje. */
const VISIBILITY_ORDER: readonly Visibility[] = ['private', 'link', 'public'];

/** Valor del selector de viaje para "crear un viaje automático". */
export const AUTO_TRIP = 'auto';

export interface PhotoItem {
  key: number;
  name: string;
  file: File | null;
  /** Vista previa local mientras sube (object URL). */
  preview: string | null;
  status: 'waiting' | 'uploading' | 'done' | 'error';
  photo?: UploadedPhoto;
  error?: string;
}

interface Dates {
  arrived: string;
  departed: string;
}

const VISIT_TYPES: readonly { id: VisitType; label: string; hint: string }[] = [
  { id: 'stay', label: 'Estancia', hint: 'Dormiste o pasaste el día ahí' },
  { id: 'stopover', label: 'Escala', hint: 'De paso: aeropuerto o conexión' },
];

/**
 * Pantalla 4 · Nuevo recuerdo (design/pantallas/Recuerdo.dc.html): ventana sobre Mi mapa.
 * Las fotos se suben al soltarlas; la API sugiere lugar, fechas, monumento y viaje, y el
 * usuario puede corregir todo antes de guardar.
 */
@Component({
  selector: 'app-new-memory-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    A11yModule,
    CdkDropList,
    CdkDrag,
    PlaceMinimap,
    PlaceSearch,
    LucideUpload,
    LucideMapPin,
    LucideX,
    LucideInfo,
    LucideCheck,
    LucidePlus,
    LucideLoaderCircle,
    LucideTriangleAlert,
  ],
  templateUrl: './new-memory-dialog.html',
  styleUrl: './new-memory-dialog.scss',
  host: { '(document:keydown.escape)': 'cancel()' },
})
export class NewMemoryDialog {
  private readonly api = inject(MemoriesApi);
  private readonly events = inject(MemoryEvents);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  protected readonly accepted = ACCEPTED_FILES;
  protected readonly visitTypes = VISIT_TYPES;
  protected readonly autoTrip = AUTO_TRIP;
  protected readonly visibilityLabels = VISIBILITY_LABELS;

  constructor() {
    // La página de atrás no se desplaza mientras la ventana está abierta.
    const body = this.document.body;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    inject(DestroyRef).onDestroy(() => {
      body.style.overflow = previous;
      for (const item of this.items()) this.revoke(item);
    });
  }

  // --- Fotos ----------------------------------------------------------------------------

  readonly items = signal<PhotoItem[]>([]);
  protected readonly dragOver = signal(false);
  private nextKey = 0;

  private readonly donePhotos = computed(() =>
    this.items().flatMap((i) => (i.status === 'done' && i.photo ? [i.photo] : [])),
  );
  protected readonly photoIds = computed(() => this.donePhotos().map((p) => p.id));
  protected readonly uploading = computed(() =>
    this.items().some((i) => i.status === 'waiting' || i.status === 'uploading'),
  );

  protected readonly photoSummary = computed(() => {
    const photos = this.donePhotos();
    if (!photos.length) return null;
    const located = photos.filter((p) => p.location).length;
    return `${count(photos.length, 'foto', 'fotos')} · ${located} con ubicación`;
  });

  protected thumbOf(item: PhotoItem): string | null {
    return item.photo ? photoUrl(item.photo.id, 'thumb') : item.preview;
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragOver.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  addFiles(files: File[]): void {
    if (!files.length) return;
    const added = files.map((file): PhotoItem => ({
      key: this.nextKey++,
      name: file.name,
      file,
      preview: PREVIEWABLE.has(file.type) ? URL.createObjectURL(file) : null,
      status: 'waiting',
    }));
    this.items.update((items) => [...items, ...added]);
    this.pump();
  }

  /** Sube las que esperan, de PARALLEL_UPLOADS en PARALLEL_UPLOADS. */
  private pump(): void {
    const items = this.items();
    let free = PARALLEL_UPLOADS - items.filter((i) => i.status === 'uploading').length;
    for (const item of items) {
      if (free <= 0) break;
      if (item.status !== 'waiting' || !item.file) continue;
      free--;
      this.patch(item.key, { status: 'uploading' });
      this.api.upload([item.file]).subscribe({
        next: (result) => this.uploaded(item.key, result.photos[0], result.errors[0]?.detail),
        error: (error: unknown) => this.uploaded(item.key, undefined, uploadErrorMessage(error)),
      });
    }
  }

  private uploaded(key: number, photo: UploadedPhoto | undefined, error?: string): void {
    if (!photo) {
      this.patch(key, { status: 'error', error: error ?? 'No se pudo subir', file: null });
    } else if (photo.memory_id) {
      this.patch(key, { status: 'error', error: 'Ya está en otro recuerdo', file: null });
    } else if (this.items().some((i) => i.key !== key && i.photo?.id === photo.id)) {
      // La misma foto dos veces: se queda una.
      this.remove(key, { keepOnServer: true });
    } else {
      this.patch(key, { status: 'done', photo, file: null });
    }
    this.pump();
  }

  private patch(key: number, changes: Partial<PhotoItem>): void {
    this.items.update((items) => items.map((i) => (i.key === key ? { ...i, ...changes } : i)));
  }

  protected remove(key: number, options: { keepOnServer?: boolean } = {}): void {
    const item = this.items().find((i) => i.key === key);
    if (!item) return;
    this.revoke(item);
    this.items.update((items) => items.filter((i) => i.key !== key));
    if (!options.keepOnServer && item.photo && !item.photo.duplicate) {
      this.api.deletePhoto(item.photo.id).subscribe({ error: () => undefined });
    }
  }

  protected drop(event: CdkDragDrop<PhotoItem[]>): void {
    this.items.update((items) => {
      const next = [...items];
      moveItemInArray(next, event.previousIndex, event.currentIndex);
      return next;
    });
  }

  /** Alternativa al arrastre para teclado: la foto pasa a ser la portada. */
  protected makeCover(key: number): void {
    this.items.update((items) => {
      const item = items.find((i) => i.key === key);
      return item ? [item, ...items.filter((i) => i.key !== key)] : items;
    });
  }

  private revoke(item: PhotoItem): void {
    if (item.preview) URL.revokeObjectURL(item.preview);
  }

  // --- Sugerencias ----------------------------------------------------------------------

  /** Lugar elegido a mano con "Cambiar lugar" (gana sobre el de las fotos). */
  protected readonly placeOverride = signal<SuggestedPlace | null>(null);
  protected readonly datesOverride = signal<Dates | null>(null);
  protected readonly searching = signal(false);

  private readonly suggestionResource = httpResource<MemorySuggestion>(() => {
    const photoIds = this.photoIds();
    const location = this.placeOverride()?.location ?? null;
    const dates = this.datesOverride();
    if (!photoIds.length && !location) return undefined;
    return {
      url: '/api/memories/suggest',
      method: 'POST',
      body: {
        photo_ids: photoIds,
        location,
        arrived_on: dates?.arrived ?? null,
        departed_on: dates?.departed ?? null,
      },
    };
  });

  /** La última sugerencia: no se borra mientras llega la siguiente. */
  protected readonly suggestion = linkedSignal<
    MemorySuggestion | undefined,
    MemorySuggestion | null
  >({
    source: () => this.suggestionResource.value(),
    computation: (value, previous) => value ?? previous?.value ?? null,
  });

  protected readonly place = computed(
    () => this.placeOverride() ?? this.suggestion()?.place ?? null,
  );
  protected readonly placeDetected = computed(() => !this.placeOverride() && !!this.place());

  protected readonly placeLabel = computed(() => {
    const place = this.place();
    if (!place) return null;
    return place.place_name === place.country.name_es
      ? place.country.name_es
      : `${place.place_name}, ${place.country.name_es}`;
  });

  protected readonly arrivedOn = computed(
    () => this.datesOverride()?.arrived ?? this.suggestion()?.arrived_on ?? null,
  );
  protected readonly departedOn = computed(
    () => this.datesOverride()?.departed ?? this.suggestion()?.departed_on ?? this.arrivedOn(),
  );
  protected readonly dateLabel = computed(() => {
    const from = this.arrivedOn();
    return from ? dateRange(from, this.departedOn() ?? from) : null;
  });

  protected choosePlace(city: City): void {
    this.placeOverride.set({
      place_name: city.name_es,
      location: city.location,
      city: { id: city.id, name_es: city.name_es },
      country: { iso3: city.country_iso3, name_es: city.country_name_es },
      subdivision: null,
    });
    this.searching.set(false);
  }

  protected setDate(which: keyof Dates, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const current: Dates = {
      arrived: this.arrivedOn() ?? value,
      departed: this.departedOn() ?? value,
    };
    const next = { ...current, [which]: value };
    if (!next.arrived) return;
    if (!next.departed || next.departed < next.arrived) {
      if (which === 'arrived') next.departed = next.arrived;
      else next.arrived = next.departed;
    }
    this.datesOverride.set(next);
  }

  // --- Detalles ------------------------------------------------------------------------

  protected readonly visitType = signal<VisitType>('stay');
  protected readonly body = signal('');

  private readonly allTrips = httpResource<Trip[]>(() => '/api/trips');

  /** `?viaje=<id>`: se abrió desde el detalle de ese viaje (fase 5). */
  readonly viaje = input<string>();

  /** Viaje elegido a mano (o el de `?viaje`); si no, el primero sugerido o uno automático. */
  private readonly tripPick = linkedSignal<string | null>(() => this.viaje() ?? null);
  protected readonly tripId = computed(
    () => this.tripPick() ?? this.suggestion()?.trips[0]?.id ?? AUTO_TRIP,
  );

  protected readonly suggestedTrips = computed(() => this.suggestion()?.trips ?? []);
  protected readonly otherTrips = computed(() => {
    const suggested = new Set(this.suggestedTrips().map((t) => t.id));
    return (this.allTrips.value() ?? []).filter((t) => !suggested.has(t.id));
  });

  private readonly tripVisibility = computed<Visibility | null>(() => {
    const id = this.tripId();
    if (id === AUTO_TRIP) return null;
    const trip =
      this.suggestedTrips().find((t) => t.id === id) ??
      (this.allTrips.value() ?? []).find((t) => t.id === id);
    return trip?.visibility ?? null;
  });

  protected readonly autoTripTitle = computed(() => {
    const place = this.place();
    const from = this.arrivedOn();
    if (!place || !from) return 'Viaje nuevo';
    return `Viaje nuevo: ${place.place_name} · ${monthYear(from)}`;
  });

  protected chooseTrip(event: Event): void {
    this.tripPick.set((event.target as HTMLSelectElement).value);
  }

  protected readonly monuments = computed(() => this.suggestion()?.monuments ?? []);
  protected readonly monumentId = signal<number | null>(null);

  protected toggleMonument(id: number): void {
    this.monumentId.update((current) => (current === id ? null : id));
  }

  /** Solo las opciones que permite el viaje (igual o más privada). */
  protected readonly visibilityOptions = computed(() => {
    const max = this.tripVisibility();
    return max ? VISIBILITY_ORDER.slice(0, VISIBILITY_ORDER.indexOf(max) + 1) : VISIBILITY_ORDER;
  });

  private readonly visibilityPick = signal<Visibility | null>(null);
  protected readonly visibility = computed<Visibility>(() => {
    const options = this.visibilityOptions();
    const wanted = this.visibilityPick() ?? this.tripVisibility() ?? 'private';
    return options.includes(wanted) ? wanted : options[options.length - 1];
  });

  protected chooseVisibility(value: Visibility): void {
    this.visibilityPick.set(value);
  }

  protected readonly footNote = computed(() => {
    const place = this.place();
    if (!place) return 'Agrega una foto con ubicación o elige el lugar.';
    if (this.visitType() === 'stopover') {
      return 'Las escalas también encienden el país en tu mapa, marcado como “escala”.';
    }
    const country = place.country.name_es;
    return place.place_name === country
      ? `Se encenderá ${country} en tu mapa (si aún no lo estaba).`
      : `Se encenderán ${place.place_name} y ${country} en tu mapa (si aún no lo estaban).`;
  });

  // --- Guardar -------------------------------------------------------------------------

  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);

  protected readonly canSave = computed(
    () => !!this.place() && !!this.arrivedOn() && !this.uploading() && !this.saving(),
  );

  protected readonly saveHint = computed(() => {
    if (this.uploading()) return 'Espera a que terminen de subir tus fotos.';
    if (!this.place()) return 'Falta el lugar.';
    if (!this.arrivedOn()) return 'Falta la fecha.';
    return null;
  });

  buildMemory(): MemoryIn | null {
    const place = this.place();
    const arrived = this.arrivedOn();
    if (!place || !arrived) return null;
    const tripId = this.tripId();
    const stay = this.visitType() === 'stay';
    const visibility = this.visibility();
    return {
      place: {
        place_name: place.place_name,
        location: place.location,
        visit_type: this.visitType(),
        arrived_on: arrived,
        departed_on: this.departedOn() ?? arrived,
        // Una escala sin ciudad (aeropuerto) no enciende ciudades.
        ...(stay && place.city ? { city_id: place.city.id } : {}),
      },
      trip_id: tripId === AUTO_TRIP ? null : tripId,
      monument_id: this.monumentId(),
      body: this.body().trim(),
      photo_ids: this.photoIds(),
      // Igual a la del viaje = hereda (null). En un viaje automático, es la del viaje.
      visibility: tripId !== AUTO_TRIP && visibility === this.tripVisibility() ? null : visibility,
    };
  }

  protected save(): void {
    const memory = this.buildMemory();
    if (!memory || !this.canSave()) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.api.create(memory).subscribe({
      next: (created) => {
        // Las fotos ya son del recuerdo: no se borran al cerrar.
        this.items.set([]);
        this.events.notifySaved({
          memoryId: created.id,
          tripId: created.trip_id,
          lit: created.lit,
        });
        this.leave();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(saveErrorMessage(error));
      },
    });
  }

  cancel(): void {
    if (this.saving()) return;
    // Las fotos subidas sin guardar se borran (la API también las borra a las 24 h).
    for (const item of this.items()) {
      if (item.photo && !item.photo.duplicate) {
        this.api.deletePhoto(item.photo.id).subscribe({ error: () => undefined });
      }
    }
    this.items.set([]);
    this.leave();
  }

  /** Vuelve a Mi mapa, o al viaje si la ventana se abrió desde él. */
  private leave(): void {
    const trip = this.viaje();
    void this.router.navigate(trip ? ['/viajes', trip] : ['/']);
  }
}

function detailOf(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const detail: unknown = error.error?.detail;
  return typeof detail === 'string' ? detail : null;
}

function uploadErrorMessage(error: unknown): string {
  return detailOf(error) ?? 'No se pudo subir';
}

function saveErrorMessage(error: unknown): string {
  return detailOf(error) ?? 'No se pudo guardar. Intenta de nuevo.';
}
