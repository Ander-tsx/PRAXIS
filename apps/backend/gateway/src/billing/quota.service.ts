import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  PLANS,
  type PlanQuotas,
  PlanTier,
  QUOTA_EXCEEDED_CODE,
  type QuotaExceededDetails,
  QuotaKind,
  type SubscriptionStatus,
  type Tope,
  cabe,
  quotasDe,
} from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';

/** Lo que devuelve billing-service sobre el plan de alguien. */
export interface PlanEfectivo {
  userId: string;
  tier: PlanTier;
  quotas: PlanQuotas;
  status: SubscriptionStatus;
  organizationId: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
}

/**
 * Las cuotas, comprobadas **aquí**.
 *
 * ## Por qué en el gateway y no en billing-service
 *
 * Porque contar es distinto de saber el tope. billing-service sabe qué plan
 * tienes; quién sabe **cuántos proyectos** tienes es projects-service, y cuántos
 * mensajes llevas, assistant-service. El gateway es el único sitio que tiene a
 * los tres delante, así que poner la cuenta aquí evita que billing-service
 * necesite un cliente TCP por cada cosa medible.
 *
 * Es además donde ya se comprueban los permisos, y una cuota es la misma clase
 * de decisión: **la pantalla apaga botones, el servidor decide.**
 *
 * ## 402 y no 403
 *
 * ⚠️ Un 403 se arregla pidiéndole permiso a una persona. Un 402 no se arregla
 * con permisos: o se paga, o se borra algo. Meterlos en el mismo saco haría que
 * la interfaz ofreciera «pídeselo a quien administra el proyecto» a alguien que
 * lo administra él, que es la peor ayuda posible. El código va en
 * `error.code` (`QUOTA_EXCEEDED`) y el detalle lleva **qué** tope, cuánto es y
 * cuánto llevas — sin eso, la pantalla no puede ofrecer la salida correcta.
 *
 * ## Y el fallo hacia el lado permisivo, escrito y a propósito
 *
 * ⚠️ Si billing-service no contesta, `planDe` devuelve **FREE** y la escritura
 * se juzga contra el plan más restrictivo. Es lo contrario de lo que hacen los
 * fetch accesorios de la interfaz —donde `null` degrada— y es deliberado: un
 * fallo aquí no puede regalar el plan más caro. El precio es que una caída de
 * billing recorta a quien paga, y por eso se registra con nivel de error.
 */
@Injectable()
export class QuotaService {
  private readonly log = new Logger(QuotaService.name);

  constructor(
    @Inject('BILLING_SERVICE') private readonly billingClient: ClientProxy,
    @Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy,
  ) {}

  /** El plan que vale para alguien. FREE si billing-service no contesta. */
  async planDe(userId: string): Promise<PlanEfectivo> {
    try {
      const plan = await firstValueFrom(
        this.billingClient.send<PlanEfectivo>({ cmd: 'billing_plan_of' }, { userId }),
      );
      if (plan?.tier) return { ...plan, quotas: quotasDe(plan.tier) };
    } catch (error) {
      this.log.error(
        `billing-service no contestó por ${userId}; se aplica FREE: ${(error as Error).message}`,
      );
    }

    return {
      userId,
      tier: PlanTier.FREE,
      quotas: PLANS[PlanTier.FREE].quotas,
      status: 'ACTIVE' as SubscriptionStatus,
      organizationId: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAt: null,
    };
  }

  /* ─── Proyectos ────────────────────────────────────────────────────────── */

  /**
   * ¿Puede crear un proyecto más?
   *
   * ⚠️ **Cuenta los que sostiene, no en los que participa.** Si contara la
   * pertenencia, cualquiera podría dejarte sin poder crear proyectos
   * invitándote a los suyos.
   *
   * ⚠️ Y **no cuenta los `DELETED`**, que sí siguen en la base con su dueño
   * (ver `findOwned`). Un proyecto borrado no ocupa sitio en el plan: cobrar por
   * algo que ya no se ve es exactamente la clase de cuota que parece una avería.
   */
  async exigirProyecto(userId: string): Promise<void> {
    const plan = await this.planDe(userId);
    const tope = plan.quotas.proyectos;
    if (tope === null) return;

    const propios = await firstValueFrom(
      this.projectsClient.send<{ id: string; status: string }[]>(
        { cmd: 'project_find_owned' },
        { ownerId: userId },
      ),
    ).catch(() => null);

    if (propios === null) {
      /* No se pudo contar. Se deja pasar y se registra: negar una creación por
         no haber podido contar es un falso positivo que la persona no puede
         resolver de ninguna manera, y el tope se volverá a comprobar la próxima
         vez. Es la asimetría de siempre — un proyecto de más se borra. */
      this.log.error(`No se pudieron contar los proyectos de ${userId}: se deja crear.`);
      return;
    }

    const vivos = propios.filter((proyecto) => proyecto.status !== 'DELETED').length;
    this.exigir(cabe(vivos, tope), {
      kind: QuotaKind.PROYECTOS,
      tier: plan.tier,
      tope,
      actual: vivos,
    });
  }

  /* ─── Miembros de un proyecto ──────────────────────────────────────────── */

  /*
   * 🕳️ **Aquí había un tope de miembros por proyecto, y se retiró el
   * 2026-08-26 — pero lo que lo sustituye todavía no existe.**
   *
   * El tope vivía en `PlanQuotas.miembrosPorProyecto` y lo ponía el plan del
   * dueño del proyecto. Se retiró porque desde que **quien está en un proyecto
   * tiene que estar en la organización**, el techo de un tablero ya lo pone el
   * asiento: un segundo tope por proyecto era una cifra más que explicar y que
   * vigilar, midiendo algo que el asiento ya mide.
   *
   * ⚠️ **Lo que lo sustituye es la comprobación de asiento**, y no se puede
   * escribir todavía: necesita `Project.organizationId`, que llega en O3. Hasta
   * entonces **no hay ningún límite** en `POST /projects/:id/members` ni en
   * `POST /projects/:id/invitations`, y está escrito aquí y en los dos
   * controladores en vez de quedarse en silencio.
   *
   * Lo que hay que poner, cuando exista la columna:
   *   1. Sacar la organización del proyecto.
   *   2. Preguntar a billing si esa persona tiene asiento activo en ella.
   *   3. Si no, **403 con `NOT_IN_ORG_CODE`** — no un 402: no se ha agotado
   *      nada, es que no está dentro.
   *
   * Ver PLAN-ORGANIZACIONES.md, O3.7 y O4.3.
   */

  /* ─── El asistente ─────────────────────────────────────────────────────── */

  /**
   * Cuántos mensajes al mes le da su plan.
   *
   * ⚠️ **Esto no niega nada, solo transporta el número.** Quien lleva la cuenta
   * es assistant-service, que es donde está el contador; lo que no puede saber
   * es el tope, porque el plan de alguien puede venir de la organización de su
   * empresa y ese servicio no tiene esa tabla. Va en el payload de cada llamada.
   *
   * `null` significa **sin tope** —lo tiene BUSINESS en proyectos, no en IA— y
   * viaja tal cual: convertirlo aquí en un número grande sería inventarse un
   * límite que la pantalla acabaría enseñando.
   */
  async limiteDeIa(userId: string): Promise<number | null> {
    const plan = await this.planDe(userId);
    return plan.quotas.iaMensualPorPersona;
  }

  /**
   * El tope **y el plan del que sale**, en una sola resolución.
   *
   * ⚠️ Existe porque el 402 de la IA necesita las dos cosas y `planDe` cuesta un
   * viaje TCP: pedir el tope por un lado y el plan por otro serían dos, y —peor—
   * dos lecturas que pueden discrepar si alguien cambia de plan entre medias, con
   * el resultado de un mensaje que dice «tu plan Pro llega hasta 13».
   *
   * Lo consumen las dos rutas que **gastan** cuota (el chat y la plantilla de
   * arranque). Las que solo la **leen** siguen con `limiteDeIa`: ahí el plan no
   * hace falta y traerlo sería ancho de banda por nada.
   */
  async iaDe(userId: string): Promise<{ tier: PlanTier; limite: Tope }> {
    const plan = await this.planDe(userId);
    return { tier: plan.tier, limite: plan.quotas.iaMensualPorPersona };
  }

  /* ─── El motor ─────────────────────────────────────────────────────────── */

  /**
   * Lanza el 402 si no cabe.
   *
   * El mensaje se construye aquí y no en cada sitio para que las tres cuotas
   * digan lo mismo de la misma forma: **cuánto es el tope, cuánto llevas y qué
   * hacer**. Un «has llegado al límite» a secas obliga a ir a buscar el número.
   */
  private exigir(
    permitido: boolean,
    datos: { kind: QuotaKind; tier: PlanTier; tope: Tope; actual: number },
  ): void {
    if (permitido) return;

    const spec = PLANS[datos.tier];
    const detalle: QuotaExceededDetails = {
      kind: datos.kind,
      tier: datos.tier,
      tope: datos.tope ?? 0,
      actual: datos.actual,
    };

    throw new HttpException(
      {
        code: QUOTA_EXCEEDED_CODE,
        message: `${MENSAJES[datos.kind](datos.tope ?? 0)} Tu plan ${spec.nombre} llega hasta ahí.`,
        details: detalle,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

/**
 * Qué se le dice a quien se topa con cada cuota.
 *
 * ⚠️ **Cada una nombra su propia salida.** Quien se queda sin proyectos puede
 * borrar uno; quien se queda sin asientos en un tablero no puede hacer nada
 * salvo sacar a alguien o ampliar. Una frase genérica las trata igual y solo una
 * de las dos tiene arreglo por la vía barata.
 */
const MENSAJES: Record<QuotaKind, (tope: number) => string> = {
  [QuotaKind.PROYECTOS]: (tope) =>
    `Ya tienes ${tope} proyectos, que es todo lo que caben. Borra uno o amplía el plan.`,
  [QuotaKind.IA_MENSUAL]: (tope) =>
    `Has gastado los ${tope} mensajes de este mes. Vuelven el día 1, o amplía el plan.`,
  [QuotaKind.ASIENTOS]: (tope) =>
    `Tu organización ya tiene ${tope} asientos ocupados. Libera uno o amplía el plan.`,
  [QuotaKind.ORGANIZACIONES]: (tope) =>
    `Ya tienes ${tope} organizaciones, que es todo lo que caben en tu plan.`,
  [QuotaKind.AUTOMATIZACIONES]: (tope) =>
    `Este proyecto ya tiene ${tope} automatizaciones activas. Pausa una o amplía el plan.`,
  [QuotaKind.ALMACENAMIENTO]: (tope) =>
    `Los adjuntos de tu organización ocupan los ${tope} MB del plan. Borra alguno o amplía.`,
};
