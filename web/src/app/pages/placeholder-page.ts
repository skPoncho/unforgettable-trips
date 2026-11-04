import { Component, input } from '@angular/core';

/** Marcador para las vistas que todavía no existen. Recibe los datos de la ruta como inputs. */
@Component({
  selector: 'app-placeholder-page',
  template: `
    <section class="placeholder" [attr.aria-label]="heading()">
      <span class="placeholder__eyebrow">Próximamente · fase {{ phase() }}</span>
      <h1 class="placeholder__title">{{ heading() }}</h1>
      <p class="placeholder__text">Esta vista se construye en la fase {{ phase() }} del plan.</p>
    </section>
  `,
  styles: `
    :host {
      flex: 1;
      display: flex;
    }

    .placeholder {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      min-height: 420px;
      padding: 32px;
      text-align: center;
      background: var(--map-ocean);
      border: 1px solid var(--line);
      border-radius: var(--radius-map);
    }

    .placeholder__eyebrow {
      font-family: var(--font-mono);
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .placeholder__title {
      margin: 0;
      font-family: var(--font-display);
      font-weight: 800;
      font-size: clamp(40px, 6vw, 64px);
      letter-spacing: -0.02em;
      color: var(--accent-text);
    }

    .placeholder__text {
      margin: 0;
      color: var(--text-sub);
    }
  `,
})
export class PlaceholderPage {
  readonly heading = input.required<string>();
  readonly phase = input.required<number>();
}
