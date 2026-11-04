/** Vistas principales del encabezado. Cada una se vuelve una pantalla real en su fase. */
export interface MapView {
  path: string;
  label: string;
  /** Fase de docs/PLAN.md en la que se construye. */
  phase: number;
}

export const MAP_VIEWS: readonly MapView[] = [
  { path: '', label: 'Mundo', phase: 3 },
  { path: 'mi-pais', label: 'Mi país', phase: 6 },
  { path: 'ciudades', label: 'Ciudades', phase: 6 },
  { path: 'monumentos', label: 'Monumentos', phase: 6 },
];
