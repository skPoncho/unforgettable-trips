import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { Passport as PassportData } from '../../core/me-api';

/** Giros de los sellos, como en la maqueta: dan la sensación de sellos puestos a mano. */
const ROTATIONS = [-4, 3, -2, 5, -5, 2, -3, 4, -1, 3, -4, 2];

interface StampView {
  slug: string;
  code: string;
  name: string;
  state: string;
  label: string;
  suggested: boolean;
  rotation: number;
  /** Texto para lectores de pantalla y la ayuda al pasar el mouse. */
  description: string;
}

/** Pasaporte de monumentos: sellos de los visitados y punteados los sugeridos (Mexico.dc.html). */
@Component({
  selector: 'app-passport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <div class="head__text">
        <h2 class="title" id="passport-title">Pasaporte de monumentos</h2>
        <p class="lead">
          Cada monumento que visitas te deja un sello. Los punteados son los que te faltan cerca de
          tu ruta.
        </p>
      </div>
      <span class="tally">{{ tally() }}</span>
    </div>

    @if (stamps().length) {
      <ul class="grid" aria-labelledby="passport-title">
        @for (s of stamps(); track s.slug) {
          <li class="stamp" [class.stamp--suggested]="s.suggested" [style.rotate.deg]="s.rotation">
            @if (s.suggested) {
              <div class="stamp__body" [attr.title]="s.description">
                <ng-container *ngTemplateOutlet="seal; context: { $implicit: s }" />
              </div>
            } @else {
              <button
                type="button"
                class="stamp__body"
                [attr.title]="s.description"
                (click)="picked.emit(s.slug)"
              >
                <ng-container *ngTemplateOutlet="seal; context: { $implicit: s }" />
              </button>
            }
          </li>
        }
      </ul>
    } @else {
      <p class="empty">
        Todavía no hay sellos ni sugerencias. Liga un recuerdo a un monumento para ganar el primero.
      </p>
    }

    <ng-template #seal let-s>
      <span class="seal" aria-hidden="true">
        <span class="seal__inner">
          <span class="seal__code">{{ s.code }}</span>
          <span class="seal__label">{{ s.label }}</span>
        </span>
      </span>
      <span class="stamp__name">{{ s.name }}</span>
      <span class="stamp__state">{{ s.state }}</span>
      <span class="visually-hidden">{{ s.description }}</span>
    </ng-template>
  `,
  styleUrl: './passport.scss',
  imports: [NgTemplateOutlet],
})
export class Passport {
  readonly passport = input.required<PassportData>();
  /** Elegir un sello lo muestra en el mapa. */
  readonly picked = output<string>();

  protected readonly tally = computed(() => {
    const { stamps, suggested } = this.passport();
    const sellos = stamps.length === 1 ? '1 SELLO' : `${stamps.length} SELLOS`;
    const sugeridos = suggested.length === 1 ? '1 SUGERIDO' : `${suggested.length} SUGERIDOS`;
    return `${sellos} · ${sugeridos}`;
  });

  protected readonly stamps = computed<StampView[]>(() => {
    const { stamps, suggested } = this.passport();
    const sealed = stamps.map((s) => ({
      slug: s.slug,
      code: s.stamp_code,
      name: s.name_es,
      state: s.subdivision_name ?? '',
      label: s.first_stamped_on.slice(0, 4),
      suggested: false,
      description: `Sellado en ${s.first_stamped_on.slice(0, 4)}`,
    }));
    const pending = suggested.map((s) => ({
      slug: s.slug,
      code: s.stamp_code,
      name: s.name_es,
      state: s.subdivision_name ?? '',
      label: 'SUGERIDO',
      suggested: true,
      description: `Sugerido: a ${kilometers(s.distance_km)} de ${s.near}`,
    }));
    return [...sealed, ...pending].map((s, i) => ({
      ...s,
      rotation: ROTATIONS[i % ROTATIONS.length],
    }));
  });
}

function kilometers(km: number): string {
  return `${km.toLocaleString('es-MX', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}
