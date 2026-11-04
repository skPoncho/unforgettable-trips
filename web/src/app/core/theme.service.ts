import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

export type Theme = 'dark' | 'light';
export type ThemePreference = 'system' | Theme;

/** Misma clave que lee el script de src/index.html. */
export const THEME_STORAGE_KEY = 'huella.theme';
const LIGHT_QUERY = '(prefers-color-scheme: light)';

/**
 * Tema de la app. La preferencia es `system` hasta que el usuario elige uno;
 * el tema resuelto siempre se escribe como data-theme en <html>.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly media = this.window?.matchMedia?.(LIGHT_QUERY) ?? null;

  private readonly systemTheme = signal<Theme>(this.media?.matches ? 'light' : 'dark');

  readonly preference = signal<ThemePreference>(this.readStoredPreference());
  readonly theme = computed<Theme>(() => {
    const preference = this.preference();
    return preference === 'system' ? this.systemTheme() : preference;
  });

  constructor() {
    this.media?.addEventListener('change', (event) =>
      this.systemTheme.set(event.matches ? 'light' : 'dark'),
    );
    effect(() => this.document.documentElement.setAttribute('data-theme', this.theme()));
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    this.storePreference(preference);
  }

  /** Alterna entre oscuro y claro y deja fijada la elección. */
  toggle(): void {
    this.setPreference(this.theme() === 'dark' ? 'light' : 'dark');
  }

  private readStoredPreference(): ThemePreference {
    try {
      const stored = this.window?.localStorage.getItem(THEME_STORAGE_KEY);
      return stored === 'dark' || stored === 'light' ? stored : 'system';
    } catch {
      return 'system';
    }
  }

  private storePreference(preference: ThemePreference): void {
    try {
      if (preference === 'system') {
        this.window?.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        this.window?.localStorage.setItem(THEME_STORAGE_KEY, preference);
      }
    } catch {
      // Sin almacenamiento (modo privado o bloqueado): el tema solo dura esta visita.
    }
  }
}
