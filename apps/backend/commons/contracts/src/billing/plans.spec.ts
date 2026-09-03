import {
  PLANES_AUTOSERVICIO,
  PLANS,
  PLAN_LIST,
  PLAN_RANK,
  PlanContratacion,
  type PlanQuotas,
  PlanTier,
  SIN_TOPE,
  cabe,
  mejorPlan,
  quedan,
  quotasDe,
} from './plans';

/**
 * Lo que se prueba aquí es **el helper que evita el fallo silencioso**, no el
 * catálogo. Los números se cambian a mano y una prueba que los repita solo
 * obliga a cambiarlos dos veces; `cabe()` con un tope a `null` es otra cosa: es
 * la única función del repositorio que se interpone entre el plan sin límite y
 * un `actual < null`, que en JavaScript es `false` y convierte el plan más caro
 * en el más restrictivo sin dar ningún error.
 */
describe('cuotas de un plan', () => {
  describe('cabe', () => {
    it('deja crecer mientras quede sitio', () => {
      expect(cabe(0, 2)).toBe(true);
      expect(cabe(1, 2)).toBe(true);
    });

    it('corta justo al llegar al tope, no después', () => {
      expect(cabe(2, 2)).toBe(false);
      expect(cabe(3, 2)).toBe(false);
    });

    it('🔴 con un tope inexistente siempre cabe, incluso con cifras altas', () => {
      /* Esta es la prueba que importa: `10_000 < null` es `false`, así que un
         `<` a mano aquí habría negado la creación en el plan que no tiene
         tope. */
      expect(cabe(0, SIN_TOPE)).toBe(true);
      expect(cabe(10_000, SIN_TOPE)).toBe(true);
    });

    it('un tope de cero no deja crear nada', () => {
      expect(cabe(0, 0)).toBe(false);
    });
  });

  describe('quedan', () => {
    it('no baja de cero aunque se haya pasado', () => {
      expect(quedan(5, 2)).toBe(0);
    });

    it('sin tope no hay cuenta atrás que enseñar', () => {
      expect(quedan(5, SIN_TOPE)).toBe(SIN_TOPE);
    });
  });

  describe('quotasDe', () => {
    it('un plan desconocido cae a FREE en vez de romperse', () => {
      /* Puede llegar de la base de datos: una fila escrita por una versión
         posterior, o un enum ampliado sin desplegar el gateway. Que caiga al
         más restrictivo es lo seguro; que reviente deja sin servicio a alguien
         que sí paga. */
      expect(quotasDe('CUALQUIER_COSA')).toEqual(PLANS[PlanTier.FREE].quotas);
      expect(quotasDe(null)).toEqual(PLANS[PlanTier.FREE].quotas);
    });
  });

  describe('el catálogo', () => {
    it('todo plan que se compre solo sabe de qué variable sale su precio', () => {
      for (const plan of PLANES_AUTOSERVICIO) {
        expect(plan.envPrecio).toBeTruthy();
      }
    });

    it('los que no se compran solos no tienen precio, y dicen por qué', () => {
      /* Los dos tienen `envPrecio: null` por razones opuestas: a FREE no se le
         puede pagar, y a ENTERPRISE hay que escribirle. Deducirlo de la
         ausencia del precio deja a la pantalla enseñando el botón equivocado y
         no da ningún error: por eso el motivo va en `contratacion`. */
      expect(PLANS[PlanTier.FREE].envPrecio).toBeNull();
      expect(PLANS[PlanTier.FREE].contratacion).toBe(PlanContratacion.NINGUNA);

      expect(PLANS[PlanTier.ENTERPRISE].envPrecio).toBeNull();
      expect(PLANS[PlanTier.ENTERPRISE].contratacion).toBe(PlanContratacion.CONTACTO);
    });

    it('solo el primer peldaño de pago da el mes gratis', () => {
      const conPrueba = PLAN_LIST.filter((plan) => plan.diasDePrueba > 0);
      expect(conPrueba.map((plan) => plan.tier)).toEqual([PlanTier.TEAM]);
      expect(PLANS[PlanTier.TEAM].diasDePrueba).toBe(30);
    });

    it('el orden declarado y el de la tabla de precios son el mismo', () => {
      /* Con dos escaleras esto no se podía comprobar —no había orden total— y
         `PLAN_RANK` tenía que escribirse a mano sin nada que lo vigilara. Con
         una sola, que los dos se separen es un error de verdad: `mejorPlan`
         decidiría un plan distinto del que la tabla presenta como superior. */
      const porRango = [...PLAN_LIST].sort((a, b) => PLAN_RANK[a.tier] - PLAN_RANK[b.tier]);
      expect(porRango.map((plan) => plan.tier)).toEqual(PLAN_LIST.map((plan) => plan.tier));
    });

    it('cada escalón da al menos tanto como el anterior, salvo la IA por persona', () => {
      /* No es una comprobación cosmética: un plan más caro que diera menos de
         algo se descubre cuando alguien lo contrata y pierde acceso a lo que
         tenía, que es la peor forma posible de descubrirlo.

         Se comprueba sobre **todas** las claves de golpe, y además que
         `SIN_TOPE`, una vez aparece, ya no vuelve atrás.

         ⚠️ **`iaMensualPorPersona` queda fuera, y es una excepción escrita, no
         un agujero.** Pro da 150 y Equipo 100: Pro no vende tamaño, vende
         intensidad —cinco proyectos y el asistente sin contar—, así que en ese
         eje concreto la escalera no es monótona a propósito.

         🔴 **La consecuencia es real y hay que saberla:** alguien que suba de
         Pro a Equipo pasa de 150 mensajes al mes a 100. Es lo que este `it`
         avisaba, y se acepta porque el motivo de subir a Equipo es meter gente,
         no preguntar más. Lo que **no** se acepta —y sí se comprueba, en el `it`
         de abajo— es que baje el techo total. */
      const ejes = (Object.keys(PLANS[PlanTier.FREE].quotas) as (keyof PlanQuotas)[]).filter(
        (eje) => eje !== 'iaMensualPorPersona',
      );

      for (let i = 1; i < PLAN_LIST.length; i++) {
        const antes = PLAN_LIST[i - 1];
        const ahora = PLAN_LIST[i];

        for (const eje of ejes) {
          const a = antes.quotas[eje];
          const b = ahora.quotas[eje];

          if (a === SIN_TOPE) {
            // Quitar un «sin tope» al subir de plan es quitarle algo a quien paga más.
            expect(b).toBe(SIN_TOPE);
            continue;
          }
          if (b === SIN_TOPE) continue;
          expect(b).toBeGreaterThanOrEqual(a as number);
        }
      }
    });

    it('el techo total de IA no baja al subir de plan', () => {
      /* La invariante que sustituye a la del eje suelto, y la que de verdad
         protege el modelo: lo que cuesta dinero no son los mensajes por persona
         sino **los mensajes**, y su techo es ese número por los asientos.

         Pro llega a 750 (150 × 5) y Equipo a 1500 (100 × 15), así que la
         escalera sigue subiendo donde importa aunque el eje por persona baje.
         Si alguien vuelve a mover uno de los dos números, esto salta. */
      const techo = (plan: (typeof PLAN_LIST)[number]): number => {
        const porPersona = plan.quotas.iaMensualPorPersona;
        const asientos = plan.quotas.asientos;
        if (porPersona === SIN_TOPE || asientos === SIN_TOPE) return Number.POSITIVE_INFINITY;
        return porPersona * asientos;
      };

      for (let i = 1; i < PLAN_LIST.length; i++) {
        expect(techo(PLAN_LIST[i])).toBeGreaterThanOrEqual(techo(PLAN_LIST[i - 1]));
      }
    });

    it('los mínimos de asientos no bajan al subir de plan', () => {
      for (let i = 1; i < PLAN_LIST.length; i++) {
        expect(PLAN_LIST[i].asientosMinimos).toBeGreaterThanOrEqual(
          PLAN_LIST[i - 1].asientosMinimos,
        );
      }
    });

    it('ningún plan permite más asientos de los que exige como mínimo', () => {
      /* Un mínimo de compra por encima del tope del propio plan es un plan que
         no se puede contratar: el checkout lo rechazaría y el botón seguiría
         ahí. */
      for (const plan of PLAN_LIST) {
        expect(cabe(plan.asientosMinimos - 1, plan.quotas.asientos)).toBe(true);
      }
    });
  });
});
