import { Injectable } from '@nestjs/common';
import { ASSISTANT_LIMITE_POR_DEFECTO, type AssistantQuota } from '@praxis/contracts';

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
 * ## Una fila por organización y mes, no un contador que se reinicia
 *
 * ⚠️ **La organización entró en la clave el 2026-08-28.** El tope lo da el plan
 * de la organización en la que se está trabajando, así que el gasto tiene que
 * contarse en el mismo sitio: contar en un cubo y negar contra otro deja a
 * alguien bloqueado nada más entrar en su espacio personal, sin nada que lo
 * explique.
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

  /**
   * Cuántos mensajes tiene al mes.
   *
   * ⚠️ **El tope lo decide billing-service y llega desde fuera; esto es la red
   * de abajo.** Desde la etapa Enterprise hay cinco planes y el de alguien puede
   * venir de la organización de su empresa, que este servicio no conoce: el
   * gateway resuelve el número y lo pasa en el payload.
   *
   * `ASSISTANT_LIMITE_POR_DEFECTO` se queda como valor por defecto y **no es decorativo**:
   * es lo que responde si alguien llama a este servicio por TCP sin pasar por el
   * gateway, y sin él ese camino daría `undefined`, que comparado con `>=` es
   * siempre falso — o sea, mensajes infinitos y ni un error.
   */
  private limite(desdeFuera?: number | null): number {
    return typeof desdeFuera === 'number' && desdeFuera >= 0
      ? desdeFuera
      : ASSISTANT_LIMITE_POR_DEFECTO;
  }

  /**
   * Cuánto lleva gastado, **sin gastar nada**.
   *
   * Lo pide el chat al abrirse para pintar el contador. No crea la fila de
   * consumo: un mes en el que no se escribió ningún mensaje no tiene por qué
   * dejar rastro.
   */
  async estado(
    userId: string,
    limiteMensual?: number | null,
    organizationId?: string | null,
  ): Promise<AssistantQuota> {
    const period = this.periodo();
    const org = organizationId ?? '';
    const uso = await this.prisma.assistantUsage.findUnique({
      where: { userId_organizationId_period: { userId, organizationId: org, period } },
    });

    return {
      usados: uso?.used ?? 0,
      limite: this.limite(limiteMensual),
      periodo: period,
      reinicia: this.reinicio(),
    };
  }

  /*
   * 🕳️ Aquí vivían `cambiarPlan`, `planesDe`, `facturacionDe`,
   * `vincularSuscripcion` y `porSuscripcion`, con el modelo
   * `AssistantSubscription` debajo.
   *
   * 🔴 **Era un sistema de suscripción entero, por persona y paralelo al de
   * verdad**, anterior a las organizaciones: un plan `FREE`/`PRO` que se
   * concedía a mano desde el panel de administración, con su propio cliente de
   * Stripe y su propio webhook.
   *
   * Desde la etapa Enterprise, el tope de IA lo decide el plan de la
   * **organización** y llega en el payload (`limiteMensual`), así que de todo
   * esto solo quedaba en pie el campo `plan` de la respuesta — que además podía
   * contradecir al tope: `{ plan: 'PRO', limite: 13 }` para quien tuviera el PRO
   * viejo dentro de una organización gratuita.
   *
   * Las tres de facturación estaban **muertas desde antes**: sus
   * `MessagePattern` seguían publicados y no las llamaba nadie —billing-service
   * tiene las suyas (`porSuscripcionDeStripe`)— porque el cliente de Stripe pasó
   * a ser de la organización, no de la persona.
   *
   * Retirado el 2026-09-03. Ver `docs/AUDITORIA-PLANES.md` (P5-P7).
   */

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
  async consumir(
    userId: string,
    limiteMensual?: number | null,
    organizationId?: string | null,
  ): Promise<AssistantQuota> {
    const period = this.periodo();
    /* Cadena vacía y no `null`: es la clave del índice único. Ver el modelo. */
    const org = organizationId ?? '';

    const uso = await this.prisma.assistantUsage.upsert({
      where: { userId_organizationId_period: { userId, organizationId: org, period } },
      create: { userId, organizationId: org, period, used: 1 },
      update: { used: { increment: 1 } },
    });

    return {
      usados: uso.used,
      limite: this.limite(limiteMensual),
      periodo: period,
      reinicia: this.reinicio(),
    };
  }
}
