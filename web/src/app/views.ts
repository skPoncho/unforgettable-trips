import type { UrlTree } from '@angular/router';

/** Pestañas de Mi país (`/mi-pais?pestana=…`). Estados es la de entrada y no va en la URL. */
export const COUNTRY_TABS = ['estados', 'ciudades', 'monumentos'] as const;
export type CountryTab = (typeof COUNTRY_TABS)[number];

export function countryTab(value: string | null | undefined): CountryTab {
  return COUNTRY_TABS.find((tab) => tab === value) ?? 'estados';
}

/** Vistas principales del encabezado. Ciudades y Monumentos son pestañas de Mi país. */
export interface MapView {
  path: string;
  label: string;
  tab?: Exclude<CountryTab, 'estados'>;
}

export const MAP_VIEWS: readonly MapView[] = [
  { path: '', label: 'Mundo' },
  { path: 'mi-pais', label: 'Mi país' },
  { path: 'mi-pais', label: 'Ciudades', tab: 'ciudades' },
  { path: 'mi-pais', label: 'Monumentos', tab: 'monumentos' },
];

/** La vista del encabezado que corresponde a la URL (null fuera de ellas, p. ej. un viaje). */
export function activeView(url: UrlTree): MapView | null {
  const path = url.root.children['primary']?.segments.map((s) => s.path).join('/') ?? '';
  if (path === 'mi-pais') {
    const tab = countryTab(url.queryParamMap.get('pestana'));
    return MAP_VIEWS.find((v) => v.path === path && (v.tab ?? 'estados') === tab) ?? null;
  }
  // Nuevo recuerdo se abre sobre Mundo.
  if (path === '' || path === 'nuevo-recuerdo') return MAP_VIEWS[0];
  return null;
}
