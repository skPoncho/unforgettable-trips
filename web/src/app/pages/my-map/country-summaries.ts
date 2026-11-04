import { Injectable, inject, signal } from '@angular/core';

import { type CountrySummary, MeApi } from '../../core/me-api';

/**
 * Tarjetas de país ya pedidas a la API, para no repetir la petición cada vez que el mouse
 * vuelve a pasar por el mismo país. Vive mientras vive la página de Mi mapa.
 */
@Injectable()
export class CountrySummaries {
  private readonly api = inject(MeApi);
  private readonly cache = signal<ReadonlyMap<string, CountrySummary>>(new Map());
  private readonly requested = new Set<string>();

  /** Lo que ya llegó (undefined mientras carga). Se puede leer dentro de un computed. */
  get(iso3: string): CountrySummary | undefined {
    return this.cache().get(iso3);
  }

  /** Olvida lo pedido (p. ej. al guardar un recuerdo cambian fotos y días). */
  invalidate(): void {
    this.requested.clear();
    this.cache.set(new Map());
  }

  /** Pide el resumen una sola vez. Se llama desde eventos, no desde un computed. */
  load(iso3: string): void {
    if (this.requested.has(iso3)) return;
    this.requested.add(iso3);
    this.api.country(iso3).subscribe({
      next: (summary) => this.cache.update((m) => new Map(m).set(iso3, summary)),
      // Si falla se podrá volver a intentar la próxima vez.
      error: () => this.requested.delete(iso3),
    });
  }
}
