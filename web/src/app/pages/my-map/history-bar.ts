import { Component, input, output } from '@angular/core';
import { LucidePause, LucidePlay } from '@lucide/angular';

/**
 * Reproduce tu historia (Main.dc.html): reproducir o pausar y elegir un año.
 * La barra ámbar llega hasta el año que se muestra. El estado vive en HistoryPlayer.
 */
@Component({
  selector: 'app-history-bar',
  imports: [LucidePlay, LucidePause],
  template: `
    <div class="history">
      <button
        type="button"
        class="play"
        [attr.aria-label]="playing() ? 'Pausar historia' : 'Reproducir historia'"
        [disabled]="years().length < 2"
        (click)="playToggle.emit()"
      >
        @if (playing()) {
          <svg lucidePause [size]="16" fill="currentColor" aria-hidden="true"></svg>
        } @else {
          <svg lucidePlay [size]="16" fill="currentColor" aria-hidden="true"></svg>
        }
      </button>
      <div class="history__body">
        <span class="history__text" [id]="textId">
          Reproduce tu historia: mira cómo se encendió tu mapa, año por año
        </span>
        <div
          class="years"
          role="group"
          [attr.aria-labelledby]="textId"
          [style.--years]="years().length"
        >
          @for (year of years(); track year) {
            <button
              type="button"
              class="year"
              [class.year--on]="shown() !== null && year <= shown()!"
              [class.year--current]="year === shown()"
              [attr.aria-pressed]="year === shown()"
              (click)="pick.emit(year)"
            >
              <span class="year__bar" aria-hidden="true"></span>
              <span class="year__label">{{ year }}</span>
            </button>
          }
        </div>
      </div>
    </div>
    <p class="visually-hidden" role="status">{{ announcement() }}</p>
  `,
  styleUrl: './history-bar.scss',
})
export class HistoryBar {
  readonly years = input.required<readonly number[]>();
  /** Año marcado (hoy es el último). */
  readonly shown = input.required<number | null>();
  readonly playing = input(false);
  /** Lo que se anuncia al lector de pantalla al cambiar de año (p. ej. "2022: 5 países"). */
  readonly announcement = input('');

  /** Reproducir o pausar. */
  readonly playToggle = output<void>();
  readonly pick = output<number>();

  protected readonly textId = 'history-text';
}
