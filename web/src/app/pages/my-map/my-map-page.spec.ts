import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import {
  countries,
  japanTrip,
  panamaSummary,
  progress,
  userMap,
  worldTopology,
} from '../../../testing/fixtures';
import { MyMapPage } from './my-map-page';

describe('MyMapPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MyMapPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function render() {
    const fixture = TestBed.createComponent(MyMapPage);
    // Dispara las peticiones; whenStable() esperaría a que respondan.
    TestBed.tick();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function flushAll(overrides: { progress?: () => void } = {}) {
    http
      .expectOne((r) => r.url === '/api/geo/countries' && r.params.get('all') === 'true')
      .flush(countries);
    http.expectOne('/geo/world.topo.json').flush(worldTopology);
    if (overrides.progress) overrides.progress();
    else http.expectOne('/api/me/progress').flush(progress);
    http.expectOne('/api/me/map').flush(userMap);
    http.expectOne('/api/trips').flush([japanTrip]);
  }

  it('carga todo de la API y arma la pantalla', async () => {
    const { fixture, el } = render();
    expect(el.textContent).toContain('Cargando tu mapa');

    flushAll();
    await fixture.whenStable();
    http.expectOne('/api/me/countries/PAN').flush(panamaSummary);
    await fixture.whenStable();

    expect(el.querySelector('app-progress-panel .headline__figure')?.textContent).toBe('3');
    expect(el.querySelector('app-world-map svg')).not.toBeNull();
    expect(el.querySelectorAll('app-trip-card')).toHaveLength(1);
    expect(el.querySelector('.trips__all')?.textContent?.trim()).toBe('Ver el viaje');
  });

  it('si falta el usuario semilla (503) lo explica', async () => {
    const { fixture, el } = render();
    flushAll({
      progress: () =>
        http
          .expectOne('/api/me/progress')
          .flush('Corre make seed', { status: 503, statusText: 'Service Unavailable' }),
    });
    await fixture.whenStable();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('make seed');
  });
});
