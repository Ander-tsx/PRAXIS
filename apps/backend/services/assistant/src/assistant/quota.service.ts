import { Injectable } from '@nestjs/common';
import { ASSISTANT_LIMITS, type AssistantPlanName, type AssistantQuota } from '@praxis/contracts';

import { PrismaService } from '../prisma/prisma.service';

/**
 * La cuota mensual del asistente.
 *
 * ## Por qué esto necesita una tabla
 *
 * Un contador que gobierna un coste real no puede vivir solo en Redis: un
 * `FLUSHALL` —que es una operación normal en una caché— le regalaría 500
 * mensajes a todo el mundo. Y como el plan es un dato del usuario y no un
 * contador desechable, acaba siendo una tabla de todas formas. Es el motivo
 * entero por el que existe este microservicio.
 *
 * ## Una fila por mes, no un contador que se reinicia
 *
 * Reiniciar un contador borra la única prueba de cuánto se usó esto. El
 * histórico de consumo es lo primero que hará falta el día que haya planes de
 * verdad, y guardarlo ahora no cuesta nada.
 */
@Injectable()
export class QuotaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * El periodo actual, `YYYY-MM`, en **hora local del servidor**.
   *
   * No en UTC: quien mira el contador lo lee contra su calendario, y un reinicio
   * que ocurre a las seis de la tarde del día 31 es más raro de explicar que
   * cualquier problema que esto pueda causar.
   */
  private periodo(fecha = new Date()): string {
    return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
  }

  /** El día 1 del mes que viene: cuándo vuelve a cero. */
  private reinicio(fecha = new Date()): string {
    return new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1).toISOString();
  }

  /** Sin fila de suscripción = FREE. Ver la nota del modelo en el esquema. */
  private async plan(userId: string): Promise<AssistantPlanName> {
    const fila = await this.prisma.assistantSubscription.findUnique({ where: { userId } });
    return (fila?.plan ?? 'FREE') as AssistantPlanName;
  }

  /**
   * Cuántos mensajes tiene al mes.
   *
   * ⚠️ **El tope lo decide billing-service y llega desde fuera; esto es la red
   * de abajo.** Desde la etapa Enterprise hay cinco planes y el de alguien puede
   * venir de la organización de su empresa, que este servicio no conoce: el
   * gateway resuelve el número y lo pasa en el payload.
   *
   * `ASSISTANT_LIMITS` se queda como valor por defecto y **no es decorativo**:
   * es lo que responde si alguien llama a este servicio por TCP sin pasar por el
   * gateway, y sin él ese camino daría `undefined`, que comparado con `>=` es
   * siempre falso — o sea, mensajes infinitos y ni un error.
   */
  private limite(plan: AssistantPlanName, desdeFuera?: number | null): number {
    return typeof desdeFuera === 'number' && desdeFuera >= 0 ? desdeFuera : ASSISTANT_LIMITS[plan];
  }

  /**
   * Cuánto lleva gastado, **sin gastar nada**.
   *
   * Lo pide el chat al abrirse para pintar el contador. No crea la fila de
   * consumo: un mes en el que no se escribió ningún mensaje no tiene por qué
   * dejar rastro.
   */
  async estado(userId: string, limiteMensual?: number | null): Promise<AssistantQuota> {
    const period = this.periodo();
    const [plan, uso] = await Promise.all([
      this.plan(userId),
      this.prisma.assistantUsage.findUnique({ where: { userId_period: { userId, period } } }),
    ]);

    return {
      plan,
      usados: uso?.used ?? 0,
      limite: this.limite(plan, limiteMensual),
      periodo: period,
      reinicia: this.reinicio(),
    };
  }

  /**
   * Cambia el plan de una persona.
   *
   * ⚠️ **Aquí no se comprueba quién llama, y no es un descuido.** Este servicio
   * habla por TCP dentro de la red privada y no sabe de sesiones ni de roles;
   * quien exige ser administrador de la plataforma es el gateway, en la ruta que
   * llega hasta aquí. Repetir la comprobación exigiría traerse el rol global a
   * este esquema, que pertenece a credentials-service.
   *
   * `upsert` porque **no hay fila hasta que hace falta**: la mayoría de las
   * cuentas nunca han tenido suscripción, y pasar a PRO es justo el momento en
   * que empieza a existir. Volver a FREE deja la fila puesta con ese valor, que
   * es equivalente a no tenerla.
   */
  async cambiarPlan(
    userId: string,
    plan: AssistantPlanName,
  ): Promise<{ userId: string; plan: AssistantPlanName }> {
    const fila = await this.prisma.assistantSubscription.upsert({
      where: { userId },
      create: { userId, plan },
      update: { plan },
    });

    return { userId: fila.userId, plan: fila.plan as AssistantPlanName };
  }

  /**
   * El plan de varias personas de una vez.
   *
   * Lo pide el panel de administración para su lista: una consulta por fila
   * serían veinte llamadas TCP para pintar una tabla. Devuelve un diccionario y
   * **omite a quien no tiene fila**, que es quien está en FREE — el consumidor
   * ya sabe cuál es el valor por defecto.
   */
  async planesDe(userIds: string[]): Promise<Record<string, AssistantPlanName>> {
    if (userIds.length === 0) return {};

    const filas = await this.prisma.assistantSubscription.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, plan: true },
    });

    return Object.fromEntries(filas.map((fila) => [fila.userId, fila.plan as AssistantPlanName]));
  }

  /* ─── Facturación ─────────────────────────────────────────────────── */

  /**
   * Lo que Stripe necesita saber de una persona antes de cobrarle.
   *
   * Devuelve el cliente que ya tuviera, si lo tiene. Reutilizarlo es lo que
   * mantiene su historial de facturación en un solo sitio: crear un cliente
   * nuevo en cada compra funciona, pero parte los recibos de la misma persona
   * entre varios clientes que Stripe no relaciona entre sí.
   */
  async facturacionDe(userId: string): Promise<{ stripeCustomerId: string | null }> {
    const fila = await this.prisma.assistantSubscription.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    });
    return { stripeCustomerId: fila?.stripeCustomerId ?? null };
  }

  /**
   * Aplica lo que dijo Stripe: el plan y sus identificadores.
   *
   * ⚠️ **Es idempotente, y tiene que serlo.** Stripe reintenta un webhook hasta
   * que le contestas 2xx, así que el mismo pago puede llegar aquí varias veces;
   * también manda eventos solapados —`checkout.session.completed` y
   * `customer.subscription.updated`— que describen el mismo hecho. Un `upsert`
   * que escribe el estado final, en vez de un incremento o una transición,
   * hace que repetirlo no cambie nada.
   */
  async vincularSuscripcion(datos: {
    userId: string;
    plan: AssistantPlanName;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
  }): Promise<{ userId: string; plan: AssistantPlanName }> {
    const { userId, plan, stripeCustomerId, stripeSubscriptionId } = datos;

    const fila = await this.prisma.assistantSubscription.upsert({
      where: { userId },
      create: { userId, plan, stripeCustomerId, stripeSubscriptionId },
      /* Los ids solo se escriben si vienen. Una baja llega sin ellos y no debe
         borrar el cliente: esa persona puede volver a suscribirse y su
         historial tiene que seguir colgando del mismo cliente de Stripe. */
      update: {
        plan,
        ...(stripeCustomerId && { stripeCustomerId }),
        ...(stripeSubscriptionId && { stripeSubscriptionId }),
      },
    });

    return { userId: fila.userId, plan: fila.plan as AssistantPlanName };
  }

  /**
   * De quién es una suscripción de Stripe.
   *
   * Hace falta para las bajas: el webhook de `customer.subscription.deleted`
   * **no trae nuestro `userId`** —Stripe no lo conoce fuera del momento del
   * checkout—, solo sus propios identificadores.
   */
  async porSuscripcion(stripeSubscriptionId: string): Promise<{ userId: string } | null> {
    const fila = await this.prisma.assistantSubscription.findUnique({
      where: { stripeSubscriptionId },
      select: { userId: true },
    });
    return fila ?? null;
  }

  /**
   * Consume un mensaje.
   *
   * ⚠️ **Se llama DESPUÉS de una respuesta correcta de Gemini, nunca antes.** Si
   * Gemini falla no se cobra: cobrar por un error que no es del usuario es la
   * clase de detalle que hace que la gente deje de fiarse del contador.
   *
   * La contrapartida se asume y se dice: alguien podría provocar errores para no
   * gastar cuota. Es irrelevante — le costaría más trabajo que el que ahorra.
   *
   * El `upsert` con `increment` deja la suma **en la base**, no en JavaScript:
   * dos pestañas escribiendo a la vez no se pisan el contador.
   */
  async consumir(userId: string, limiteMensual?: number | null): Promise<AssistantQuota> {
    const period = this.periodo();

    const uso = await this.prisma.assistantUsage.upsert({
      where: { userId_period: { userId, period } },
      create: { userId, period, used: 1 },
      update: { used: { increment: 1 } },
    });

    const plan = await this.plan(userId);

    return {
      plan,
      usados: uso.used,
      limite: this.limite(plan, limiteMensual),
      periodo: period,
      reinicia: this.reinicio(),
    };
  }
}
