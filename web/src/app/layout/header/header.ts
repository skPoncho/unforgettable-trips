import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { LucideMoon, LucidePlus, LucideShare2, LucideSun } from '@lucide/angular';
import { filter, map } from 'rxjs';

import { ThemeService } from '../../core/theme.service';
import { MAP_VIEWS, activeView } from '../../views';
import { ProfileMenu } from './profile-menu';
import { SearchBox } from './search-box';

@Component({
  selector: 'app-header',
  imports: [RouterLink, ProfileMenu, SearchBox, LucideSun, LucideMoon, LucideShare2, LucidePlus],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  protected readonly theme = inject(ThemeService);
  protected readonly views = MAP_VIEWS;
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.parseUrl(this.router.url)),
    ),
    { initialValue: this.router.parseUrl(this.router.url) },
  );

  /** Ciudades y Monumentos son pestañas de Mi país: se marca la que está abierta. */
  protected readonly active = computed(() => activeView(this.url()));

  protected readonly isDark = computed(() => this.theme.theme() === 'dark');
  protected readonly themeLabel = computed(() =>
    this.isDark() ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
  );
}
