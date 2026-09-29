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

  /* El caso normal: no se ha bajado de plan, así que el tope que aplica es el
     del plan. Los dos números coinciden salvo después de cancelar o bajar. */
  const TOPE_TEAM = PLANS[PlanTier.TEAM].quotas.asientos;
  const TOPE_FREE = PLANS[PlanTier.FREE].quotas.asientos;

  it('no marca nada cuando todo cabe', () => {
    expect(excedidasDe(PLANS[PlanTier.TEAM].quotas, sinNada, TOPE_TEAM)).toEqual([]);
  });

  /**
   * 🔴 El caso de la trampa 4: nadie creó nada, bajó el techo. 40 proyectos que
   * cabían en Negocio no caben en Equipo.
   */
  it('marca los proyectos cuando el plan baja por debajo de lo que ya hay', () => {
    const excedidas = excedidasDe(
      PLANS[PlanTier.TEAM].quotas,
      { ...sinNada, proyectos: 40 },
      TOPE_TEAM,
    );

    expect(excedidas).toEqual([{ kind: QuotaKind.PROYECTOS, tope: 25, actual: 40 }]);
  });

  /**
   * ⚠️ Estar exactamente al tope es estar lleno, no rebasado. Decirle «te has
   * pasado» a quien está justo donde compró es una acusación falsa.
   */
  it('no marca a quien está exactamente en el tope', () => {
    expect(
      excedidasDe(PLANS[PlanTier.TEAM].quotas, { ...sinNada, proyectos: 25 }, TOPE_TEAM),
    ).toEqual([]);
  });

  /**
   * 🔴 Con `SIN_TOPE` —que es `null`— un `actual > tope` suelto compara contra
   * cero, y el plan sin límite saldría como el único rebasado de los cuatro.
   */
  it('nunca marca un tope que no existe', () => {
    const excedidas = excedidasDe(
      PLANS[PlanTier.ENTERPRISE].quotas,
      { proyectos: 9_000, iaMensual: 0, asientos: 9_000, almacenamientoMb: 9_000_000 },
      PLANS[PlanTier.ENTERPRISE].quotas.asientos,
    );

    expect(excedidas).toEqual([]);
  });

  /** `null` es «no se pudo medir», no «cero»: inventarse el aviso es peor. */
  it('no marca el almacenamiento cuando no se pudo medir', () => {
    const excedidas = excedidasDe(
      PLANS[PlanTier.FREE].quotas,
      { ...sinNada, almacenamientoMb: null },
      TOPE_FREE,
    );

    expect(excedidas).toEqual([]);
  });

  /**
   * El menos evidente: gastar 200 mensajes con Negocio y bajar a Gratis deja a
   * alguien por encima el resto del mes, sin haber escrito nada más.
   */
  it('marca la IA del mes en curso tras una bajada de plan', () => {
    const excedidas = excedidasDe(
      PLANS[PlanTier.FREE].quotas,
      /* Tokens PRAX desde 2026-09-29: el gratuito da 250.000 al mes. */
      { ...sinNada, iaMensual: 400_000 },
      TOPE_FREE,
    );

    expect(excedidas).toEqual([{ kind: QuotaKind.IA_MENSUAL, tope: 250_000, actual: 400_000 }]);
  });
  /**
   * 🔴 **El tope de asientos no sale del plan, y por eso es un parámetro.**
   *
   * Es el caso que esta función contestaba mal: una organización con el plan
   * Equipo —25 asientos— que solo contrató 5 y tiene 7 personas dentro. Contra
   * `quotas.asientos` salen «7 de 25, todo bien», mientras
   * `QuotaService.exigirAsientoVivo` congela a dos con el tope efectivo
   * `min(5, 25)`. La pantalla decía que no pasaba nada sobre gente que ya estaba
   * en solo lectura, que es el peor sitio donde puede fallar un aviso: quien
   * podía ampliar el plan no tenía forma de enterarse.
   */
  it('marca los asientos contra lo contratado, no contra lo que admite el plan', () => {
    const excedidas = excedidasDe(
      PLANS[PlanTier.TEAM].quotas,
      { ...sinNada, asientos: 7 },
      /* `min(seats=5, quotas.asientos=25)`, que es lo que trae `seatsCap`. */
      5,
    );

    expect(excedidas).toEqual([{ kind: QuotaKind.ASIENTOS, tope: 5, actual: 7 }]);
  });

  /** Y con el tope del plan a secas no se marcaría nada: la prueba de arriba
      pasaría igual sin el parámetro si no se comprobara también esto. */
  it('no marcaba nada mirando solo el plan, que es lo que se estaba haciendo', () => {
    const excedidas = excedidasDe(
      PLANS[PlanTier.TEAM].quotas,
      { ...sinNada, asientos: 7 },
      TOPE_TEAM,
    );

    expect(excedidas).toEqual([]);
  });
});
