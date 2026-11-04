import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';

import { type City, MemoriesApi } from '../../core/memories-api';

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

/** "Cambiar lugar": autocompletar de ciudades (patrón combobox de WAI-ARIA). */
@Component({
  selector: 'app-place-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="label" for="place-search-input">Busca la ciudad</label>
    <div class="row">
      <input
        #input
        id="place-search-input"
        class="input"
        type="text"
        role="combobox"
        autocomplete="off"
        placeholder="Kioto, Oaxaca, Reikiavik…"
        aria-autocomplete="list"
        aria-controls="place-search-list"
        [attr.aria-expanded]="results().length > 0"
        [attr.aria-activedescendant]="active() >= 0 ? 'place-option-' + active() : null"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
      />
      <button type="button" class="cancel" (click)="cancelled.emit()">Cancelar</button>
    </div>
    @if (results().length) {
      <ul id="place-search-list" class="list" role="listbox" aria-label="Ciudades">
        @for (city of results(); track city.id; let i = $index) {
          <li
            [id]="'place-option-' + i"
            class="option"
            role="option"
            [class.option--active]="i === active()"
            [attr.aria-selected]="i === active()"
            tabindex="-1"
            (pointerdown)="$event.preventDefault()"
            (click)="pick(city)"
            (keydown.enter)="pick(city)"
          >
            <span class="option__name">{{ city.name_es }}</span>
            <span class="option__where">{{ city.country_name_es }}</span>
          </li>
        }
      </ul>
    } @else if (empty()) {
      <p class="empty" role="status">No encontramos esa ciudad.</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 16px 14px;
    }

    .label {
      font-size: 13px;
      font-weight: 600;
    }

    .row {
      display: flex;
      gap: 8px;
    }

    .input {
      flex: 1;
      min-width: 0;
      min-height: 44px;
      padding: 0 14px;
      border-radius: 12px;
      border: 1px solid var(--line-strong);
      background: var(--field);
      color: var(--text);
      font: inherit;
      font-size: 16px;
    }

    .cancel {
      min-height: 44px;
      padding: 0 14px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--line);
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }

    .list {
      margin: 0;
      padding: 4px;
      list-style: none;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--panel);
      max-height: 220px;
      overflow: auto;
    }

    .option {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
    }

    .option--active,
    .option:hover {
      background: var(--accent-soft);
    }

    .option__name {
      font-weight: 600;
    }

    .option__where,
    .empty {
      color: var(--text-muted);
      font-size: 13px;
    }

    .empty {
      margin: 0;
    }
  `,
})
export class PlaceSearch {
  readonly picked = output<City>();
  readonly cancelled = output<void>();

  private readonly api = inject(MemoriesApi);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private readonly queries = new Subject<string>();

  protected readonly results = signal<City[]>([]);
  protected readonly active = signal(-1);
  protected readonly empty = signal(false);

  constructor() {
    this.queries
      .pipe(
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((q) =>
          q.length < MIN_CHARS ? of(null) : this.api.searchCities(q).pipe(catchError(() => of([]))),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((cities) => {
        this.results.set(cities ?? []);
        this.active.set(cities?.length ? 0 : -1);
        this.empty.set(cities !== null && cities.length === 0);
      });
    afterNextRender(() => this.input().nativeElement.focus());
  }

  protected onInput(event: Event): void {
    this.queries.next((event.target as HTMLInputElement).value.trim());
  }

  protected onKeydown(event: KeyboardEvent): void {
    const n = this.results().length;
    if (event.key === 'ArrowDown' && n) {
      event.preventDefault();
      this.active.update((i) => (i + 1) % n);
    } else if (event.key === 'ArrowUp' && n) {
      event.preventDefault();
      this.active.update((i) => (i - 1 + n) % n);
    } else if (event.key === 'Enter' && this.active() >= 0) {
      event.preventDefault();
      this.pick(this.results()[this.active()]);
    } else if (event.key === 'Escape') {
      // Cierra el buscador, no la ventana.
      event.stopPropagation();
      this.cancelled.emit();
    }
  }

  protected pick(city: City): void {
    this.picked.emit(city);
  }
}
