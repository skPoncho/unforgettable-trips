import { A11yModule } from '@angular/cdk/a11y';
import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { LucideChevronLeft, LucideChevronRight, LucideX } from '@lucide/angular';

import { type TripPhoto, photoUrl } from '../../core/trips-api';

/** Visor de galería: una foto a la vez (variante `display`), con flechas y Esc. */
@Component({
  selector: 'app-photo-viewer',
  imports: [A11yModule, LucideX, LucideChevronLeft, LucideChevronRight],
  host: {
    '(document:keydown.escape)': 'closed.emit()',
    '(document:keydown.arrowleft)': 'step(-1)',
    '(document:keydown.arrowright)': 'step(1)',
  },
  template: `
    <div class="scrim" aria-hidden="true" (click)="closed.emit()"></div>
    <div
      class="viewer"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="'Fotos de ' + title()"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
    >
      <header class="head">
        <span class="title">{{ title() }}</span>
        <span class="count" aria-live="polite">{{ index() + 1 }} / {{ photos().length }}</span>
        <button
          type="button"
          class="round"
          aria-label="Cerrar"
          cdkFocusInitial
          (click)="closed.emit()"
        >
          <svg lucideX [size]="18" [strokeWidth]="2.2" aria-hidden="true"></svg>
        </button>
      </header>
      <div class="stage">
        @if (current(); as photo) {
          <img
            class="photo"
            [src]="src()"
            [attr.width]="photo.width"
            [attr.height]="photo.height"
            [alt]="'Foto ' + (index() + 1) + ' de ' + photos().length + ' en ' + title()"
          />
        }
        @if (photos().length > 1) {
          <button type="button" class="nav nav--prev" aria-label="Foto anterior" (click)="step(-1)">
            <svg lucideChevronLeft [size]="22" aria-hidden="true"></svg>
          </button>
          <button type="button" class="nav nav--next" aria-label="Foto siguiente" (click)="step(1)">
            <svg lucideChevronRight [size]="22" aria-hidden="true"></svg>
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 50;
      display: grid;
      place-items: center;
      padding: 24px;
    }

    .scrim {
      position: fixed;
      inset: 0;
      background: var(--scrim);
    }

    .viewer {
      position: relative;
      width: min(1100px, 100%);
      max-height: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
      box-shadow: var(--shadow-dialog);
    }

    .head {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .title {
      flex: 1;
      font-family: var(--font-display);
      font-size: 20px;
      font-weight: 700;
    }

    .count {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text-muted);
    }

    .round,
    .nav {
      display: grid;
      place-items: center;
      width: var(--tap-target);
      height: var(--tap-target);
      padding: 0;
      border-radius: 50%;
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      cursor: pointer;
    }

    .stage {
      position: relative;
      display: grid;
      place-items: center;
      min-height: 0;
      border-radius: 14px;
      background: var(--placeholder);
      overflow: hidden;
    }

    .photo {
      display: block;
      max-width: 100%;
      max-height: calc(100dvh - 170px);
      width: auto;
      height: auto;
      object-fit: contain;
    }

    .nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background: var(--overlay);
    }

    .nav--prev {
      left: 12px;
    }

    .nav--next {
      right: 12px;
    }
  `,
})
export class PhotoViewer {
  readonly photos = input.required<TripPhoto[]>();
  /** Foto con la que abre. */
  readonly start = input(0);
  /** Lugar de las fotos (para el título y el texto alternativo). */
  readonly title = input('');
  readonly closed = output<void>();

  protected readonly index = linkedSignal(() => this.start());
  protected readonly current = computed(() => this.photos()[this.index()] ?? null);
  protected readonly src = computed(() => {
    const photo = this.current();
    return photo ? photoUrl(photo.id, 'display') : '';
  });

  /** Avanza o retrocede, dando la vuelta al llegar al final. */
  step(delta: number): void {
    const total = this.photos().length;
    if (total > 0) this.index.update((i) => (i + delta + total) % total);
  }
}
