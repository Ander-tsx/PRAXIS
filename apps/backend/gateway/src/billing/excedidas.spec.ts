import { PLANS, PlanTier, QuotaKind } from '@praxis/contracts';
import { excedidasDe } from './billing.controller';

/**
 * Los topes rebasados que se dibujan en Facturación.
 *
 * Lo que se comprueba aquí no es la resta: es que las tres formas de
 * equivocarse en esta función —el plan sin tope, el que está justo al borde y la
 * cifra que no se pudo medir— den las tres respuestas distintas que tienen que
 * dar. Ninguna de las tres produce un error si se falla.
 */
describe('excedidasDe', () => {
  const sinNada = { proyectos: 0, iaMensual: 0, asientos: 0, almacenamientoMb: 0 };

  it('no marca nada cuando todo cabe', () => {
    expect(excedidasDe(PLANS[PlanTier.TEAM].quotas, sinNada)).toEqual([]);
  });

  /**
   * 🔴 El caso de la trampa 4: nadie creó nada, bajó el techo. 40 proyectos que
   * cabían en Negocio no caben en Equipo.
   */
  it('marca los proyectos cuando el plan baja por debajo de lo que ya hay', () => {
    const excedidas = excedidasDe(PLANS[PlanTier.TEAM].quotas, { ...sinNada, proyectos: 40 });

    expect(excedidas).toEqual([{ kind: QuotaKind.PROYECTOS, tope: 25, actual: 40 }]);
  });

  /**
   * ⚠️ Estar exactamente al tope es estar lleno, no rebasado. Decirle «te has
   * pasado» a quien está justo donde compró es una acusación falsa.
   */
  it('no marca a quien está exactamente en el tope', () => {
    expect(excedidasDe(PLANS[PlanTier.TEAM].quotas, { ...sinNada, proyectos: 25 })).toEqual([]);
  });

  /**
   * 🔴 Con `SIN_TOPE` —que es `null`— un `actual > tope` suelto compara contra
   * cero, y el plan sin límite saldría como el único rebasado de los cuatro.
   */
  it('nunca marca un tope que no existe', () => {
    const excedidas = excedidasDe(PLANS[PlanTier.ENTERPRISE].quotas, {
      proyectos: 9_000,
      iaMensual: 0,
      asientos: 9_000,
      almacenamientoMb: 9_000_000,
    });

    expect(excedidas).toEqual([]);
  });

  /** `null` es «no se pudo medir», no «cero»: inventarse el aviso es peor. */
  it('no marca el almacenamiento cuando no se pudo medir', () => {
    const excedidas = excedidasDe(PLANS[PlanTier.FREE].quotas, {
      ...sinNada,
      almacenamientoMb: null,
    });

    expect(excedidas).toEqual([]);
  });

  /**
   * El menos evidente: gastar 200 mensajes con Negocio y bajar a Gratis deja a
   * alguien por encima el resto del mes, sin haber escrito nada más.
   */
  it('marca la IA del mes en curso tras una bajada de plan', () => {
    const excedidas = excedidasDe(PLANS[PlanTier.FREE].quotas, { ...sinNada, iaMensual: 200 });

    expect(excedidas).toEqual([{ kind: QuotaKind.IA_MENSUAL, tope: 13, actual: 200 }]);
  });
});
