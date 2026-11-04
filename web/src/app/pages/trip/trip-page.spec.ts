import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { JAPAN_TRIP_ID, japanTripDetail, worldTopology } from '../../../testing/fixtures';
import type { TripDetail } from '../../core/trips-api';
import { TripPage } from './trip-page';
import { stopoverNotices } from './trip-view';

const TRIP_URL = `/api/trips/${JAPAN_TRIP_ID}`;

describe('TripPage', () => {
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TripPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  async function render(trip: TripDetail = japanTripDetail, parada?: string) {
    const fixture = TestBed.createComponent(TripPage);
    fixture.componentRef.setInput('id', JAPAN_TRIP_ID);
    if (parada) fixture.componentRef.setInput('parada', parada);
    TestBed.tick();
    http.expectOne(TRIP_URL).flush(trip);
    http.expectOne('/geo/world.topo.json').flush(worldTopology);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const text = (selector: string) => el.querySelector(selector)?.textContent?.trim() ?? '';
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.includes(label) || b.getAttribute('aria-label') === label,
      )!;
    return { fixture, el, text, button };
  }

  it('arma la pantalla con los datos de la API', async () => {
    const { el, text } = await render();
    expect(text('.title')).toBe('Japón');
    expect(text('.eyebrow')).toBe('8–21 mar 2025 · viaje 12 de 13');
    expect(text('.crumbs')).toContain('Asia');
    expect(text('.crumbs__here')).toBe('Japón · mar 2025');
    expect(text('app-trip-map .chip')).toBe('RUTA · ≈ 725 KM');
    expect([...el.querySelectorAll('.stat')].map((s) => s.textContent?.trim())).toEqual([
      'días14',
      'ciudades6',
      'monumentos4',
      'fotos84',
    ]);
    expect(text('.notice')).toContain('Ida con escala en Aeropuerto de Tocumen, Panamá');
    expect(text('.favorite__quote')).toContain('El Fuji apareció');
    // Seis estancias en la bitácora; la escala no lleva número.
    expect(el.querySelectorAll('.log > li')).toHaveLength(6);
    expect(text('#parada-2 .entry__dates')).toBe('Día 5 · 12 mar');
  });

  it('elegir el pin 3 resalta Kioto en la lista', async () => {
    const { fixture, el, text, button } = await render();
    expect(text('.entry--on .entry__name')).toBe('Tokio'); // por omisión, la primera

    button('Parada 3: Kioto').click();
    await fixture.whenStable();

    expect(text('.entry--on .entry__name')).toBe('Kioto');
    expect(text('.pin--on')).toBe('3');
    expect(el.querySelector('#parada-3 .entry__toggle')?.getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(el.querySelectorAll('#parada-3 .photo')).toHaveLength(3);
    expect(text('#parada-3 .photo__more')).toBe('+25');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { parada: 3 }, replaceUrl: true }),
    );
  });

  it('elegir Kioto en la lista resalta el pin 3', async () => {
    const { fixture, el, text } = await render();
    el.querySelector<HTMLButtonElement>('#parada-3 .entry__toggle')!.click();
    await fixture.whenStable();
    expect(text('.pin--on')).toBe('3');
    expect(text('.label--on')).toBe('Kioto');
    expect(el.querySelector('.pin--on')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('?parada=4 abre Nara al cargar', async () => {
    const { text } = await render(japanTripDetail, '4');
    expect(text('.entry--on .entry__name')).toBe('Nara');
  });

  it('cambiar la visibilidad la guarda en la API', async () => {
    const { fixture, button, text } = await render();
    button('Con enlace').click();
    const req = http.expectOne(TRIP_URL);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ visibility: 'link' });
    req.flush({ ...japanTripDetail, visibility: 'link' });
    await fixture.whenStable();
    expect(button('Con enlace').getAttribute('aria-checked')).toBe('true');
    expect(text('.visibility-hint')).toBe('Cualquiera con el enlace puede verlo');
  });

  it('las flechas mueven la visibilidad como un grupo de radios', async () => {
    const { el } = await render();
    const checked = el.querySelector<HTMLElement>('[role=radio][aria-checked=true]')!;
    checked.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    const req = http.expectOne(TRIP_URL);
    expect(req.request.body).toEqual({ visibility: 'link' });
    req.flush({ ...japanTripDetail, visibility: 'link' });
  });

  it('marca y desmarca el momento favorito', async () => {
    const { fixture, button } = await render(japanTripDetail, '3');
    button('Marcar como favorito').click();
    const mark = http.expectOne(TRIP_URL);
    expect(mark.request.body).toEqual({ favorite_memory_id: 'memory-stop-3' });
    mark.flush({ ...japanTripDetail, favorite_memory_id: 'memory-stop-3' });
    await fixture.whenStable();

    const on = button('Momento favorito');
    expect(on.getAttribute('aria-pressed')).toBe('true');
    on.click();
    const unmark = http.expectOne(TRIP_URL);
    expect(unmark.request.body).toEqual({ favorite_memory_id: null });
    unmark.flush({ ...japanTripDetail, favorite_memory_id: null });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.favorite')).toBeNull();
  });

  it('edita el título en su lugar: Enter guarda y Esc cancela', async () => {
    const { fixture, el, button, text } = await render();
    button('Editar título').click();
    await fixture.whenStable();
    const input = el.querySelector<HTMLInputElement>('#trip-title')!;
    expect(input.value).toBe('Japón');

    input.value = 'Japón en primavera';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const req = http.expectOne(TRIP_URL);
    expect(req.request.body).toEqual({ title: 'Japón en primavera' });
    req.flush({ ...japanTripDetail, title: 'Japón en primavera' });
    await fixture.whenStable();
    expect(text('.title')).toBe('Japón en primavera');

    button('Editar título').click();
    await fixture.whenStable();
    el.querySelector('#trip-title')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(el.querySelector('#trip-title')).toBeNull();
  });

  it('borra una parada solo después de confirmar', async () => {
    const { fixture, el, button } = await render();
    button('Editar paradas').click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.edit-row')).toHaveLength(7); // también la escala

    button('Borrar la parada Kioto').click();
    await fixture.whenStable();
    const dialog = el.querySelector('app-confirm-dialog')!;
    expect(dialog.textContent).toContain('¿Borrar la parada Kioto?');
    expect(dialog.textContent).toContain('1 recuerdo y 28 fotos');

    button('Cancelar').click();
    await fixture.whenStable();
    expect(el.querySelector('app-confirm-dialog')).toBeNull();
    http.expectNone({ method: 'DELETE' });

    button('Borrar la parada Kioto').click();
    await fixture.whenStable();
    [...el.querySelectorAll<HTMLButtonElement>('app-confirm-dialog button')].at(-1)!.click();
    http.expectOne({ method: 'DELETE', url: '/api/stops/stop-3' }).flush(null);
    TestBed.tick();
    const reload = http.expectOne(TRIP_URL);
    expect(reload.request.method).toBe('GET');
    reload.flush({
      ...japanTripDetail,
      stops: japanTripDetail.stops.filter((s) => s.id !== 'stop-3'),
    });
    await fixture.whenStable();
    expect(el.querySelector('app-confirm-dialog')).toBeNull();
    expect(el.querySelectorAll('.edit-row')).toHaveLength(6);
  });

  it('reordena con las flechas y guarda el orden completo', async () => {
    const { fixture, el, button } = await render();
    button('Editar paradas').click();
    await fixture.whenStable();

    button('Bajar Aeropuerto de Tocumen').click();
    const req = http.expectOne(`${TRIP_URL}/stops/order`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.stop_ids.slice(0, 3)).toEqual(['stop-1', 'stop-0', 'stop-2']);
    // Se ve el orden nuevo sin esperar la respuesta.
    await fixture.whenStable();
    const names = [...el.querySelectorAll('.edit-row__name')].map((n) =>
      n.firstChild?.textContent?.trim(),
    );
    expect(names.slice(0, 2)).toEqual(['Tokio', 'Aeropuerto de Tocumen']);
    req.flush([]);
    TestBed.tick();
    http.expectOne(TRIP_URL).flush(japanTripDetail);
    await fixture.whenStable();
  });

  it('abre el visor de galería desde las fotos de la parada', async () => {
    const { fixture, el, button } = await render();
    button('Ver las 26 fotos de Tokio').click();
    await fixture.whenStable();
    const viewer = el.querySelector('app-photo-viewer')!;
    expect(viewer.querySelector('.count')?.textContent?.trim()).toBe('3 / 26');
    expect(viewer.querySelector('img')?.getAttribute('src')).toBe(
      '/api/photos/stop-1-photo-3/display',
    );
  });

  it('muestra un aviso si el viaje no existe', async () => {
    const fixture = TestBed.createComponent(TripPage);
    fixture.componentRef.setInput('id', 'nope');
    TestBed.tick();
    http
      .expectOne('/api/trips/nope')
      .flush({ detail: 'Viaje no encontrado' }, { status: 404, statusText: 'Not Found' });
    http.expectOne('/geo/world.topo.json').flush(worldTopology);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Viaje no encontrado');
  });
});

describe('stopoverNotices', () => {
  it('distingue ida, regreso y escalas a la mitad', () => {
    const [tocumen, ...stays] = japanTripDetail.stops;
    const back = { ...tocumen, id: 'back', position: 99, note: null };
    expect(stopoverNotices({ ...japanTripDetail, stops: [tocumen, ...stays, back] })).toEqual([
      'Ida con escala en Aeropuerto de Tocumen, Panamá (3 h en Tocumen): ya cuenta como país visitado.',
      'Regreso con escala en Aeropuerto de Tocumen, Panamá: ya cuenta como país visitado.',
    ]);
  });
});
