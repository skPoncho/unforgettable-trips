import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Header } from './layout/header/header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header],
  template: `
    <app-header />
    <main class="page">
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 20px;
      min-height: 100dvh;
      padding: 20px 24px 32px;
    }

    .page {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    @media (max-width: 600px) {
      :host {
        padding: 16px 16px 24px;
      }
    }
  `,
})
export class App {}
