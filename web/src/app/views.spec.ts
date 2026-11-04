import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { activeView, countryTab } from './views';

describe('views', () => {
  const label = (url: string) => {
    const router = TestBed.inject(Router);
    return activeView(router.parseUrl(url))?.label ?? null;
  };

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  it('Ciudades y Monumentos son pestañas de Mi país', () => {
    expect(label('/')).toBe('Mundo');
    expect(label('/nuevo-recuerdo')).toBe('Mundo');
    expect(label('/mi-pais')).toBe('Mi país');
    expect(label('/mi-pais?pestana=estados&monumento=palenque')).toBe('Mi país');
    expect(label('/mi-pais?pestana=ciudades')).toBe('Ciudades');
    expect(label('/mi-pais?monumento=palenque&pestana=monumentos')).toBe('Monumentos');
    expect(label('/viajes/123')).toBeNull();
  });

  it('una pestaña desconocida abre Estados', () => {
    expect(countryTab('ciudades')).toBe('ciudades');
    expect(countryTab('playas')).toBe('estados');
    expect(countryTab(undefined)).toBe('estados');
  });
});
