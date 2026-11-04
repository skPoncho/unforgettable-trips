import { kyotoSearch } from '../../testing/fixtures';
import type { SearchPlace } from './api/types';
import { highlight, placeLink, searchOptions } from './search';

const place = (overrides: Partial<SearchPlace>): SearchPlace => ({
  kind: 'city',
  key: '1',
  name: 'Lugar',
  context: null,
  country_iso3: 'JPN',
  is_home: false,
  trip_id: null,
  stop_number: null,
  ...overrides,
});

describe('placeLink', () => {
  it('un país abre su tarjeta en Mi mapa', () => {
    expect(placeLink(place({ kind: 'country', key: 'JPN' }))).toEqual({
      commands: ['/'],
      queryParams: { pais: 'JPN' },
    });
  });

  it('un estado se resalta en Mi país', () => {
    expect(placeLink(place({ kind: 'subdivision', key: 'MX-OAX', country_iso3: 'MEX' }))).toEqual({
      commands: ['/mi-pais'],
      queryParams: { estado: 'MX-OAX' },
    });
  });

  it('una ciudad o un monumento llevan a su estancia', () => {
    expect(placeLink(place({ trip_id: 't1', stop_number: 3 }))).toEqual({
      commands: ['/viajes', 't1'],
      queryParams: { parada: 3 },
    });
    expect(placeLink(place({ kind: 'monument', trip_id: 't1', stop_number: null }))).toEqual({
      commands: ['/viajes', 't1'],
    });
  });

  it('una ciudad que solo es la casa va a Ciudades de Mi país (o a su país)', () => {
    expect(placeLink(place({ is_home: true, country_iso3: 'MEX' }))).toEqual({
      commands: ['/mi-pais'],
      queryParams: { pestana: 'ciudades' },
    });
    expect(placeLink(place({ is_home: true, country_iso3: 'ESP' }))).toEqual({
      commands: ['/'],
      queryParams: { pais: 'ESP' },
    });
  });
});

describe('searchOptions', () => {
  it('ordena lugares, viajes y recuerdos con su detalle', () => {
    const options = searchOptions(kyotoSearch);
    expect(options.map((o) => [o.group, o.title, o.detail])).toEqual([
      ['places', 'Kioto', 'Ciudad · Japón'],
      ['trips', 'Japón', '8–21 mar 2025 · pasa por Kioto'],
      ['memories', 'Fushimi Inari-taisha', 'Japón · mar 2025'],
    ]);
    expect(options[2].snippet).toContain('Fushimi Inari');
    expect(options[2].link).toEqual({
      commands: ['/viajes', kyotoSearch.memories[0].trip_id],
      queryParams: { parada: 3 },
    });
  });
});

describe('highlight', () => {
  it('marca la coincidencia sin importar acentos ni mayúsculas', () => {
    expect(highlight('Kiotó y Tokio', 'kioto')).toEqual([
      { text: 'Kiotó', match: true },
      { text: ' y Tokio', match: false },
    ]);
    expect(highlight('Pirámide del Sol', 'PIRAMIDE')[0]).toEqual({
      text: 'Pirámide',
      match: true,
    });
  });

  it('sin coincidencia deja el texto igual', () => {
    expect(highlight('Osaka', 'kioto')).toEqual([{ text: 'Osaka', match: false }]);
    expect(highlight('Osaka', '  ')).toEqual([{ text: 'Osaka', match: false }]);
  });
});
