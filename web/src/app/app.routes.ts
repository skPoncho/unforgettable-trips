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
  { path: '**', redirectTo: '' },
];
