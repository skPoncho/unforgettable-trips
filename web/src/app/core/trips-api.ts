import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import type { Trip, TripDetail, TripPatch } from './api/types';

export type { Trip, TripDetail, TripMemory, TripPatch, TripPhoto, TripStop } from './api/types';

/** Viajes del usuario actual (/api/trips) y lo que se edita desde su detalle. */
@Injectable({ providedIn: 'root' })
export class TripsApi {
  private readonly http = inject(HttpClient);

  /** Del más reciente al más antiguo. */
  list() {
    return this.http.get<Trip[]>('/api/trips');
  }

  get(id: string) {
    return this.http.get<TripDetail>(`/api/trips/${id}`);
  }

  /** Título, resumen, visibilidad, portada o momento favorito. Responde el detalle completo. */
  update(id: string, patch: TripPatch) {
    return this.http.patch<TripDetail>(`/api/trips/${id}`, patch);
  }

  /** `stopIds` trae todas las paradas del viaje, en el orden nuevo. */
  reorderStops(tripId: string, stopIds: string[]) {
    return this.http.put<unknown>(`/api/trips/${tripId}/stops/order`, { stop_ids: stopIds });
  }

  /** Borra la parada con sus recuerdos y fotos. */
  deleteStop(stopId: string) {
    return this.http.delete<void>(`/api/stops/${stopId}`);
  }

  /** Borra el recuerdo y sus fotos. */
  deleteMemory(memoryId: string) {
    return this.http.delete<void>(`/api/memories/${memoryId}`);
  }
}

/** Variante de una foto tuya: `thumb` (miniatura) o `display` (para ver). */
export function photoUrl(photoId: string, variant: 'thumb' | 'display' = 'thumb'): string {
  return `/api/photos/${photoId}/${variant}`;
}
