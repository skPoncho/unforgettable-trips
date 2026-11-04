import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import type { Trip, TripDetail } from './api/types';

export type { Trip, TripDetail } from './api/types';

/** Viajes del usuario actual (/api/trips). */
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
}

/** Variante de una foto tuya: `thumb` (miniatura) o `display` (para ver). */
export function photoUrl(photoId: string, variant: 'thumb' | 'display' = 'thumb'): string {
  return `/api/photos/${photoId}/${variant}`;
}
