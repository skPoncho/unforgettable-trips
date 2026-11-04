import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import type { CountrySummary, Progress, UserMap } from './api/types';

export type {
  CityStatus,
  CountryStatus,
  CountrySummary,
  MonumentStamp,
  PlaceStatus,
  Progress,
  UserMap,
} from './api/types';

/** Datos del usuario actual (/api/me). Las reglas de qué cuenta viven en la API. */
@Injectable({ providedIn: 'root' })
export class MeApi {
  private readonly http = inject(HttpClient);

  progress() {
    return this.http.get<Progress>('/api/me/progress');
  }

  map() {
    return this.http.get<UserMap>('/api/me/map');
  }

  /** Tarjeta de país; 404 si no lo has visitado. */
  country(iso3: string) {
    return this.http.get<CountrySummary>(`/api/me/countries/${iso3}`);
  }
}
