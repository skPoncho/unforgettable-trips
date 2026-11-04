import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import {
  JAPAN_TRIP_ID,
  japanTrip,
  kyotoMemory,
  kyotoPhoto,
  kyotoSuggestion,
  worldTopology,
} from '../../../testing/fixtures';
import type { MemorySuggestion } from '../../core/api/types';
import { MemoryEvents } from '../../core/memory-events';
import { NewMemoryDialog } from './new-memory-dialog';

describe('NewMemoryDialog', () => {
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // jsdom no trae object URLs (vistas previas locales).
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    TestBed.configureTestingModule({
      imports: [NewMemoryDialog],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  function render() {
    const fixture = TestBed.createComponent(NewMemoryDialog);
    TestBed.tick();
    http.expectOne('/api/trips').flush([japanTrip]);
    const el = fixture.nativeElement as HTMLElement;
    const text = (selector: string) => el.querySelector(selector)?.textContent?.trim() ?? '';
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes(label),
      )!;
    return { fixture, el, component: fixture.componentInstance, text, button };
  }

  /** Suelta kioto_gps.jpg y responde la subida y la sugerencia. */
  async function dropKyoto(
    view: ReturnType<typeof render>,
    suggestion: MemorySuggestion = kyotoSuggestion,
  ) {
    view.component.addFiles([new File(['x'], 'kioto_gps.jpg', { type: 'image/jpeg' })]);
    const upload = http.expectOne((r) => r.url === '/api/photos' && r.method === 'POST');
    expect((upload.request.body as FormData).getAll('files')).toHaveLength(1);
    upload.flush({ photos: [kyotoPhoto], errors: [] });
    TestBed.tick();
    const suggest = http.expectOne('/api/memories/suggest');
    expect(suggest.request.body).toEqual({
      photo_ids: ['ph-kioto'],
      location: null,
      arrived_on: null,
      departed_on: null,
    });
    suggest.flush(suggestion);
    if (suggestion.place) await flushMinimap();
    await view.fixture.whenStable();
  }

  /**
   * El minimapa pide el mundo en cuanto hay lugar. Se responde antes de whenStable(), que
   * si no esperaría esa petición para siempre.
   */
  async function flushMinimap() {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r));
      TestBed.tick();
      const pending = http.match('/geo/world.topo.json');
      if (pending.length) {
        pending.forEach((r) => r.flush(worldTopology));
        return;
      }
    }
    throw new Error('El minimapa no pidió el mundo');
  }

  it('sugiere lugar, fecha, viaje y monumento desde las fotos', async () => {
    const view = render();
    await dropKyoto(view);

    expect(view.text('.place__kicker')).toBe('DETECTADO EN TUS FOTOS');
    expect(view.text('.place__name')).toBe('Kioto, Japón');
    expect(view.text('.meta')).toContain('1 foto · 1 con ubicación');
    expect(view.text('.meta .mono')).toBe('13 mar 2025');
    expect(view.el.querySelector('app-place-minimap svg')).not.toBeNull();
    expect(view.el.querySelector('.tile--cover .tile__gps')).not.toBeNull();
    const select = view.el.querySelector<HTMLSelectElement>('.chip__select')!;
    expect(select.selectedOptions[0].textContent?.trim()).toBe('Viaje: Japón 2025');
    expect(view.button('Monumento sugerido').textContent).toContain('Fushimi Inari-taisha');
    expect(view.text('.foot .small')).toBe(
      'Se encenderán Kioto y Japón en tu mapa (si aún no lo estaban).',
    );
  });

  it('guarda en el viaje sugerido, avisa al mapa y vuelve a Mi mapa', async () => {
    const view = render();
    await dropKyoto(view);
    view.button('Monumento sugerido').click();
    const body = view.el.querySelector<HTMLTextAreaElement>('#memory-body')!;
    body.value = 'Toriis al amanecer ';
    body.dispatchEvent(new Event('input'));
    await view.fixture.whenStable();

    view.button('Guardar y encender').click();
    const save = http.expectOne((r) => r.url === '/api/memories' && r.method === 'POST');
    expect(save.request.body).toEqual({
      place: {
        place_name: 'Kioto',
        location: { lon: 135.77, lat: 35.01 },
        visit_type: 'stay',
        arrived_on: '2025-03-13',
        departed_on: '2025-03-13',
        city_id: 1857910,
      },
      trip_id: JAPAN_TRIP_ID,
      monument_id: 7,
      body: 'Toriis al amanecer',
      photo_ids: ['ph-kioto'],
      // Igual a la del viaje: hereda.
      visibility: null,
    });
    save.flush({ ...kyotoMemory, lit: { countries: ['ISL'], subdivisions: [], cities: [] } });

    expect(TestBed.inject(MemoryEvents).lastSaved()).toEqual({
      memoryId: 'm-kioto',
      tripId: JAPAN_TRIP_ID,
      lit: { countries: ['ISL'], subdivisions: [], cities: [] },
    });
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('la visibilidad solo ofrece lo que permite el viaje', async () => {
    const view = render();
    await dropKyoto(view);

    const segments = () =>
      [...view.el.querySelectorAll('.segment')].map((s) => s.textContent?.trim());
    // Japón 2025 es "Con enlace": no se puede elegir Público.
    expect(segments()).toEqual(['Privado', 'Con enlace']);
    expect(view.text('.segment--on')).toBe('Con enlace');

    // En un viaje automático se puede cualquiera.
    const select = view.el.querySelector<HTMLSelectElement>('.chip__select')!;
    select.value = 'auto';
    select.dispatchEvent(new Event('change'));
    await view.fixture.whenStable();
    expect(segments()).toEqual(['Privado', 'Con enlace', 'Público']);
    expect(select.selectedOptions[0].textContent?.trim()).toBe('Viaje nuevo: Kioto · mar 2025');
  });

  it('una escala no manda ciudad y cambia la nota', async () => {
    const view = render();
    await dropKyoto(view, { ...kyotoSuggestion, trips: [] });
    view.button('Escala').click();
    view.button('Privado').click();
    await view.fixture.whenStable();
    expect(view.text('.foot .small')).toContain('Las escalas también encienden el país');

    view.button('Guardar y encender').click();
    const save = http.expectOne('/api/memories');
    expect(save.request.body.place.visit_type).toBe('stopover');
    expect(save.request.body.place).not.toHaveProperty('city_id');
    expect(save.request.body.trip_id).toBeNull();
    // Viaje automático: la visibilidad elegida es la del viaje.
    expect(save.request.body.visibility).toBe('private');
    save.flush(kyotoMemory);
  });

  it('muestra los archivos rechazados y las fotos que ya están en otro recuerdo', async () => {
    const view = render();
    view.component.addFiles([
      new File(['x'], 'notas.txt', { type: 'text/plain' }),
      new File(['y'], 'vieja.jpg', { type: 'image/jpeg' }),
    ]);
    const [bad, old] = http.match((r) => r.url === '/api/photos');
    bad.flush({
      photos: [],
      errors: [{ filename: 'notas.txt', detail: 'El archivo no es una imagen válida' }],
    });
    old.flush({ photos: [{ ...kyotoPhoto, duplicate: true, memory_id: 'otro' }], errors: [] });
    await view.fixture.whenStable();

    const errors = [...view.el.querySelectorAll('.tile__overlay--error')].map((e) =>
      e.textContent?.trim(),
    );
    expect(errors).toEqual([
      'notas.txt: El archivo no es una imagen válida',
      'vieja.jpg: Ya está en otro recuerdo',
    ]);
    // Sin fotos válidas ni lugar no hay nada que sugerir ni guardar.
    http.expectNone('/api/memories/suggest');
    expect(view.button('Guardar y encender').getAttribute('aria-disabled')).toBe('true');
  });

  it('elegir otra ciudad vuelve a pedir sugerencias para ese lugar', async () => {
    const view = render();
    await dropKyoto(view);
    view.button('Cambiar lugar').click();
    await view.fixture.whenStable();

    const input = view.el.querySelector<HTMLInputElement>('#place-search-input')!;
    input.value = 'Nara';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 300));
    http
      .expectOne((r) => r.url === '/api/geo/cities' && r.params.get('q') === 'Nara')
      .flush([
        {
          id: 1855612,
          name_es: 'Nara',
          name: 'Nara',
          country_iso3: 'JPN',
          country_name_es: 'Japón',
          subdivision_code: null,
          population: 360000,
          location: { lon: 135.8048, lat: 34.6851 },
        },
      ]);
    await view.fixture.whenStable();
    (view.el.querySelector('.option') as HTMLElement).click();
    TestBed.tick();

    const again = http.expectOne('/api/memories/suggest');
    expect(again.request.body.location).toEqual({ lon: 135.8048, lat: 34.6851 });
    again.flush({ ...kyotoSuggestion, monuments: [] });
    await view.fixture.whenStable();
    expect(view.text('.place__kicker')).toBe('LUGAR ELEGIDO');
    expect(view.text('.place__name')).toBe('Nara, Japón');
  });

  it('cancelar borra las fotos subidas y cierra', async () => {
    const view = render();
    await dropKyoto(view);
    view.button('Cancelar').click();

    const removed = http.expectOne((r) => r.method === 'DELETE');
    expect(removed.request.url).toBe('/api/photos/ph-kioto');
    removed.flush(null);
    expect(navigate).toHaveBeenCalledWith(['/']);
  });
});
