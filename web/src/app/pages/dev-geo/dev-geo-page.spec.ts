import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { Topology } from 'topojson-specification';

import type { Country, Subdivision } from '../../core/geo-api';
import type { Progress, UserMap } from '../../core/me-api';
import { DevGeoPage } from './dev-geo-page';

// Cuadrados en sentido horario (convención de d3-geo para polígonos pequeños).
const square = (x: number, y: number) => [
  [x, y],
  [x, y + 5],
  [x + 5, y + 5],
  [x + 5, y],
  [x, y],
];

const worldTopology: Topology = {
  type: 'Topology',
  arcs: [square(135, 33), square(-105, 20), square(-50, 70)],
  objects: {
    countries: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', id: 'JPN', arcs: [[0]] },
        { type: 'Polygon', id: 'MEX', arcs: [[1]] },
        { type: 'Polygon', id: 'GRL', arcs: [[2]] },
      ],
    },
  },
};

const mexicoTopology: Topology = {
  type: 'Topology',
  arcs: [square(-100, 19), square(-90, 20)],
  objects: {
    states: {
      type: 'GeometryCollection',
      geometries: [
        { type: 'Polygon', id: 'MX-CMX', arcs: [[0]] },
        { type: 'Polygon', id: 'MX-YUC', arcs: [[1]] },
      ],
    },
  },
};

const country = (iso3: string, name_es: string, counts = true, lon = 0, lat = 0): Country => ({
  iso3,
  iso2: iso3.slice(0, 2),
  name_es,
  continent: 'asia',
  counts_in_progress: counts,
  sovereign_iso3: counts ? null : 'DNK',
  label_point: { lon, lat },
});

const countries: Country[] = [
  country('JPN', 'Japón'),
  country('MEX', 'México'),
  country('GRL', 'Groenlandia', false),
  country('TUV', 'Tuvalu', true, 179.2, -8.5),
];

const states: Subdivision[] = [
  { code: 'MX-CMX', name_es: 'Ciudad de México', country_iso3: 'MEX' },
  { code: 'MX-YUC', name_es: 'Yucatán', country_iso3: 'MEX' },
];

const progress: Progress = {
  countries: { visited: 2, total: 195, stopover_only: 1 },
  continents: [
    { continent: 'america', visited: 1, total: 35 },
    { continent: 'europe', visited: 0, total: 44 },
    { continent: 'asia', visited: 1, total: 48 },
    { continent: 'africa', visited: 0, total: 54 },
    { continent: 'oceania', visited: 0, total: 14 },
  ],
  subdivisions: { country_iso3: 'MEX', visited: 1, total: 32 },
  cities: 3,
  monuments: 1,
  trips: 2,
  photos: 10,
  wishlist: 1,
};

const userMap: UserMap = {
  countries: [
    {
      iso3: 'MEX',
      status: 'visited',
      first_visited_on: null,
      is_home: true,
      counts_in_progress: true,
    },
    {
      iso3: 'JPN',
      status: 'stopover',
      first_visited_on: '2025-03-08',
      is_home: false,
      counts_in_progress: true,
    },
  ],
  subdivisions: [{ code: 'MX-CMX', status: 'visited', first_visited_on: null, is_home: true }],
  wishlist: ['TUV'],
};

describe('DevGeoPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DevGeoPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  async function render(fail = false, userFails = false) {
    const fixture = TestBed.createComponent(DevGeoPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    if (userFails) {
      http
        .expectOne('/api/me/progress')
        .flush({ detail: 'Corre make seed.' }, { status: 503, statusText: 'Error' });
    } else {
      http.expectOne('/api/me/progress').flush(progress);
      http.expectOne('/api/me/map').flush(userMap);
    }
    if (fail) {
      http
        .expectOne((r) => r.url === '/api/geo/countries')
        .flush('', {
          status: 500,
          statusText: 'Error',
        });
    } else {
      http
        .expectOne((r) => r.url === '/api/geo/countries' && r.params.get('all') === 'true')
        .flush(countries);
      http
        .expectOne((r) => r.url === '/api/geo/subdivisions' && r.params.get('country') === 'MEX')
        .flush(states);
      http.expectOne('/geo/world.topo.json').flush(worldTopology);
      http.expectOne('/geo/mexico.topo.json').flush(mexicoTopology);
    }
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('dibuja el mundo, los países sin polígono como punto y México por estados', async () => {
    const { element } = await render();
    const ids = (selector: string) =>
      [...element.querySelectorAll(selector)].map((el) => el.getAttribute('data-id'));

    expect(ids('svg[aria-label="Mapa del mundo"] path.map__land')).toEqual(['JPN', 'MEX', 'GRL']);
    expect(ids('circle.map__dot')).toEqual(['TUV']);
    expect(ids('svg[aria-label="Mapa de México por estados"] path')).toEqual(['MX-CMX', 'MX-YUC']);
    expect(element.querySelector('.dev-geo__summary')?.textContent).toContain(
      '3 países que suman · 1 territorios que no suman · 2 estados de México',
    );
  });

  it('marca los territorios que no suman', async () => {
    const { element } = await render();
    expect(element.querySelector('[data-id="GRL"]')?.classList).toContain('map__land--territory');
    expect(element.querySelector('[data-id="JPN"]')?.classList).not.toContain(
      'map__land--territory',
    );
  });

  it('al pasar el mouse muestra el nombre en español', async () => {
    const { fixture, element } = await render();

    element.querySelector('[data-id="JPN"]')!.dispatchEvent(new Event('pointerenter'));
    await fixture.whenStable();
    expect(element.querySelector('.tooltip strong')?.textContent?.trim()).toBe('Japón');

    element.querySelector('[data-id="GRL"]')!.dispatchEvent(new Event('pointerenter'));
    await fixture.whenStable();
    expect(element.querySelector('.tooltip')?.textContent).toContain('Groenlandia');
    expect(element.querySelector('.tooltip')?.textContent).toContain('no suma al progreso');

    element.querySelector('[data-id="MX-YUC"]')!.dispatchEvent(new Event('pointerenter'));
    await fixture.whenStable();
    expect(element.querySelector('.tooltip')?.textContent?.trim()).toBe('Yucatán');
  });

  it('pinta visitados, escalas y deseos con lo que da la API', async () => {
    const { element } = await render();
    const classes = (id: string) => element.querySelector(`[data-id="${id}"]`)?.classList;

    expect(classes('MEX')).toContain('map__land--visited');
    expect(classes('JPN')).toContain('map__land--stopover');
    expect(classes('TUV')).toContain('map__dot--wish');
    expect(classes('GRL')?.contains('map__land--visited')).toBe(false);
    expect(classes('MX-CMX')).toContain('map__land--visited');
    expect(classes('MX-YUC')?.contains('map__land--visited')).toBe(false);
  });

  it('muestra el progreso del usuario', async () => {
    const { element } = await render();
    const text = element.querySelector('.progress')?.textContent?.replace(/\s+/g, ' ');
    expect(text).toContain('2 de 195 países');
    expect(text).toContain('(1 solo escala)');
    expect(text).toContain('América 1/35');
    expect(text).toContain('Estados 1/32');
  });

  it('el tooltip dice si es escala, casa o deseo', async () => {
    const { fixture, element } = await render();
    const tooltipFor = async (id: string) => {
      element.querySelector(`[data-id="${id}"]`)!.dispatchEvent(new Event('pointerenter'));
      await fixture.whenStable();
      return element.querySelector('.tooltip')?.textContent;
    };

    expect(await tooltipFor('JPN')).toContain('Escala · 2025');
    expect(await tooltipFor('MEX')).toContain('Visitado · Casa');
    expect(await tooltipFor('TUV')).toContain('Lista de deseos');
  });

  it('sin usuario semilla dibuja los mapas sin pintar y pide make seed', async () => {
    const { element } = await render(false, true);
    expect(element.querySelector('[role="status"]')?.textContent).toContain('make seed');
    expect(
      element.querySelectorAll('svg[aria-label="Mapa del mundo"] path.map__land'),
    ).toHaveLength(3);
    expect(element.querySelector('.map__land--visited')).toBeNull();
  });

  it('avisa si la API no responde', async () => {
    const { element } = await render(true);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('make load-geo');
  });
});
