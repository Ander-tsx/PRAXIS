import { alReanudar, enReposo, marcarActividad } from './actividad';

describe('actividad del proceso', () => {
  const antes = { ...process.env };

  beforeEach(() => {
    process.env.PRAXIS_REPOSO_MS = '1000';
  });

  afterEach(() => {
    process.env = { ...antes };
  });

  it('con procesos separados nunca entra en reposo', () => {
    delete process.env.PRAXIS_TRANSPORT;
    marcarActividad(0);
    expect(enReposo(10_000_000)).toBe(false);
  });

  it('en el monolito entra en reposo pasado el plazo sin mensajes', () => {
    process.env.PRAXIS_TRANSPORT = 'local';
    marcarActividad(0);
    expect(enReposo(500)).toBe(false);
    expect(enReposo(1000)).toBe(false);
    expect(enReposo(1001)).toBe(true);
  });

  it('al salir de reposo avisa una vez, y no mientras está en uso', () => {
    process.env.PRAXIS_TRANSPORT = 'local';
    const avisos: number[] = [];
    const baja = alReanudar(() => avisos.push(1));

    marcarActividad(0);
    marcarActividad(500);
    expect(avisos).toHaveLength(0);

    marcarActividad(5000);
    expect(avisos).toHaveLength(1);

    marcarActividad(5100);
    expect(avisos).toHaveLength(1);

    baja();
    marcarActividad(20_000);
    expect(avisos).toHaveLength(1);
  });

  it('un oyente que falla no impide que despierten los demás', () => {
    process.env.PRAXIS_TRANSPORT = 'local';
    let despierto = false;
    const b1 = alReanudar(() => {
      throw new Error('roto');
    });
    const b2 = alReanudar(() => {
      despierto = true;
    });
    marcarActividad(0);
    marcarActividad(10_000);
    expect(despierto).toBe(true);
    b1();
    b2();
  });
});
