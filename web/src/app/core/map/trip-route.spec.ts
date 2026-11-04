import { japanTripDetail, worldTopology } from '../../../testing/fixtures';
import type { TripStop } from '../api/types';
import { drawTripRoute, labelBox } from './trip-route';

const stops = japanTripDetail.stops;

describe('drawTripRoute', () => {
  it('numera solo las estancias, en orden (Kioto es el pin 3)', () => {
    const d = drawTripRoute(worldTopology, stops)!;
    expect(d.pins.map((p) => `${p.n} ${p.name}`)).toEqual([
      '1 Tokio',
      '2 Hakone',
      '3 Kioto',
      '4 Nara',
      '5 Osaka',
      '6 Hiroshima',
    ]);
    expect(d.route.match(/Q/g)).toHaveLength(5);
  });

  it('una escala lejana no estira el mapa: queda fuera del encuadre', () => {
    const withStopover = drawTripRoute(worldTopology, stops)!;
    const staysOnly = drawTripRoute(
      worldTopology,
      stops.filter((s) => s.visit_type === 'stay'),
    )!;
    expect(withStopover.pins).toEqual(staysOnly.pins);
    expect(withStopover.stopovers).toEqual([]);
    // Todas las estancias caben con margen.
    for (const pin of withStopover.pins) {
      expect(pin.x).toBeGreaterThan(0);
      expect(pin.x).toBeLessThan(withStopover.width);
      expect(pin.y).toBeGreaterThan(0);
      expect(pin.y).toBeLessThan(withStopover.height);
    }
  });

  it('una escala cercana sí se dibuja (sin número)', () => {
    const narita: TripStop = {
      ...stops[0],
      id: 'narita',
      place_name: 'Aeropuerto de Narita',
      location: { lon: 140.3929, lat: 35.772 },
      country: { iso3: 'JPN', name_es: 'Japón' },
    };
    const d = drawTripRoute(worldTopology, [...stops, narita])!;
    expect(d.stopovers.map((s) => s.name)).toEqual(['Aeropuerto de Narita']);
    expect(d.pins).toHaveLength(6);
  });

  it('las etiquetas no se salen del mapa', () => {
    const d = drawTripRoute(worldTopology, stops)!;
    for (const pin of d.pins) {
      const box = labelBox(pin.x, pin.y, pin.name, pin.side);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.w).toBeLessThanOrEqual(d.width);
    }
  });

  it('marca los países con estancia y omite los que quedan fuera', () => {
    const d = drawTripRoute(worldTopology, stops)!;
    expect(d.land.find((l) => l.id === 'JPN')?.inTrip).toBe(true);
    expect(d.land.some((l) => l.id === 'PAN')).toBe(false);
  });

  it('un viaje de una sola parada tiene un encuadre mínimo y sin ruta', () => {
    const d = drawTripRoute(worldTopology, [stops[3]])!;
    expect(d.pins).toHaveLength(1);
    expect(d.route).toBe('');
    expect(d.pins[0].x).toBeCloseTo(d.width / 2, 0);
  });

  it('sin paradas no hay dibujo', () => {
    expect(drawTripRoute(worldTopology, [])).toBeNull();
  });
});
