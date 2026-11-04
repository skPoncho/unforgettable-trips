import { TestBed } from '@angular/core/testing';
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
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Mi país');

    await harness.navigateByUrl('/no-existe');
    expect(document.title).toBe('Mundo · Huella');
  });
});
