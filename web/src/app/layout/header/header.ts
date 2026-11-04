import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideMoon, LucideSun } from '@lucide/angular';

import { ThemeService } from '../../core/theme.service';
import { MAP_VIEWS } from '../../views';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, LucideSun, LucideMoon],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  protected readonly theme = inject(ThemeService);
  protected readonly views = MAP_VIEWS;

  protected readonly isDark = computed(() => this.theme.theme() === 'dark');
  protected readonly themeLabel = computed(() =>
    this.isDark() ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
  );

  // Fijas hasta que existan las cuentas (fase 8).
  protected readonly initials = 'CB';
}
