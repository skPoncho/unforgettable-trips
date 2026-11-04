import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Topology } from 'topojson-specification';

// Tipos a mano por ahora; en la fase 3 se generan desde el OpenAPI (openapi-typescript).
export type Continent = 'america' | 'europe' | 'asia' | 'africa' | 'oceania';

export interface LonLat {
  lon: number;
  lat: number;
}

export interface Country {
  iso3: string;
  iso2: string;
  name_es: string;
  continent: Continent;
  counts_in_progress: boolean;
  sovereign_iso3: string | null;
  label_point: LonLat | null;
}

export interface Subdivision {
  code: string;
  name_es: string;
  country_iso3: string;
}

/** Catálogos geográficos (/api/geo) y geometrías del mapa (/geo/*.topo.json, de make build-geo). */
@Injectable({ providedIn: 'root' })
export class GeoApi {
  private readonly http = inject(HttpClient);

  countries(options: { includeTerritories?: boolean } = {}) {
    const params = options.includeTerritories ? { all: 'true' } : undefined;
    return this.http.get<Country[]>('/api/geo/countries', { params });
  }

  subdivisions(countryIso3: string) {
    return this.http.get<Subdivision[]>('/api/geo/subdivisions', {
      params: { country: countryIso3 },
    });
  }

  topology(name: 'world' | 'mexico') {
    return this.http.get<Topology>(`/geo/${name}.topo.json`);
  }
}
