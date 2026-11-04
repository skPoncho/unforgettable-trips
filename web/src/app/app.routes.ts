import { Routes } from '@angular/router';

import { MyMapPage } from './pages/my-map/my-map-page';
import { PlaceholderPage } from './pages/placeholder-page';
import { MAP_VIEWS } from './views';

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
  // Las demás vistas del encabezado llegan en su fase.
  ...MAP_VIEWS.filter((view) => view.path !== '').map((view) => ({
    path: view.path,
    title: `${view.label} · Huella`,
    component: PlaceholderPage,
    data: { heading: view.label, phase: view.phase },
  })),
  {
    path: 'viajes',
    title: 'Viajes · Huella',
    loadComponent: () => import('./pages/trips/trips-page').then((m) => m.TripsPage),
  },
  {
    path: 'viajes/:id',
    title: 'Viaje · Huella',
    loadComponent: () => import('./pages/trips/trip-page').then((m) => m.TripPage),
  },
  // Página de verificación de los datos geográficos (fase 1); no aparece en el encabezado.
  {
    path: 'dev/geo',
    title: 'Datos geográficos · Huella',
    loadComponent: () => import('./pages/dev-geo/dev-geo-page').then((m) => m.DevGeoPage),
  },
  { path: '**', redirectTo: '' },
];
