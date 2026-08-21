import {
  PLANES_ENTERPRISE,
  PLANES_INDIVIDUALES,
  PLANS,
  PLAN_LIST,
  PlanAudience,
  PlanTier,
  SIN_TOPE,
  cabe,
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
    it('todo plan de pago sabe de qué variable sale su precio', () => {
      for (const plan of PLAN_LIST) {
        if (plan.tier === PlanTier.FREE) continue;
        expect(plan.envPrecio).toBeTruthy();
      }
    });

    it('FREE no se contrata y por eso no tiene precio', () => {
      expect(PLANS[PlanTier.FREE].envPrecio).toBeNull();
    });

    it('solo el intermedio individual da el mes gratis', () => {
      const conPrueba = PLAN_LIST.filter((plan) => plan.diasDePrueba > 0);
      expect(conPrueba.map((plan) => plan.tier)).toEqual([PlanTier.PLUS]);
      expect(PLANS[PlanTier.PLUS].diasDePrueba).toBe(30);
    });

    it('los planes por asiento son exactamente los de empresa', () => {
      const porAsiento = PLAN_LIST.filter((plan) => plan.porAsiento).map((plan) => plan.tier);
      const enterprise = PLANES_ENTERPRISE.map((plan) => plan.tier);
      expect(porAsiento).toEqual(enterprise);
    });

    it('las dos familias suman el catálogo entero y no se solapan', () => {
      expect(PLANES_INDIVIDUALES.length + PLANES_ENTERPRISE.length).toBe(PLAN_LIST.length);
      for (const plan of PLANES_INDIVIDUALES) {
        expect(plan.audience).toBe(PlanAudience.INDIVIDUAL);
      }
    });

    it('cada escalón de pago da al menos tanto como el anterior', () => {
      /* No es una comprobación cosmética: un plan más caro que diera menos de
         algo se descubre cuando alguien lo contrata y pierde acceso a lo que
         tenía, que es la peor forma posible de descubrirlo. */
      const escalera = [PlanTier.FREE, PlanTier.PLUS, PlanTier.PRO];
      for (let i = 1; i < escalera.length; i++) {
        const antes = PLANS[escalera[i - 1]].quotas;
        const ahora = PLANS[escalera[i]].quotas;
        for (const clave of ['proyectos', 'iaMensualPorPersona', 'miembrosPorProyecto'] as const) {
          const a = antes[clave];
          const b = ahora[clave];
          if (b === SIN_TOPE) continue;
          expect(a).not.toBe(SIN_TOPE);
          expect(b).toBeGreaterThanOrEqual(a as number);
        }
      }
    });
  });
});
