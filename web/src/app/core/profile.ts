import { httpResource } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { tap } from 'rxjs';

import type { Me } from './api/types';
import { HomeEvents } from './home-events';
import { MeApi } from './me-api';

/**
 * Perfil del usuario actual (menú de perfil del encabezado). Al cambiar la ciudad de casa
 * avisa con HomeEvents, que es lo que miran las pantallas para recargar.
 */
@Injectable({ providedIn: 'root' })
export class Profile {
  private readonly api = inject(MeApi);
  private readonly homeEvents = inject(HomeEvents);

  readonly me = httpResource<Me>(() => '/api/me');

  /** "Carlos Barrón" → "CB". Vacío mientras carga. */
  readonly initials = computed(() => {
    const name = this.me.hasValue() ? this.me.value().display_name : '';
    const words = name.split(/\s+/).filter(Boolean);
    return words
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  });

  setHome(cityId: number | null) {
    return this.api.update({ home_city_id: cityId }).pipe(
      tap((me) => {
        this.me.set(me);
        this.homeEvents.notifyChanged();
      }),
    );
  }
}
