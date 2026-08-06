import {
  MIN_DIAS_HISTORIAL,
  MIN_TAREAS_CERRADAS,
  acumularFlujo,
  evaluarSuficiencia,
  percentile,
  simularEntrega,
} from './statistics';

/**
 * La matemática de los informes.
 *
 * Va en pruebas **unitarias** y no end-to-end a propósito: son funciones puras,
 * y un percentil mal calculado no falla — devuelve un número creíble y
 * equivocado. Eso no se caza mirando si el endpoint responde 200; se caza
 * comparando contra valores que se pueden verificar a mano.
 *
 * Es la única parte de la plataforma donde el error no se ve.
 */

describe('percentile', () => {
  it('devuelve null sin datos', () => {
    expect(percentile([], 0.5)).toBeNull();
  });

  it('con un solo valor devuelve ese valor', () => {
    expect(percentile([7], 0.5)).toBe(7);
    expect(percentile([7], 0.95)).toBe(7);
  });

  it('la mediana de un número impar de valores es el del medio', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it('la mediana de un número par interpola entre los dos centrales', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it('no le importa el orden de entrada', () => {
    expect(percentile([5, 1, 4, 2, 3], 0.5)).toBe(3);
  });

  it('p0 y p100 son el mínimo y el máximo', () => {
    const valores = [10, 20, 30, 40];
    expect(percentile(valores, 0)).toBe(10);
    expect(percentile(valores, 1)).toBe(40);
  });

  /**
   * El caso que motiva usar percentiles y no la media.
   *
   * Nueve tareas de un día y una que se eternizó. La media dice 10,8 días —un
   * número que no describe ni el caso típico ni el malo—. La mediana dice 1.
   */
  it('la cola larga mueve la media y no la mediana', () => {
    const conColaLarga = [1, 1, 1, 1, 1, 1, 1, 1, 1, 100];
    const media = conColaLarga.reduce((a, b) => a + b, 0) / conColaLarga.length;

    expect(media).toBeCloseTo(10.9);
    expect(percentile(conColaLarga, 0.5)).toBe(1);
  });

  it('no muta el array que recibe', () => {
    const original = [3, 1, 2];
    percentile(original, 0.5);
    expect(original).toEqual([3, 1, 2]);
  });
});

describe('evaluarSuficiencia', () => {
  it('con datos de sobra, suficiente y sin faltantes', () => {
    const r = evaluarSuficiencia(MIN_TAREAS_CERRADAS + 5, MIN_DIAS_HISTORIAL + 5);
    expect(r.suficiente).toBe(true);
    expect(r.faltanTareas).toBe(0);
    expect(r.faltanDias).toBe(0);
  });

  it('justo en el mínimo ya es suficiente', () => {
    expect(evaluarSuficiencia(MIN_TAREAS_CERRADAS, MIN_DIAS_HISTORIAL).suficiente).toBe(true);
  });

  it('basta con que falte una de las dos condiciones', () => {
    expect(evaluarSuficiencia(MIN_TAREAS_CERRADAS, MIN_DIAS_HISTORIAL - 1).suficiente).toBe(false);
    expect(evaluarSuficiencia(MIN_TAREAS_CERRADAS - 1, MIN_DIAS_HISTORIAL).suficiente).toBe(false);
  });

  it('dice cuánto falta, y nunca en negativo', () => {
    const r = evaluarSuficiencia(3, 2);
    expect(r.faltanTareas).toBe(MIN_TAREAS_CERRADAS - 3);
    expect(r.faltanDias).toBe(MIN_DIAS_HISTORIAL - 2);

    const sobrado = evaluarSuficiencia(100, 100);
    expect(sobrado.faltanTareas).toBe(0);
    expect(sobrado.faltanDias).toBe(0);
  });
});

describe('simularEntrega', () => {
  it('sin nada pendiente no hay nada que predecir', () => {
    expect(simularEntrega({ throughputDiario: [1, 2], pendientes: 0 })).toBeNull();
  });

  it('sin historial tampoco', () => {
    expect(simularEntrega({ throughputDiario: [], pendientes: 5 })).toBeNull();
  });

  /**
   * ⚠️ El caso que colgaría el servidor: un tablero donde nunca se cerró nada.
   * Sin este corte, el bucle no terminaría — `restantes` no baja jamás.
   */
  it('si nunca se cerró nada, devuelve null en vez de girar en vacío', () => {
    expect(simularEntrega({ throughputDiario: [0, 0, 0], pendientes: 5 })).toBeNull();
  });

  it('con ritmo constante, el resultado es el aritmético', () => {
    /* Dos por día, diez pendientes: cinco días, sin varianza que interpretar. */
    const r = simularEntrega({ throughputDiario: [2, 2, 2], pendientes: 10, iteraciones: 200 });
    expect(r).not.toBeNull();
    expect(r!.p50).toBe(5);
    expect(r!.p85).toBe(5);
    expect(r!.p95).toBe(5);
  });

  it('los percentiles van en orden: p50 ≤ p85 ≤ p95', () => {
    const r = simularEntrega({ throughputDiario: [0, 1, 2, 3, 5], pendientes: 20 });
    expect(r).not.toBeNull();
    expect(r!.p50).toBeLessThanOrEqual(r!.p85);
    expect(r!.p85).toBeLessThanOrEqual(r!.p95);
  });

  it('más pendientes nunca predice menos días', () => {
    const pocas = simularEntrega({ throughputDiario: [2, 2, 2], pendientes: 4, iteraciones: 500 })!;
    const muchas = simularEntrega({
      throughputDiario: [2, 2, 2],
      pendientes: 40,
      iteraciones: 500,
    })!;
    expect(muchas.p85).toBeGreaterThan(pocas.p85);
  });

  it('un ritmo casi nulo se satura en el tope en vez de colgarse', () => {
    /* Un cierre cada mucho y muchísimo pendiente: la respuesta honesta es «así
       no se acaba», y se expresa saturando en 365. */
    const r = simularEntrega({
      throughputDiario: [0, 0, 0, 0, 1],
      pendientes: 5000,
      iteraciones: 50,
    });
    expect(r!.p95).toBe(365);
  });
});

describe('acumularFlujo', () => {
  const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

  it('sin filas devuelve una serie vacía', () => {
    expect(acumularFlujo([], ['a', 'b'])).toEqual([]);
  });

  it('acumula el saldo día a día en vez de repetir el movimiento', () => {
    const serie = acumularFlujo(
      [
        { day: dia('2026-01-01'), columnId: 'a', entradas: 3, salidas: 0 },
        { day: dia('2026-01-02'), columnId: 'a', entradas: 2, salidas: 1 },
      ],
      ['a'],
    );

    expect(serie).toHaveLength(2);
    expect(serie[0].porColumna.a).toBe(3);
    /* 3 + (2 − 1) = 4. Si diera 1, estaría pintando el movimiento del día y no
       lo que hay en la columna, que es lo que hace ilegible un flujo acumulado. */
    expect(serie[1].porColumna.a).toBe(4);
  });

  it('cada columna lleva su propio acumulado', () => {
    const serie = acumularFlujo(
      [
        { day: dia('2026-01-01'), columnId: 'a', entradas: 5, salidas: 0 },
        { day: dia('2026-01-01'), columnId: 'b', entradas: 0, salidas: 0 },
        { day: dia('2026-01-02'), columnId: 'a', entradas: 0, salidas: 2 },
        { day: dia('2026-01-02'), columnId: 'b', entradas: 2, salidas: 0 },
      ],
      ['a', 'b'],
    );

    expect(serie[1].porColumna).toEqual({ a: 3, b: 2 });
  });

  it('una columna sin movimiento arrastra su valor al día siguiente', () => {
    const serie = acumularFlujo(
      [
        { day: dia('2026-01-01'), columnId: 'a', entradas: 4, salidas: 0 },
        { day: dia('2026-01-02'), columnId: 'b', entradas: 1, salidas: 0 },
      ],
      ['a', 'b'],
    );

    /* El día 2 no tocó la columna `a`, pero sigue habiendo 4 tarjetas ahí. */
    expect(serie[1].porColumna.a).toBe(4);
    expect(serie[1].porColumna.b).toBe(1);
  });

  it('las columnas declaradas salen desde el primer día, aunque estén vacías', () => {
    const serie = acumularFlujo(
      [{ day: dia('2026-01-01'), columnId: 'a', entradas: 1, salidas: 0 }],
      ['a', 'b', 'c'],
    );

    /* Sin esto, una banda aparece a media gráfica el día que recibe su primera
       tarjeta, y parece que la columna se creó ese día. */
    expect(Object.keys(serie[0].porColumna).sort()).toEqual(['a', 'b', 'c']);
    expect(serie[0].porColumna.b).toBe(0);
  });

  it('las filas sin columna se ignoran', () => {
    const serie = acumularFlujo(
      [
        { day: dia('2026-01-01'), columnId: null, entradas: 9, salidas: 0 },
        { day: dia('2026-01-01'), columnId: 'a', entradas: 1, salidas: 0 },
      ],
      ['a'],
    );

    expect(serie[0].porColumna).toEqual({ a: 1 });
  });

  it('ordena por día aunque las filas lleguen desordenadas', () => {
    const serie = acumularFlujo(
      [
        { day: dia('2026-01-03'), columnId: 'a', entradas: 1, salidas: 0 },
        { day: dia('2026-01-01'), columnId: 'a', entradas: 5, salidas: 0 },
      ],
      ['a'],
    );

    /* El día 2 no traía filas, pero sale igual con el acumulado heredado. */
    expect(serie.map((p) => p.day)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(serie[1].porColumna.a).toBe(5);
    expect(serie[2].porColumna.a).toBe(6);
  });

  /**
   * Los días sin actividad **sí** salen, heredando el acumulado.
   *
   * Antes no: solo se emitían los días con alguna fila, así que un fin de semana
   * tranquilo desaparecía de la serie y el eje de tiempo dejaba de ser uniforme.
   * En un flujo acumulado la pendiente es la lectura, y tres días de pendiente
   * dibujados como uno dicen otra cosa.
   */
  it('rellena los días intermedios sin actividad', () => {
    const serie = acumularFlujo(
      [
        { day: dia('2026-01-01'), columnId: 'a', entradas: 2, salidas: 0 },
        { day: dia('2026-01-04'), columnId: 'a', entradas: 1, salidas: 0 },
      ],
      ['a'],
    );

    expect(serie.map((p) => p.day)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
    ]);

    /* Los días tranquilos conservan lo que había, no bajan a cero. */
    expect(serie[1].porColumna.a).toBe(2);
    expect(serie[2].porColumna.a).toBe(2);
    expect(serie[3].porColumna.a).toBe(3);
  });

  it('no inventa días fuera del rango observado', () => {
    const serie = acumularFlujo(
      [{ day: dia('2026-01-05'), columnId: 'a', entradas: 1, salidas: 0 }],
      ['a'],
    );

    /* La ventana la elige quien llama; aquí no se extrapola. */
    expect(serie.map((p) => p.day)).toEqual(['2026-01-05']);
  });
});
