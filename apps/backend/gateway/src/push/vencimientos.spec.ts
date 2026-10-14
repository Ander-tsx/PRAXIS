import { modoPorDefecto, textoDelAviso, tramoDe } from './vencimientos';

describe('vencimientos', () => {
  // 12:00 en México = 18:00 UTC.
  const mediodia = Date.UTC(2026, 9, 14, 18, 0, 0);
  // 00:00 en México = 06:00 UTC.
  const medianoche = Date.UTC(2026, 9, 14, 6, 0, 0);

  it('mediodía avisa de hoy y medianoche de mañana', () => {
    expect(modoPorDefecto(mediodia)).toBe('hoy');
    expect(modoPorDefecto(medianoche)).toBe('manana');
    /* Un retraso del cron no cambia de modo. */
    expect(modoPorDefecto(medianoche + 3 * 3600_000)).toBe('manana');
    expect(modoPorDefecto(mediodia + 3 * 3600_000)).toBe('hoy');
  });

  it('el tramo de hoy es el día natural de México', () => {
    expect(tramoDe('hoy', mediodia)).toEqual({
      from: '2026-10-14T06:00:00.000Z',
      to: '2026-10-15T06:00:00.000Z',
    });
  });

  it('a medianoche, «mañana» es el día natural siguiente', () => {
    /* 00:00 MX del 14 → mañana es el 15 en México: [15 06:00Z, 16 06:00Z). */
    expect(tramoDe('manana', medianoche)).toEqual({
      from: '2026-10-15T06:00:00.000Z',
      to: '2026-10-16T06:00:00.000Z',
    });
  });

  it('una tarea con título y varias con resumen', () => {
    expect(textoDelAviso('hoy', ['Entregar informe'])).toEqual({
      title: 'Vence hoy',
      body: 'Entregar informe',
    });
    expect(textoDelAviso('manana', ['a', 'b']).title).toBe('2 tareas vencen mañana');
  });
});
