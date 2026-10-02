import { PlanTier, SIN_TOPE, SubscriptionStatus } from '@praxis/contracts';
import { mensajeSinAsientos, topeDeAsientos } from './asientos';

/**
 * Lo que se prueba aquí es **el agujero**, no la aritmética.
 *
 * Hasta 2026-09-09 la única puerta de asientos leía `Subscription.seats` —lo
 * contratado en Stripe— y nunca `quotas.asientos`. Cancelar dejaba el `seats`
 * de la última suscripción escrito en la fila, así que el plan gratuito seguía
 * admitiendo la gente que se pagaba en Equipo. Ninguna de estas comprobaciones
 * habría fallado antes por casualidad: la primera es exactamente el caso.
 */
describe('tope de asientos', () => {
  const vigente = (tier: PlanTier, seats: number) => ({
    tier,
    status: SubscriptionStatus.ACTIVE,
    seats,
  });

  it('🔴 una suscripción cancelada no contrata nada: manda el plan gratuito', () => {
    /* El webhook escribe `tier: FREE` y `status: CANCELED` pero conserva el
       `seats` de Stripe. Ese 15 es el recuerdo de lo que se pagaba. */
    const asientos = topeDeAsientos({
      tier: PlanTier.FREE,
      status: SubscriptionStatus.CANCELED,
      seats: 15,
    });

    expect(asientos.tope).toBe(3);
    expect(asientos.contratados).toBeNull();
    expect(asientos.loPoneElPlan).toBe(true);
  });

  it('sin ninguna fila de suscripción, también el gratuito', () => {
    expect(topeDeAsientos(null).tope).toBe(3);
    expect(topeDeAsientos(null).tier).toBe(PlanTier.FREE);
  });

  it('quien contrató menos de lo que admite su plan se queda con lo suyo', () => {
    const asientos = topeDeAsientos(vigente(PlanTier.TEAM, 5));

    expect(asientos.tope).toBe(5);
    expect(asientos.loPoneElPlan).toBe(false);
  });

  it('y si lo contratado se pasa del plan, recorta el plan', () => {
    /* No debería llegarse aquí comprando —el checkout ya lo comprueba— pero sí
       bajando de plan con los asientos puestos. */
    const asientos = topeDeAsientos(vigente(PlanTier.PRO, 15));

    expect(asientos.tope).toBe(7);
    expect(asientos.loPoneElPlan).toBe(true);
  });

  it('🔴 el plan sin tope no se convierte en el más restrictivo', () => {
    /* `Math.min(40, null)` sería 0. ENTERPRISE se quedaría sin poder invitar a
       nadie, y sin dar ningún error. */
    const asientos = topeDeAsientos(vigente(PlanTier.ENTERPRISE, 40));

    expect(asientos.tope).toBe(40);
    expect(asientos.loPoneElPlan).toBe(false);
  });

  it('el catálogo sigue teniendo un plan sin tope, que es de donde sale el caso', () => {
    const sinTope = topeDeAsientos({
      tier: PlanTier.ENTERPRISE,
      status: SubscriptionStatus.ACTIVE,
      seats: Number.MAX_SAFE_INTEGER,
    });

    expect(sinTope.tope).toBe(Number.MAX_SAFE_INTEGER);
    expect(SIN_TOPE).toBeNull();
  });

  describe('el mensaje', () => {
    it('si el corte lo pone el plan, la salida es ampliarlo', () => {
      const texto = mensajeSinAsientos(3, topeDeAsientos(null));

      expect(texto).toContain('ampliar el plan');
      expect(texto).toContain('Gratis');
    });

    it('si lo ponen los asientos comprados, la salida es comprar más', () => {
      const texto = mensajeSinAsientos(5, topeDeAsientos(vigente(PlanTier.TEAM, 5)));

      expect(texto).toContain('No quedan asientos: 5 de 5');
      expect(texto).not.toContain('ampliar el plan');
    });
  });
});
