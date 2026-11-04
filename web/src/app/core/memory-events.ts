import { Injectable, signal } from '@angular/core';

import type { LitPlaces } from './api/types';

export interface SavedMemory {
  memoryId: string;
  tripId: string;
  lit: LitPlaces;
}

/**
 * Avisa que se guardó un recuerdo: Mi mapa recarga sus datos y anima lo que se encendió.
 * Vive en la raíz porque la ventana y el mapa son componentes hermanos.
 */
@Injectable({ providedIn: 'root' })
export class MemoryEvents {
  private readonly saved = signal<SavedMemory | null>(null);
  readonly lastSaved = this.saved.asReadonly();

  notifySaved(memory: SavedMemory): void {
    this.saved.set(memory);
  }

  /** La animación ya se mostró. */
  clear(): void {
    this.saved.set(null);
  }
}
