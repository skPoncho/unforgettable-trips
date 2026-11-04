import { TestBed } from '@angular/core/testing';

import { timeline, userMap } from '../../testing/fixtures';
import { HISTORY_STEP_MS, HistoryPlayer, mapAtYear } from './history';

describe('mapAtYear', () => {
  it('antes del primer viaje solo está la casa', () => {
    const frame = mapAtYear(userMap, timeline, 2019)!;
    expect(frame.map.countries.map((c) => c.iso3)).toEqual(['MEX']);
    expect(frame.map.subdivisions.map((s) => s.code)).toEqual(['MX-CMX', 'MX-OAX']);
    expect(frame.map.cities).toEqual([]);
    expect(frame.map.monuments).toEqual([]);
    expect(frame.map.wishlist).toEqual(userMap.wishlist);
    expect(frame.progress.countries.visited).toBe(1);
    expect([...frame.lit.countries]).toEqual([]);
  });

  it('el año de un viaje enciende sus países con el estado de entonces', () => {
    const frame = mapAtYear(userMap, timeline, 2025)!;
    expect(frame.map.countries.map((c) => [c.iso3, c.status])).toEqual([
      ['JPN', 'visited'],
      ['MEX', 'visited'],
      ['PAN', 'stopover'],
    ]);
    expect([...frame.lit.countries]).toEqual(['JPN', 'PAN']);
    expect([...frame.lit.cities]).toEqual([1850147]);
    expect(frame.map.monuments.map((m) => m.slug)).toEqual(['fushimi-inari']);
  });

  it('una escala pasa a visitado el año de su estancia', () => {
    const later = structuredClone(timeline);
    later.years.push({
      year: 2026,
      countries: [{ iso3: 'PAN', status: 'visited' }],
      subdivisions: [],
      cities: [],
      progress: later.years[6].progress,
    });
    const status = (year: number) =>
      mapAtYear(userMap, later, year)!.map.countries.find((c) => c.iso3 === 'PAN')?.status;
    expect(status(2025)).toBe('stopover');
    expect(status(2026)).toBe('visited');
  });

  it('un año fuera de la línea de tiempo no tiene cuadro', () => {
    expect(mapAtYear(userMap, timeline, 1990)).toBeNull();
  });
});

describe('HistoryPlayer', () => {
  let player: HistoryPlayer;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [HistoryPlayer] });
    player = TestBed.inject(HistoryPlayer);
    player.setYears([2019, 2020, 2021]);
  });

  afterEach(() => vi.useRealTimers());

  it('empieza en hoy, con el último año marcado', () => {
    expect(player.year()).toBeNull();
    expect(player.shown()).toBe(2021);
  });

  it('reproduce desde el primer año y se detiene en el último', () => {
    player.toggle();
    expect(player.playing()).toBe(true);
    expect(player.year()).toBe(2019);

    vi.advanceTimersByTime(HISTORY_STEP_MS);
    expect(player.year()).toBe(2020);
    vi.advanceTimersByTime(HISTORY_STEP_MS);
    expect(player.year()).toBe(2021);
    expect(player.playing()).toBe(false);

    vi.advanceTimersByTime(HISTORY_STEP_MS * 3);
    expect(player.year()).toBe(2021);
  });

  it('pausar se queda en el año y reproducir sigue desde ahí', () => {
    player.play();
    player.toggle();
    vi.advanceTimersByTime(HISTORY_STEP_MS * 2);
    expect(player.year()).toBe(2019);

    player.play();
    vi.advanceTimersByTime(HISTORY_STEP_MS);
    expect(player.year()).toBe(2020);
  });

  it('elegir un año pausa; al terminar, reproducir empieza otra vez', () => {
    player.play();
    player.pick(2021);
    expect(player.playing()).toBe(false);
    expect(player.year()).toBe(2021);

    player.play();
    expect(player.year()).toBe(2019);
  });

  it('nuevos datos regresan a hoy', () => {
    player.pick(2020);
    player.setYears([2019, 2020, 2021, 2022]);
    expect(player.year()).toBeNull();
    expect(player.shown()).toBe(2022);
  });
});
