import { TestBed } from '@angular/core/testing';

import { countries, progress, userMap } from '../../../testing/fixtures';
import type { Progress } from '../../core/api/types';
import { ProgressPanel } from './progress-panel';

describe('ProgressPanel', () => {
  async function render(p: Progress = progress) {
    const fixture = TestBed.createComponent(ProgressPanel);
    fixture.componentRef.setInput('progress', p);
    fixture.componentRef.setInput('map', userMap);
    fixture.componentRef.setInput('countries', countries);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (el: HTMLElement, selector: string) =>
    el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();

  /** Textos de los hijos separados por espacio (Angular quita el espacio entre elementos). */
  const words = (el: Element | null) =>
    [...(el?.children ?? [])].map((c) => c.textContent?.trim()).join(' ');

  it('muestra la cifra y los 195 puntos, con la escala como punto hueco', async () => {
    const el = await render();
    expect(words(el.querySelector('.headline'))).toBe('3 de 195 países');
    expect(el.querySelectorAll('.dot')).toHaveLength(195);
    expect(el.querySelectorAll('.dot--visited')).toHaveLength(2);
    expect(el.querySelectorAll('.dot--stopover')).toHaveLength(1);
    expect(el.querySelector('.dots')?.getAttribute('aria-label')).toBe(
      '3 de 195 países encendidos, uno de ellos por escala',
    );
  });

  it('el encabezado empieza en el año de la primera visita', async () => {
    const el = await render();
    expect(text(el, '.eyebrow')).toBe('Tu mundo · 2019 — hoy');
  });

  it('muestra el próximo hito', async () => {
    const el = await render();
    expect(text(el, '.note__strong')).toBe('Próximo hito: 5 países.');
  });

  it('barras por continente con lo que da la API', async () => {
    const el = await render();
    const rows = [...el.querySelectorAll('.continent__row')].map(words);
    expect(rows).toEqual([
      'América 2/35',
      'Europa 0/44',
      'Asia 1/48',
      'África 0/54',
      'Oceanía 0/14',
    ]);
    const asia = el.querySelectorAll<HTMLElement>('.bar__fill')[2];
    expect(asia.style.width).toBe(`${(1 / 48) * 100}%`);
  });

  it('estadísticas en singular o plural', async () => {
    const el = await render();
    const stats = [...el.querySelectorAll('.stat')].map(words);
    expect(stats).toEqual(['1 viaje', '2 ciudades', '1 monumento', '84 fotos']);
  });

  it('lista de deseos con nombres en español, en orden alfabético', async () => {
    const el = await render();
    const chips = [...el.querySelectorAll('.chip')].map((c) => c.textContent?.trim());
    expect(chips).toEqual(['Argentina', 'Egipto']);
    expect(text(el, '.wishlist__count')).toBe('2');
  });
});
