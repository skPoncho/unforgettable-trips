import { Routes } from '@angular/router';

import { PlaceholderPage } from './pages/placeholder-page';
import { MAP_VIEWS } from './views';

export const routes: Routes = [
  ...MAP_VIEWS.map((view) => ({
    path: view.path,
    title: `${view.label} · Huella`,
    component: PlaceholderPage,
    data: { heading: view.label, phase: view.phase },
  })),
  // Página de verificación de los datos geográficos (fase 1); no aparece en el encabezado.
  {
    path: 'dev/geo',
    title: 'Datos geográficos · Huella',
    loadComponent: () => import('./pages/dev-geo/dev-geo-page').then((m) => m.DevGeoPage),
  },
  { path: '**', redirectTo: '' },
];
