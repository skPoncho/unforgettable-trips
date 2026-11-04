import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { mockSystemTheme } from '../../../testing/match-media';
import { ThemeService } from '../../core/theme.service';
import { Header } from './header';

describe('Header', () => {
  beforeEach(() => {
    localStorage.clear();
    mockSystemTheme(false);
    TestBed.configureTestingModule({ imports: [Header], providers: [provideRouter([])] });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function render() {
    const fixture = TestBed.createComponent(Header);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('muestra las cuatro vistas en orden', async () => {
    const { element } = await render();
    const labels = [...element.querySelectorAll('.views__link')].map((a) => a.textContent?.trim());
    expect(labels).toEqual(['Mundo', 'Mi país', 'Ciudades', 'Monumentos']);
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
});
