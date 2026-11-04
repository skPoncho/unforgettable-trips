import { TestBed } from '@angular/core/testing';

import { mockSystemTheme } from '../../testing/match-media';
import { THEME_STORAGE_KEY, ThemeService } from './theme.service';

function createService(): ThemeService {
  const service = TestBed.inject(ThemeService);
  TestBed.tick();
  return service;
}

const htmlTheme = () => document.documentElement.getAttribute('data-theme');

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sigue al sistema cuando no hay preferencia guardada', () => {
    const system = mockSystemTheme(true);
    const service = createService();

    expect(service.preference()).toBe('system');
    expect(service.theme()).toBe('light');
    expect(htmlTheme()).toBe('light');

    system.change(false);
    TestBed.tick();
    expect(service.theme()).toBe('dark');
    expect(htmlTheme()).toBe('dark');
  });

  it('usa oscuro si el sistema no prefiere claro', () => {
    mockSystemTheme(false);
    expect(createService().theme()).toBe('dark');
  });

  it('al alternar fija el tema y deja de seguir al sistema', () => {
    const system = mockSystemTheme(false);
    const service = createService();

    service.toggle();
    TestBed.tick();
    expect(service.preference()).toBe('light');
    expect(htmlTheme()).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    system.change(false);
    TestBed.tick();
    expect(service.theme()).toBe('light');
  });

  it('recupera la preferencia guardada al recargar', () => {
    mockSystemTheme(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');

    const service = createService();
    expect(service.preference()).toBe('dark');
    expect(htmlTheme()).toBe('dark');
  });

  it('volver a "system" borra la preferencia guardada', () => {
    mockSystemTheme(true);
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const service = createService();

    service.setPreference('system');
    TestBed.tick();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(service.theme()).toBe('light');
  });

  it('ignora valores inválidos en el almacenamiento', () => {
    mockSystemTheme(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(createService().preference()).toBe('system');
  });
});
