import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import type { Continent } from './geo-api';

// Tipos a mano por ahora; en la fase 3 se generan desde el OpenAPI (openapi-typescript).
export type PlaceStatus = 'visited' | 'stopover';

export interface Count {
  visited: number;
  total: number;
}

export interface Progress {
  countries: Count & { stopover_only: number };
  continents: (Count & { continent: Continent })[];
  subdivisions: Count & { country_iso3: string };
  cities: number;
  monuments: number;
  trips: number;
  photos: number;
  wishlist: number;
}

export interface CountryStatus {
  iso3: string;
  status: PlaceStatus;
  /** Nula para la casa: cuenta desde siempre. */
  first_visited_on: string | null;
  is_home: boolean;
  counts_in_progress: boolean;
}

export interface SubdivisionStatus {
  code: string;
  status: PlaceStatus;
  first_visited_on: string | null;
  is_home: boolean;
}

export interface UserMap {
  countries: CountryStatus[];
  subdivisions: SubdivisionStatus[];
  wishlist: string[];
}

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
}
