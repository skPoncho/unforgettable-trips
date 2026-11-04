import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { JAPAN_TRIP_ID, kyotoSearch } from '../../../testing/fixtures';
import { SearchBox } from './search-box';

/** Un poco más que la espera de la búsqueda (200 ms). */
const DEBOUNCE_WAIT_MS = 260;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('SearchBox', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SearchBox],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render() {
    const fixture = TestBed.createComponent(SearchBox);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('input')!;
    return { fixture, el, input };
  }

  async function type(input: HTMLInputElement, q: string) {
    input.focus();
    input.value = q;
    input.dispatchEvent(new Event('input'));
    await wait(DEBOUNCE_WAIT_MS);
  }

  const key = (input: HTMLInputElement, k: string) =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  it('busca al escribir y agrupa lugares, viajes y recuerdos', async () => {
    const { fixture, el, input } = await render();
    await type(input, 'kioto');
    http
      .expectOne((r) => r.url === '/api/search' && r.params.get('q') === 'kioto')
      .flush(kyotoSearch);
    await fixture.whenStable();

    expect(input.getAttribute('aria-expanded')).toBe('true');
    const groups = [...el.querySelectorAll('.group__label')].map((g) => g.textContent?.trim());
    expect(groups).toEqual(['Lugares', 'Viajes', 'Recuerdos']);
    expect(el.querySelectorAll('[role="option"]')).toHaveLength(3);
    expect(el.querySelector('[role="option"] mark')?.textContent).toBe('Kioto');
    expect(el.querySelector('[role="status"]')?.textContent).toContain('3 resultados');
    fixture.nativeElement.remove();
  });

  it('con las flechas y Enter abre el resultado y limpia la búsqueda', async () => {
    const { fixture, el, input } = await render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await type(input, 'kioto');
    http.expectOne((r) => r.url === '/api/search').flush(kyotoSearch);
    await fixture.whenStable();

    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    await fixture.whenStable();
    expect(input.getAttribute('aria-activedescendant')).toBe('search-option-1');
    expect(el.querySelector('.option--active .option__title')?.textContent?.trim()).toBe('Japón');

    key(input, 'Enter');
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/viajes', JAPAN_TRIP_ID], { queryParams: undefined });
    expect(input.value).toBe('');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    fixture.nativeElement.remove();
  });

  it('Esc cierra la lista y la segunda vez borra el texto', async () => {
    const { fixture, el, input } = await render();
    await type(input, 'kioto');
    http.expectOne((r) => r.url === '/api/search').flush(kyotoSearch);
    await fixture.whenStable();

    key(input, 'Escape');
    await fixture.whenStable();
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    expect(input.value).toBe('kioto');

    key(input, 'Escape');
    await fixture.whenStable();
    expect(input.value).toBe('');
    fixture.nativeElement.remove();
  });

  it('dice cuando no hay resultados y no busca con una sola letra', async () => {
    const { fixture, el, input } = await render();
    await type(input, 'k');
    http.expectNone((r) => r.url === '/api/search');

    await type(input, 'zzz');
    http.expectOne((r) => r.url === '/api/search').flush({ places: [], trips: [], memories: [] });
    await fixture.whenStable();
    expect(el.querySelector('.status')?.textContent).toContain('Sin resultados para «zzz»');
    fixture.nativeElement.remove();
  });

  it('"/" enfoca la búsqueda, salvo mientras se escribe en otro campo', async () => {
    const { fixture, input } = await render();
    const other = document.createElement('input');
    document.body.appendChild(other);

    other.focus();
    other.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(document.activeElement).toBe(other);

    other.blur();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(document.activeElement).toBe(input);

    other.remove();
    fixture.nativeElement.remove();
  });
});
