import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { LucideHouse } from '@lucide/angular';

import type { City } from '../../core/api/types';
import { Profile } from '../../core/profile';
import { PlaceSearch } from '../../shared/place-search';

/** Avatar del encabezado con el menú de perfil: nombre y ciudad de casa (fase 6). */
@Component({
  selector: 'app-profile-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlaceSearch, LucideHouse],
  host: {
    '(document:pointerdown)': 'onOutside($event)',
    '(keydown.escape)': 'close(true)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="avatar"
      aria-label="Mi perfil"
      aria-controls="profile-menu"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
    >
      {{ profile.initials() }}
    </button>

    @if (open()) {
      <section id="profile-menu" class="menu" aria-label="Mi perfil">
        @if (me(); as me) {
          <div class="who">
            <span class="who__name">{{ me.display_name }}</span>
            <span class="who__handle">&#64;{{ me.handle }}</span>
          </div>

          <div class="home">
            <span class="home__label">
              <svg lucideHouse [size]="15" aria-hidden="true"></svg>
              Ciudad de casa
            </span>
            @if (searching()) {
              <app-place-search
                inputId="home-search"
                label="Busca tu ciudad de casa"
                placeholder="Ciudad de México, Monterrey…"
                (picked)="choose($event)"
                (cancelled)="searching.set(false)"
              />
            } @else {
              <div class="home__row">
                <span class="home__city">{{ homeLabel() }}</span>
                <button type="button" class="home__change" (click)="searching.set(true)">
                  Cambiar
                </button>
              </div>
              <p class="home__hint">Tu ciudad, su estado y su país cuentan como visitados.</p>
            }
            @if (status(); as s) {
              <p class="home__status" [class.home__status--error]="s.error" role="status">
                {{ s.text }}
              </p>
            }
          </div>
        } @else {
          <p class="home__status" role="status">Cargando tu perfil…</p>
        }
      </section>
    }
  `,
  styleUrl: './profile-menu.scss',
})
export class ProfileMenu {
  protected readonly profile = inject(Profile);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);
  protected readonly searching = signal(false);
  protected readonly status = signal<{ text: string; error: boolean } | null>(null);

  protected readonly me = computed(() =>
    this.profile.me.hasValue() ? this.profile.me.value() : null,
  );

  protected readonly homeLabel = computed(() => this.me()?.home_city?.name_es ?? 'Sin elegir');

  protected toggle(): void {
    if (this.open()) {
      this.close();
    } else {
      this.status.set(null);
      this.open.set(true);
    }
  }

  close(focusTrigger = false): void {
    if (!this.open()) return;
    this.open.set(false);
    this.searching.set(false);
    if (focusTrigger) this.host.nativeElement.querySelector<HTMLElement>('.avatar')?.focus();
  }

  protected onOutside(event: PointerEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  protected choose(city: City): void {
    this.searching.set(false);
    this.status.set({ text: 'Guardando…', error: false });
    this.profile.setHome(city.id).subscribe({
      next: () => this.status.set({ text: `Tu casa ahora es ${city.name_es}.`, error: false }),
      error: () => this.status.set({ text: 'No se pudo guardar. Intenta otra vez.', error: true }),
    });
  }
}
