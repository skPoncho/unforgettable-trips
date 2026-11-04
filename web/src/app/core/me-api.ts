import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import type { CountrySummary, Me, MePatch, Progress, UserMap } from './api/types';

export type {
  CityStatus,
  CountryStatus,
  CityOverview,
  CountrySummary,
  Me,
  MonumentStamp,
  Passport,
  PassportStamp,
  PlaceStatus,
  Progress,
  SubdivisionOverview,
  SuggestedStamp,
  UserMap,
} from './api/types';

/** Datos del usuario actual (/api/me). Las reglas de qué cuenta viven en la API. */
@Injectable({ providedIn: 'root' })
export class MeApi {
  private readonly http = inject(HttpClient);

  me() {
    return this.http.get<Me>('/api/me');
  }

  update(patch: MePatch) {
    return this.http.patch<Me>('/api/me', patch);
  }

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
