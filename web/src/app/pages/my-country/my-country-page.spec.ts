import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import {
  OAXACA_TRIP_ID,
  mexicoCities,
  mexicoPassport,
  mexicoStates,
  mexicoTopology,
} from '../../../testing/fixtures';
import { HomeEvents } from '../../core/home-events';
import { MyCountryPage } from './my-country-page';

const ME = '/api/me';

describe('MyCountryPage', () => {
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MyCountryPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => http.verify());

  function flushData() {
    http.expectOne('/geo/mexico.topo.json').flush(mexicoTopology);
    http.expectOne(`${ME}/subdivisions?country=MEX`).flush(mexicoStates);
    http.expectOne(`${ME}/cities?country=MEX`).flush(mexicoCities);
    http.expectOne(`${ME}/passport?country=MEX`).flush(mexicoPassport);
  }

  async function render(inputs: { pestana?: string; monumento?: string } = {}) {
    const fixture = TestBed.createComponent(MyCountryPage);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    TestBed.tick();
    flushData();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const text = (selector: string) =>
      el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    // Textos de cada elemento, con un espacio entre sus partes ("TEO 2019").
    const all = (selector: string) =>
      [...el.querySelectorAll<HTMLElement>(selector)].map((e) => {
        const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        const parts: string[] = [];
        while (walker.nextNode()) {
          const part = walker.currentNode.textContent?.trim();
          if (part) parts.push(part);
        }
        return parts.join(' ');
      });
    return { fixture, el, text, all };
  }

  it('muestra el progreso por estados con los datos de la API', async () => {
    const { el, text } = await render();
    expect(text('.title')).toBe('México');
    expect(text('.progress__count')).toBe('2');
    expect(text('.progress__of')).toBe('de 3 estados · 66%');
    expect([...el.querySelectorAll('.segment')].map((s) => s.className)).toEqual([
      'segment segment--visited',
      'segment segment--visited',
      'segment segment--off',
    ]);
    expect(el.querySelector('.segments')?.getAttribute('aria-label')).toBe(
      '2 de 3 estados visitados',
    );
  });

  it('pinta los estados visitados y un pin por sello', async () => {
    const { el } = await render();
    expect(el.querySelectorAll('.states--lit .state')).toHaveLength(2);
    expect(el.querySelectorAll('.pin')).toHaveLength(2);
    expect(el.querySelector('svg.svg')?.getAttribute('aria-label')).toBe(
      'Mapa de México con 2 estados visitados y 2 monumentos sellados',
    );
  });

  it('sin monumento en la URL, la tarjeta muestra el sello más reciente', async () => {
    const { el, text } = await render();
    expect(text('.card__name')).toBe('Monte Albán');
    expect(text('.card__where')).toBe('Oaxaca · Oaxaca y Chiapas');
    expect(text('.card__year')).toBe('2024');
    expect(el.querySelectorAll('.card .photo')).toHaveLength(3);
    expect(text('.photo__more')).toBe('+21');
    expect(el.querySelector('.card__link')?.getAttribute('href')).toBe(
      `/viajes/${OAXACA_TRIP_ID}?parada=2`,
    );
    expect(el.querySelector('.pin--active')?.getAttribute('aria-label')).toBe('Monte Albán');
  });

  it('elegir un pin guarda el monumento en la URL', async () => {
    const { el, text, fixture } = await render({ monumento: 'teotihuacan' });
    expect(text('.card__name')).toBe('Teotihuacán');
    expect(text('.card__note')).toBe('1 recuerdo sin fotos');

    el.querySelector<HTMLButtonElement>('.pin[aria-label="Monte Albán"]')!.click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { monumento: 'monte-alban' }, replaceUrl: true }),
    );
  });

  it('pestaña Estados: visitados y por descubrir', async () => {
    const { all, el } = await render();
    expect(el.querySelector('[role=tab][aria-selected=true]')?.textContent?.trim()).toBe('Estados');
    expect(all('.group')).toEqual(['VISITADOS · 2', 'POR DESCUBRIR · 1']);
    expect(all('.chip--on')).toEqual(['Ciudad de México (casa)', 'Oaxaca']);
    expect(all('.chip:not(.chip--on)')).toEqual(['Yucatán']);
  });

  it('pestaña Ciudades: la casa y el número de viajes', async () => {
    const { all } = await render({ pestana: 'ciudades' });
    expect(all('.row')).toEqual([
      'Ciudad de México Ciudad de México CASA',
      'Oaxaca de Juárez Oaxaca 2 VIAJES',
    ]);
  });

  it('pestaña Monumentos: la fila elegida va resaltada', async () => {
    const { el, all } = await render({ pestana: 'monumentos' });
    expect(all('.row')).toEqual(['Teotihuacán Estado de México 2019', 'Monte Albán Oaxaca 2024']);
    expect(el.querySelector('.row--active')?.textContent).toContain('Monte Albán');
  });

  it('las flechas cambian de pestaña', async () => {
    const { el, fixture } = await render();
    const estados = el.querySelector<HTMLButtonElement>('#tab-estados')!;
    estados.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { pestana: 'ciudades' } }),
    );

    el.querySelector<HTMLButtonElement>('#tab-monumentos')!.click();
    el.querySelector<HTMLButtonElement>('#tab-estados')!.click();
    expect(navigate).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { pestana: null } }),
    );
  });

  it('pasaporte: sellos con su año y sugeridos punteados', async () => {
    const { el, text, all } = await render();
    expect(text('.tally')).toBe('2 SELLOS · 1 SUGERIDO');
    expect(all('.seal')).toEqual(['TEO 2019', 'MA 2024', 'TPZ SUGERIDO']);
    const suggested = el.querySelector('.stamp--suggested')!;
    expect(suggested.textContent).toContain('Teopanzolco');
    expect(suggested.querySelector('.stamp__body')?.getAttribute('title')).toBe(
      'Sugerido: a 0.7 km de Cuernavaca',
    );
    // Los sugeridos no son botones; los sellos sí, y llevan al mapa.
    expect(suggested.querySelector('button')).toBeNull();
    el.querySelector<HTMLButtonElement>('.stamp:not(.stamp--suggested) button')!.click();
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { monumento: 'teotihuacan' } }),
    );
  });

  it('al cambiar la ciudad de casa vuelve a pedir estados, ciudades y pasaporte', async () => {
    const { fixture } = await render();
    TestBed.inject(HomeEvents).notifyChanged();
    TestBed.tick();
    http.expectOne(`${ME}/subdivisions?country=MEX`).flush(mexicoStates);
    http.expectOne(`${ME}/cities?country=MEX`).flush(mexicoCities);
    http.expectOne(`${ME}/passport?country=MEX`).flush(mexicoPassport);
    await fixture.whenStable();
  });

  it('avisa si la API no responde', async () => {
    const fixture = TestBed.createComponent(MyCountryPage);
    TestBed.tick();
    http.expectOne('/geo/mexico.topo.json').flush(mexicoTopology);
    http
      .expectOne(`${ME}/subdivisions?country=MEX`)
      .flush('sin semillas', { status: 503, statusText: 'Service Unavailable' });
    http.expectOne(`${ME}/cities?country=MEX`).flush(mexicoCities);
    http.expectOne(`${ME}/passport?country=MEX`).flush(mexicoPassport);
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role=alert]')?.textContent,
    ).toContain('No se pudo cargar tu país');
  });
});
