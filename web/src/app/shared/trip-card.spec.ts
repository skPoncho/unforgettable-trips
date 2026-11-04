import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { japanTrip } from '../../testing/fixtures';
import type { Trip } from '../core/api/types';
import { TripCard } from './trip-card';

describe('TripCard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TripCard], providers: [provideRouter([])] });
  });

  async function render(trip: Trip) {
    const fixture = TestBed.createComponent(TripCard);
    fixture.componentRef.setInput('trip', trip);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: HTMLElement, selector: string) =>
    el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();

  it('muestra código, visibilidad, portada, nombre, fecha y estadísticas', async () => {
    const el = await render(japanTrip);
    expect(text(el, '.code')).toBe('JPN');
    expect(text(el, '.visibility')).toBe('Público');
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/api/photos/p1/thumb');
    expect(text(el, '.title')).toBe('Japón');
    expect(text(el, '.meta')).toBe('mar 2025 · 14 días · 84 fotos');
    expect(el.querySelector('a')?.getAttribute('href')).toBe(`/viajes/${japanTrip.id}`);
  });

  it('viaje por varios países, privado y sin portada', async () => {
    const el = await render({
      ...japanTrip,
      countries: ['ESP', 'PRT', 'FRA'],
      visibility: 'private',
      cover_photo_id: null,
    });
    expect(text(el, '.code')).toBe('ESP +2');
    expect(text(el, '.visibility')).toBe('Privado');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.cover--empty')).not.toBeNull();
  });
});
