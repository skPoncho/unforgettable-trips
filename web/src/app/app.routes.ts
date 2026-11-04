import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';

import { MyMapPage } from './pages/my-map/my-map-page';

/** Ciudades y Monumentos son pestañas de Mi país; las rutas viejas llevan ahí. */
function countryTab(pestana: string) {
  return () => inject(Router).createUrlTree(['/mi-pais'], { queryParams: { pestana } });
}

export const routes: Routes = [
  // Mundo: pantalla 1 (fase 3). "Nuevo recuerdo" (pantalla 4) se abre encima, sin desmontar
  // el mapa.
  {
    path: '',
    title: 'Mi mapa · Huella',
    component: MyMapPage,
    children: [
      {
        path: 'nuevo-recuerdo',
        title: 'Nuevo recuerdo · Huella',
        loadComponent: () =>
          import('./pages/new-memory/new-memory-dialog').then((m) => m.NewMemoryDialog),
      },
    ],
  },
  // Mi país: pantalla 3 (fase 6), con las pestañas Estados, Ciudades y Monumentos.
  {
    path: 'mi-pais',
    title: 'Mi país · Huella',
    loadComponent: () => import('./pages/my-country/my-country-page').then((m) => m.MyCountryPage),
  },
  { path: 'ciudades', redirectTo: countryTab('ciudades') },
  { path: 'monumentos', redirectTo: countryTab('monumentos') },
  {
    path: 'viajes',
    title: 'Viajes · Huella',
    loadComponent: () => import('./pages/trips/trips-page').then((m) => m.TripsPage),
  },
  {
    path: 'viajes/:id',
    title: 'Viaje · Huella',
    loadComponent: () => import('./pages/trip/trip-page').then((m) => m.TripPage),
  },
  // Página de verificación de los datos geográficos (fase 1); no aparece en el encabezado.
  {
    path: 'dev/geo',
    title: 'Datos geográficos · Huella',
    loadComponent: () => import('./pages/dev-geo/dev-geo-page').then((m) => m.DevGeoPage),
  },
  { path: '**', redirectTo: '' },
];
