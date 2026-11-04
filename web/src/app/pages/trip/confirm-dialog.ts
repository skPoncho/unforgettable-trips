import { A11yModule } from '@angular/cdk/a11y';
import { Component, input, output } from '@angular/core';

/** Confirmación antes de algo que no se puede deshacer (borrar paradas o recuerdos). */
@Component({
  selector: 'app-confirm-dialog',
  imports: [A11yModule],
  host: { '(document:keydown.escape)': 'cancelled.emit()' },
  template: `
    <div class="scrim" aria-hidden="true" (click)="cancelled.emit()"></div>
    <div
      class="box"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-detail"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
    >
      <h2 id="confirm-title" class="title">{{ title() }}</h2>
      <p id="confirm-detail" class="detail">{{ detail() }}</p>
      <div class="actions">
        <button type="button" class="button" cdkFocusInitial (click)="cancelled.emit()">
          Cancelar
        </button>
        <button
          type="button"
          class="button button--danger"
          [disabled]="busy()"
          (click)="confirmed.emit()"
        >
          {{ action() }}
        </button>
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

    .box {
      position: relative;
      width: min(440px, 100%);
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 24px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: var(--radius-card);
      box-shadow: var(--shadow-dialog);
    }

    .title {
      margin: 0;
      font-family: var(--font-display);
      font-size: 22px;
    }

    .detail {
      margin: 0;
      color: var(--text-sub);
      line-height: 1.5;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }

    .button {
      min-height: var(--tap-target);
      padding: 0 18px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--line);
      background: var(--panel);
      color: var(--text);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .button--danger {
      border-color: var(--danger);
      color: var(--danger);
    }
  `,
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly detail = input('');
  readonly action = input('Borrar');
  readonly busy = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
