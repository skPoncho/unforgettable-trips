import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import { App } from './app';
import { appConfig } from './app.config';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: appConfig.providers,
    });
  });

  it('muestra el encabezado', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-header')).not.toBeNull();
  });

  it('cada vista tiene su ruta con título', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/mi-pais');
    expect(document.title).toBe('Mi país · Huella');
    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('app-my-country-page');

    // Ciudades y Monumentos son pestañas de Mi país.
    await harness.navigateByUrl('/ciudades');
    expect(TestBed.inject(Router).url).toBe('/mi-pais?pestana=ciudades');
    await harness.navigateByUrl('/monumentos');
    expect(TestBed.inject(Router).url).toBe('/mi-pais?pestana=monumentos');

    // Una ruta desconocida lleva a Mundo, que es la pantalla Mi mapa.
    await harness.navigateByUrl('/no-existe');
    expect(document.title).toBe('Mi mapa · Huella');
  });
});
