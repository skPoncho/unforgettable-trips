import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import {
  JAPAN_TRIP_ID,
  countries,
  japanSummary,
  panamaSummary,
  userMap,
  worldTopology,
} from '../../../testing/fixtures';
import { drawWorld } from '../../core/map/geo-shapes';
import { CountrySummaries } from './country-summaries';
import { WorldMap } from './world-map';

describe('WorldMap', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [WorldMap],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        CountrySummaries,
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(WorldMap);
    fixture.componentRef.setInput('drawing', drawWorld(worldTopology, countries));
    fixture.componentRef.setInput('userMap', userMap);
    await fixture.whenStable();
    // Las escalas piden su resumen al cargar, para la etiqueta del mapa.
    http.expectOne('/api/me/countries/PAN').flush(panamaSummary);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const idsIn = (el: HTMLElement, group: string) =>
    [...el.querySelectorAll(`.${group} path`)].map((p) => p.getAttribute('data-id'));

  it('pinta cada país según su estado en la API', async () => {
    const { el } = await render();
    expect(idsIn(el, 'land--visited')).toEqual(['JPN', 'MEX']);
    expect(idsIn(el, 'land--stopover')).toEqual(['PAN']);
    expect(idsIn(el, 'land--wish')).toEqual(['ARG']);
    expect(el.querySelector('[data-id="GRL"]')?.classList).toContain('country--territory');
  });

  it('dibuja ciudades como puntos de luz y monumentos solo con su capa', async () => {
    const { fixture, el } = await render();
    expect(el.querySelectorAll('.city__light')).toHaveLength(1);
    expect(el.querySelectorAll('.monument')).toHaveLength(0);

    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('.chip')].find(
        (b) => b.textContent?.trim() === label,
      )!;
    button('Monumentos').click();
    button('Ciudades').click();
    await fixture.whenStable();

    expect(el.querySelectorAll('.monument')).toHaveLength(1);
    expect(el.querySelectorAll('.city__light')).toHaveLength(0);
    expect(button('Ciudades').getAttribute('aria-pressed')).toBe('false');
  });

  it('apagar la capa de deseos o de países los deja como por descubrir', async () => {
    const { fixture, el } = await render();
    const button = (label: string) =>
      [...el.querySelectorAll<HTMLButtonElement>('.chip')].find(
        (b) => b.textContent?.trim() === label,
      )!;

    button('Lista de deseos').click();
    await fixture.whenStable();
    expect(idsIn(el, 'land--wish')).toEqual([]);

    button('Países').click();
    await fixture.whenStable();
    expect(idsIn(el, 'land--visited')).toEqual([]);
    expect(el.querySelector('.badge')).toBeNull();
  });

  it('marca la escala en el mapa con su nota', async () => {
    const { el } = await render();
    expect(el.querySelector('.badge')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'ESCALA Panamá · 3 h en Tocumen',
    );
  });

  it('la tarjeta de Japón lleva al detalle de su viaje', async () => {
    const { fixture, el } = await render();
    const japan = el.querySelector<SVGPathElement>('.land--visited [data-id="JPN"]')!;
    japan.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    expect(el.querySelector('app-country-card')?.textContent).toContain('Cargando');

    http.expectOne('/api/me/countries/JPN').flush(japanSummary);
    await fixture.whenStable();

    const card = el.querySelector('app-country-card')!;
    expect(card.querySelector('.name')?.textContent).toBe('Japón');
    expect(card.querySelector('.when')?.textContent).toBe('MAR 2025');
    expect(card.querySelector('.stats')?.textContent).toBe(
      '14 días · 6 ciudades · 4 monumentos · 84 fotos',
    );
    expect(card.querySelector('.photo__more')?.textContent).toBe('+81');
    expect(card.querySelector('a.open')?.getAttribute('href')).toBe(`/viajes/${JAPAN_TRIP_ID}`);
  });

  it('la tarjeta de una escala dice "Escala"', async () => {
    const { fixture, el } = await render();
    el.querySelector('.land--stopover [data-id="PAN"]')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await fixture.whenStable();

    const card = el.querySelector('app-country-card')!;
    expect(card.querySelector('.tag')?.textContent).toBe('Escala');
    expect(card.querySelector('.stats')?.textContent).toBe('Solo escala · 3 h en Tocumen');
  });

  it('Esc o un clic afuera cierran la tarjeta fijada', async () => {
    const { fixture, el } = await render();
    const panama = el.querySelector('.land--stopover [data-id="PAN"]')!;

    panama.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    expect(el.querySelector('app-country-card')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(el.querySelector('app-country-card')).toBeNull();

    panama.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    document.body.click();
    await fixture.whenStable();
    expect(el.querySelector('app-country-card')).toBeNull();
  });

  it('los países visitados se abren con el teclado', async () => {
    const { fixture, el } = await render();
    const japan = el.querySelector<SVGPathElement>('.land--visited [data-id="JPN"]')!;
    expect(japan.getAttribute('tabindex')).toBe('0');
    expect(japan.getAttribute('aria-label')).toBe('Japón, visitado. Ver tarjeta');
    expect(el.querySelector('[data-id="MEX"]')?.getAttribute('aria-label')).toBe(
      'México, casa. Ver tarjeta',
    );

    japan.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    http.expectOne('/api/me/countries/JPN').flush(japanSummary);
    await fixture.whenStable();
    expect(el.querySelector('app-country-card .name')?.textContent).toBe('Japón');
  });

  it('el zoom empieza alejado: se puede acercar pero no alejar', async () => {
    const { el } = await render();
    const zoomIn = el.querySelector<HTMLButtonElement>('[aria-label="Acercar"]')!;
    const zoomOut = el.querySelector<HTMLButtonElement>('[aria-label="Alejar"]')!;
    expect(zoomIn.disabled).toBe(false);
    expect(zoomOut.disabled).toBe(true);
  });

  it('anima y anuncia lo que encendió el recuerdo recién guardado', async () => {
    const { fixture, el } = await render();
    const shown = vi.fn();
    fixture.componentInstance.savedShown.subscribe(shown);
    fixture.componentRef.setInput('saved', {
      memoryId: 'm1',
      tripId: JAPAN_TRIP_ID,
      lit: { countries: ['JPN'], subdivisions: [], cities: [userMap.cities[0].id] },
    });
    await fixture.whenStable();

    expect(el.querySelector('[data-id="JPN"]')?.classList).toContain('country--lit');
    expect(el.querySelector('.city__halo--lit')).not.toBeNull();
    expect(el.querySelector('.lit')?.textContent).toContain(
      `Japón y ${userMap.cities[0].name_es} se encendieron en tu mapa`,
    );
    expect(el.querySelector('.lit__link')?.getAttribute('href')).toBe(`/viajes/${JAPAN_TRIP_ID}`);

    el.querySelector<HTMLButtonElement>('.lit__close')!.click();
    expect(shown).toHaveBeenCalledOnce();
  });

  it('sin lugares nuevos solo dice que se guardó', async () => {
    const { fixture, el } = await render();
    fixture.componentRef.setInput('saved', {
      memoryId: 'm1',
      tripId: JAPAN_TRIP_ID,
      lit: { countries: [], subdivisions: [], cities: [] },
    });
    await fixture.whenStable();
    expect(el.querySelector('.lit')?.textContent).toContain('Recuerdo guardado');
    expect(el.querySelector('.country--lit')).toBeNull();
  });
});
