import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  LucideFlag,
  LucideImage,
  LucideLandmark,
  LucideMap,
  LucideMapPin,
  LucideRoute,
  LucideSearch,
} from '@lucide/angular';
import { Subject, catchError, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import type { SearchResults } from '../../core/api/types';
import { SEARCH_GROUPS, type SearchOption, highlight, searchOptions } from '../../core/search';
import { photoUrl } from '../../core/trips-api';

const DEBOUNCE_MS = 200;
const MIN_CHARS = 2;

type State = 'idle' | 'loading' | 'done' | 'error';

/**
 * Búsqueda del encabezado (combobox de WAI-ARIA): lugares, viajes y recuerdos del usuario.
 * ↑↓ recorren los resultados, Enter abre, Esc cierra y "/" enfoca la búsqueda.
 */
@Component({
  selector: 'app-search-box',
  imports: [
    LucideSearch,
    LucideFlag,
    LucideMap,
    LucideMapPin,
    LucideLandmark,
    LucideRoute,
    LucideImage,
  ],
  host: {
    '(document:keydown)': 'onDocumentKeydown($event)',
    '(focusout)': 'onFocusOut($event)',
  },
  // Las partes resaltadas van cada una en su elemento: así Angular no agrega espacios entre
  // ellas ("pirámide ." en vez de "pirámide.").
  template: `
    <div class="search" [class.search--open]="open()">
      <svg lucideSearch [size]="18" aria-hidden="true"></svg>
      <label class="visually-hidden" for="site-search">Buscar</label>
      <input
        #input
        id="site-search"
        class="search__input"
        type="search"
        role="combobox"
        autocomplete="off"
        spellcheck="false"
        placeholder="Busca un lugar, un viaje o un recuerdo…"
        aria-autocomplete="list"
        aria-controls="site-search-list"
        aria-keyshortcuts="/"
        [attr.aria-expanded]="open() && options().length > 0"
        [attr.aria-activedescendant]="active() >= 0 ? 'search-option-' + active() : null"
        [value]="query()"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        (focus)="focused.set(true)"
      />
      @if (!query()) {
        <kbd class="search__key" aria-hidden="true">/</kbd>
      }
    </div>

    @if (open()) {
      <div class="results">
        @if (options().length) {
          <div id="site-search-list" role="listbox" aria-label="Resultados de la búsqueda">
            @for (group of groups(); track group.id) {
              <div class="group" role="group" [attr.aria-labelledby]="'search-group-' + group.id">
                <div class="group__label" [id]="'search-group-' + group.id">{{ group.label }}</div>
                @for (item of group.items; track item.option.id) {
                  @let option = item.option;
                  <div
                    class="option"
                    role="option"
                    [id]="'search-option-' + item.index"
                    [class.option--active]="item.index === active()"
                    [attr.aria-selected]="item.index === active()"
                    tabindex="-1"
                    (pointerdown)="$event.preventDefault()"
                    (pointermove)="active.set(item.index)"
                    (click)="go(option)"
                    (keydown.enter)="go(option)"
                  >
                    @if (option.photoId) {
                      <img class="option__thumb" [src]="thumb(option.photoId)" alt="" />
                    } @else {
                      <span class="option__icon" aria-hidden="true">
                        @switch (option.icon) {
                          @case ('country') {
                            <svg lucideFlag [size]="17"></svg>
                          }
                          @case ('subdivision') {
                            <svg lucideMap [size]="17"></svg>
                          }
                          @case ('city') {
                            <svg lucideMapPin [size]="17"></svg>
                          }
                          @case ('monument') {
                            <svg lucideLandmark [size]="17"></svg>
                          }
                          @case ('trip') {
                            <svg lucideRoute [size]="17"></svg>
                          }
                          @default {
                            <svg lucideImage [size]="17"></svg>
                          }
                        }
                      </span>
                    }
                    <span class="option__text">
                      <span class="option__title">
                        @for (part of mark(option.title); track $index) {
                          @if (part.match) {
                            <mark>{{ part.text }}</mark>
                          } @else {
                            <span>{{ part.text }}</span>
                          }
                        }
                      </span>
                      <span class="option__detail">{{ option.detail }}</span>
                      @if (option.snippet) {
                        <span class="option__snippet">
                          @for (part of mark(option.snippet); track $index) {
                            @if (part.match) {
                              <mark>{{ part.text }}</mark>
                            } @else {
                              <span>{{ part.text }}</span>
                            }
                          }
                        </span>
                      }
                    </span>
                  </div>
                }
              </div>
            }
          </div>
        } @else if (state() === 'error') {
          <p class="status">No se pudo buscar. Intenta de nuevo.</p>
        } @else if (state() === 'done') {
          <p class="status">Sin resultados para «{{ searched() }}».</p>
        } @else {
          <p class="status">Buscando…</p>
        }
      </div>
    }
    <p class="visually-hidden" role="status">{{ announcement() }}</p>
  `,
  styleUrl: './search-box.scss',
})
export class SearchBox {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  protected readonly query = signal('');
  protected readonly focused = signal(false);
  protected readonly state = signal<State>('idle');
  /** El texto de los resultados que se muestran (la búsqueda va un poco atrás del teclado). */
  protected readonly searched = signal('');
  protected readonly options = signal<SearchOption[]>([]);
  protected readonly active = signal(-1);

  private readonly terms = new Subject<string>();

  protected readonly open = computed(
    () => this.focused() && this.query().trim().length >= MIN_CHARS && this.state() !== 'idle',
  );

  /** Grupos con el índice global de cada opción (el que recorren las flechas). */
  protected readonly groups = computed(() => {
    const items = this.options().map((option, index) => ({ option, index }));
    return SEARCH_GROUPS.map((g) => ({
      ...g,
      items: items.filter((i) => i.option.group === g.id),
    })).filter((g) => g.items.length);
  });

  protected readonly announcement = computed(() => {
    if (!this.open() || this.state() !== 'done') return '';
    const n = this.options().length;
    return n === 0 ? 'Sin resultados' : n === 1 ? '1 resultado' : `${n} resultados`;
  });

  constructor() {
    this.terms
      .pipe(
        map((q) => q.trim()),
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.length < MIN_CHARS) return of({ q, results: null, failed: false });
          return this.http.get<SearchResults>('/api/search', { params: { q } }).pipe(
            map((results) => ({ q, results, failed: false })),
            catchError(() => of({ q, results: null, failed: true })),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ q, results, failed }) => {
        this.searched.set(q);
        this.options.set(results ? searchOptions(results) : []);
        this.active.set(-1);
        this.state.set(failed ? 'error' : results ? 'done' : 'idle');
      });
  }

  protected mark(text: string) {
    return highlight(text, this.searched());
  }

  protected thumb(photoId: string): string {
    return photoUrl(photoId);
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    if (value.trim().length >= MIN_CHARS && this.state() === 'idle') this.state.set('loading');
    this.terms.next(value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const n = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!n) return;
        event.preventDefault();
        this.focused.set(true);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const current = this.active();
        this.active.set(current < 0 && step < 0 ? n - 1 : (current + step + n) % n);
        this.scrollActive();
        break;
      }
      case 'Enter': {
        if (!this.open() || !n) return;
        event.preventDefault();
        this.go(this.options()[Math.max(0, this.active())]);
        break;
      }
      case 'Escape': {
        event.preventDefault();
        // Primero cierra la lista; si ya estaba cerrada, borra el texto.
        if (this.open()) this.focused.set(false);
        else this.clear();
        break;
      }
    }
  }

  /** "/" enfoca la búsqueda desde cualquier parte (menos mientras se escribe en otro campo). */
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    this.input().nativeElement.focus();
  }

  protected onFocusOut(event: FocusEvent): void {
    const host = (event.currentTarget as HTMLElement | null) ?? null;
    if (host && event.relatedTarget instanceof Node && host.contains(event.relatedTarget)) return;
    this.focused.set(false);
  }

  protected go(option: SearchOption): void {
    void this.router.navigate(option.link.commands, { queryParams: option.link.queryParams });
    this.clear();
    this.input().nativeElement.blur();
  }

  private clear(): void {
    this.query.set('');
    this.options.set([]);
    this.active.set(-1);
    this.state.set('idle');
    this.terms.next('');
  }

  private scrollActive(): void {
    const id = `search-option-${this.active()}`;
    queueMicrotask(() => document.getElementById(id)?.scrollIntoView?.({ block: 'nearest' }));
  }
}
