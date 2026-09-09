import {
  PLANS,
  PlanTier,
  type SubscriptionStatus,
  type Tope,
  estaVigente,
  menorTope,
  quotasDe,
} from '@praxis/contracts';

/** Lo mínimo de una suscripción para saber cuánta gente cabe. */
export interface SuscripcionParaAsientos {
  tier: string;
  status: string;
  /** Lo que se le compró a Stripe. Ver abajo por qué no basta. */
  seats: number;
}

/** El tope de asientos, con de dónde sale, para poder explicarlo. */
export interface TopeDeAsientos {
  /** Cuánta gente cabe. `null` = sin tope (solo ENTERPRISE). */
  tope: Tope;
  /** Lo contratado en Stripe, o `null` si no hay suscripción vigente. */
  contratados: number | null;
  /** El plan que se está aplicando. */
  tier: PlanTier;
  /**
   * Si el corte lo pone el plan y no lo contratado.
   *
   * Es lo que decide qué se le dice a quien administra: comprar más asientos, o
   * subir de plan. No es lo mismo y solo una de las dos resuelve.
   */
  loPoneElPlan: boolean;
}

/**
 * Cuánta gente cabe de verdad en una organización.
 *
 * 🔴 **Es `min(contratado, lo que admite el plan)`, y hasta 2026-09-09 solo se
 * miraba lo contratado.** Los dos números existen y significan cosas distintas:
 * `Subscription.seats` es lo que se le compró a Stripe y `quotas.asientos` es el
 * techo del plan. Mirar solo el primero deja un agujero que se abre justo al
 * cancelar: el webhook escribe `tier: FREE` pero **conserva** el `seats` de la
 * última suscripción (`seats: subscription.items.data[0]?.quantity`), así que una
 * organización que pagaba quince se queda en el plan gratuito invitando a quince.
 * El gratuito promete tres. Es la tercera vez que aparece el mismo patrón —una
 * cuota escrita en `plans.ts` que no invoca nadie—; las dos anteriores están en
 * CLAUDE.md, trampas 20 y 23.
 *
 * Al revés no recorta nada: quien contrató cinco de los quince que admite Equipo
 * sigue con cinco, que es lo que paga.
 *
 * ⚠️ **Sin suscripción vigente el tope es el del plan gratuito, no el `seats` de
 * la fila.** Una suscripción cancelada o impagada no contrata nada; su número es
 * el recuerdo de lo que se pagó, y leerlo es justo el agujero de arriba.
 *
 * ⚠️ **Esto no congela a nadie.** Quien ya está dentro sigue dentro y sigue
 * escribiendo; lo único que cambia es que no se puede meter a uno más. Congelar
 * la cola es el resto de `docs/PLAN-ASIENTOS-CONGELADOS.md` y va aparte a
 * propósito: este arreglo se podía entregar solo (A1) y el otro tiene cinco
 * preguntas sin contestar.
 */
export function topeDeAsientos(suscripcion: SuscripcionParaAsientos | null): TopeDeAsientos {
  const vigente =
    suscripcion && estaVigente(suscripcion.status as SubscriptionStatus) ? suscripcion : null;

  const tier = (vigente?.tier as PlanTier) ?? PlanTier.FREE;
  const delPlan = quotasDe(tier).asientos;

  if (!vigente) {
    return { tope: delPlan, contratados: null, tier, loPoneElPlan: true };
  }

  const tope = menorTope(vigente.seats, delPlan);
  return {
    tope,
    contratados: vigente.seats,
    tier,
    loPoneElPlan: tope !== null && tope < vigente.seats,
  };
}

/**
 * El «no quedan asientos», dicho por su motivo de verdad.
 *
 * ⚠️ **Hay dos motivos y la salida no es la misma.** Si el corte lo ponen los
 * asientos contratados, se compran más; si lo pone el plan, comprar más no sirve
 * de nada —hay que subir de plan—. Un solo mensaje para los dos casos manda a
 * quien administra a la pantalla que no le va a resolver nada, que es la misma
 * lección de `PROJECT_SUSPENDED` frente a un `FORBIDDEN` corriente.
 */
export function mensajeSinAsientos(ocupados: number, asientos: TopeDeAsientos): string {
  return asientos.loPoneElPlan
    ? `El plan ${PLANS[asientos.tier].nombre} admite ${asientos.tope} asientos y ya están ocupados ${ocupados}, contando las invitaciones pendientes. Para meter a más gente hay que ampliar el plan.`
    : `No quedan asientos: ${ocupados} de ${asientos.tope} ocupados, contando las invitaciones pendientes.`;
}
