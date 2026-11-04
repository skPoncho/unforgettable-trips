import { TestBed } from '@angular/core/testing';

import { PhotoViewer } from './photo-viewer';

describe('PhotoViewer', () => {
  const photos = ['a', 'b', 'c'].map((id) => ({ id, width: 1600, height: 1200 }));

  async function render(start = 0) {
    const fixture = TestBed.createComponent(PhotoViewer);
    fixture.componentRef.setInput('photos', photos);
    fixture.componentRef.setInput('start', start);
    fixture.componentRef.setInput('title', 'Kioto');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const key = async (key: string) => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key }));
      await fixture.whenStable();
    };
    return { fixture, el, key };
  }

  it('las flechas recorren las fotos y dan la vuelta', async () => {
    const { el, key } = await render(2);
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('3 / 3');
    await key('ArrowRight');
    expect(el.querySelector('img')?.getAttribute('src')).toBe('/api/photos/a/display');
    await key('ArrowLeft');
    await key('ArrowLeft');
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('2 / 3');
    expect(el.querySelector('img')?.getAttribute('alt')).toBe('Foto 2 de 3 en Kioto');
  });

  it('Esc y el botón cerrar avisan que se cierra', async () => {
    const { fixture, el, key } = await render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    await key('Escape');
    el.querySelector<HTMLButtonElement>('[aria-label=Cerrar]')!.click();
    expect(closed).toHaveBeenCalledTimes(2);
  });
});
