import { Injectable, signal } from '@angular/core';

/**
 * Avisa que cambió la ciudad de casa (menú de perfil). La casa cuenta como visitada, así que
 * Mi mapa y Mi país recargan progreso y mapas. No hace peticiones por sí mismo.
 */
@Injectable({ providedIn: 'root' })
export class HomeEvents {
  private readonly count = signal(0);
  /** Sube cada vez que se guarda una nueva ciudad de casa (0 = sin cambios). */
  readonly changes = this.count.asReadonly();

  notifyChanged(): void {
    this.count.update((n) => n + 1);
  }
}
