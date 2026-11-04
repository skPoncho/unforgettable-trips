import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Topology } from 'topojson-specification';

import type { Country, Subdivision } from './api/types';

export type { Continent, Country, LonLat, Subdivision } from './api/types';

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
