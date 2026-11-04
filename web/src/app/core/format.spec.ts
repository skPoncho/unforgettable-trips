import { userMap } from '../../testing/fixtures';
import { count, dateRange, monthYear, nextMilestone } from './format';
import { firstVisitYear } from './user-map';

describe('formatos', () => {
  it('mes y año en español de México', () => {
    expect(monthYear('2025-03-08')).toBe('mar 2025');
    expect(monthYear('2024-12-31')).toBe('dic 2024');
    // La fecha no se corre de día por la zona horaria.
    expect(monthYear('2023-10-01')).toBe('oct 2023');
  });

  it('rangos de fechas cortos', () => {
    expect(dateRange('2025-03-13')).toBe('13 mar 2025');
    expect(dateRange('2025-03-13', '2025-03-16')).toBe('13–16 mar 2025');
    expect(dateRange('2025-02-28', '2025-03-02')).toBe('28 feb – 2 mar 2025');
    expect(dateRange('2024-12-30', '2025-01-02')).toBe('30 dic 2024 – 2 ene 2025');
  });

  it('singular y plural', () => {
    expect(count(1, 'día', 'días')).toBe('1 día');
    expect(count(14, 'día', 'días')).toBe('14 días');
    expect(count(1200, 'foto', 'fotos')).toBe('1,200 fotos');
  });

  it('próximo hito de países', () => {
    expect(nextMilestone(0)).toBe(5);
    expect(nextMilestone(12)).toBe(15);
    expect(nextMilestone(15)).toBe(20);
    expect(nextMilestone(52)).toBe(60);
    expect(nextMilestone(194)).toBe(195);
    expect(nextMilestone(195)).toBeNull();
  });

  it('el primer año mira estados y ciudades, porque la casa no tiene fecha', () => {
    // Japón es de 2025, pero hay un estado de México (el país de casa) visitado en 2019.
    expect(firstVisitYear(userMap)).toBe(2019);
    expect(firstVisitYear({ ...userMap, countries: [], subdivisions: [], cities: [] })).toBeNull();
  });
});
