import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';

import { me } from '../../../testing/fixtures';
import { mockSystemTheme } from '../../../testing/match-media';
import type { City } from '../../core/api/types';
import { HomeEvents } from '../../core/home-events';
import { ThemeService } from '../../core/theme.service';
import { PlaceSearch } from '../../shared/place-search';
import { Header } from './header';

describe('Header', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    mockSystemTheme(false);
    TestBed.configureTestingModule({
      imports: [Header],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    http.verify();
  });

  async function render() {
    const fixture = TestBed.createComponent(Header);
    TestBed.tick();
    http.expectOne('/api/me').flush(me);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('muestra las cuatro vistas en orden', async () => {
    const { element } = await render();
    const labels = [...element.querySelectorAll('.views__link')].map((a) => a.textContent?.trim());
    expect(labels).toEqual(['Mundo', 'Mi país', 'Ciudades', 'Monumentos']);
    const hrefs = [...element.querySelectorAll('.views__link')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '/',
      '/mi-pais',
      '/mi-pais?pestana=ciudades',
      '/mi-pais?pestana=monumentos',
    ]);
  });

  it('marca la pestaña de Mi país que está abierta', async () => {
    const { fixture, element } = await render();
    const active = () => element.querySelector('.views__link.is-active')?.textContent?.trim();

    await TestBed.inject(Router).navigateByUrl('/mi-pais?pestana=ciudades');
    await fixture.whenStable();
    expect(active()).toBe('Ciudades');
    expect(element.querySelector('[aria-current=page]')?.textContent?.trim()).toBe('Ciudades');

    await TestBed.inject(Router).navigateByUrl('/mi-pais');
    await fixture.whenStable();
    expect(active()).toBe('Mi país');
  });

  it('"Nuevo recuerdo" abre la ventana sobre el mapa', async () => {
    const { element } = await render();
    const link = element.querySelector<HTMLAnchorElement>('.pill-button--primary')!;
    expect(link.textContent?.trim()).toBe('Nuevo recuerdo');
    expect(link.getAttribute('href')).toBe('/nuevo-recuerdo');
    expect(link.hasAttribute('aria-disabled')).toBe(false);
  });

  it('el botón de tema alterna entre oscuro y claro', async () => {
    const { fixture, element } = await render();
    const button = element.querySelector<HTMLButtonElement>('.theme-toggle')!;
    expect(button.getAttribute('aria-label')).toBe('Cambiar a tema claro');

    button.click();
    await fixture.whenStable();

    expect(TestBed.inject(ThemeService).theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(button.getAttribute('aria-label')).toBe('Cambiar a tema oscuro');
  });

  it('el menú de perfil cambia la ciudad de casa', async () => {
    const { fixture, element } = await render();
    const avatar = element.querySelector<HTMLButtonElement>('.avatar')!;
    expect(avatar.textContent?.trim()).toBe('CB');

    avatar.click();
    await fixture.whenStable();
    expect(avatar.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('.who__name')?.textContent?.trim()).toBe('Carlos Barrón');
    expect(element.querySelector('.home__city')?.textContent?.trim()).toBe('Ciudad de México');

    element.querySelector<HTMLButtonElement>('.home__change')!.click();
    await fixture.whenStable();
    const search = fixture.debugElement.query(By.directive(PlaceSearch));
    expect(element.querySelector('#home-search-input')).not.toBeNull();

    const monterrey = { id: 3995465, name_es: 'Monterrey' } as City;
    (search.componentInstance as PlaceSearch).picked.emit(monterrey);
    const request = http.expectOne('/api/me');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ home_city_id: 3995465 });
    request.flush({
      ...me,
      home_city: {
        ...me.home_city!,
        id: 3995465,
        name_es: 'Monterrey',
        subdivision_code: 'MX-NLE',
      },
    });
    await fixture.whenStable();

    expect(element.querySelector('.home__city')?.textContent?.trim()).toBe('Monterrey');
    expect(element.querySelector('.home__status')?.textContent?.trim()).toBe(
      'Tu casa ahora es Monterrey.',
    );
    expect(TestBed.inject(HomeEvents).changes()).toBe(1);
  });

  it('el menú se cierra con Escape y al hacer clic fuera', async () => {
    const { fixture, element } = await render();
    const avatar = element.querySelector<HTMLButtonElement>('.avatar')!;
    avatar.click();
    await fixture.whenStable();
    element
      .querySelector('#profile-menu')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(element.querySelector('#profile-menu')).toBeNull();
    expect(document.activeElement).toBe(avatar);

    avatar.click();
    await fixture.whenStable();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    expect(element.querySelector('#profile-menu')).toBeNull();
  });
});
