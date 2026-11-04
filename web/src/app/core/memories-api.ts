import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import type { City, MemoryCreated, MemoryIn, PhotoUpload } from './api/types';

export type {
  City,
  LitPlaces,
  MemoryCreated,
  MemoryIn,
  MemorySuggestion,
  PhotoUpload,
  SuggestIn,
  SuggestedMonument,
  SuggestedPlace,
  SuggestedTrip,
  UploadedPhoto,
} from './api/types';

/** Nuevo recuerdo: subida de fotos, guardado y búsqueda de lugares. */
@Injectable({ providedIn: 'root' })
export class MemoriesApi {
  private readonly http = inject(HttpClient);

  /** Sube fotos sin recuerdo. Los archivos rechazados vienen en `errors`. */
  upload(files: readonly File[]) {
    const form = new FormData();
    for (const file of files) form.append('files', file, file.name);
    return this.http.post<PhotoUpload>('/api/photos', form);
  }

  deletePhoto(id: string) {
    return this.http.delete<void>(`/api/photos/${id}`);
  }

  create(memory: MemoryIn) {
    return this.http.post<MemoryCreated>('/api/memories', memory);
  }

  /** Autocompletar de ciudades (mínimo 2 letras). */
  searchCities(q: string) {
    return this.http.get<City[]>('/api/geo/cities', { params: { q, limit: 8 } });
  }
}
