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
   * Cuánto lleva gastado, **sin gastar nada**.
   *
   * Lo pide el chat al abrirse para pintar el contador. No crea la fila de
   * consumo: un mes en el que no se escribió ningún mensaje no tiene por qué
   * dejar rastro.
   */
  async estado(userId: string): Promise<AssistantQuota> {
    const period = this.periodo();
    const [plan, uso] = await Promise.all([
      this.plan(userId),
      this.prisma.assistantUsage.findUnique({ where: { userId_period: { userId, period } } }),
    ]);

    return {
      plan,
      usados: uso?.used ?? 0,
      limite: ASSISTANT_LIMITS[plan],
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
  async consumir(userId: string): Promise<AssistantQuota> {
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
      limite: ASSISTANT_LIMITS[plan],
      periodo: period,
      reinicia: this.reinicio(),
    };
  }
}
