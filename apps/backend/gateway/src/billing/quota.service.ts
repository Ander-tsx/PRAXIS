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

  /**
   * ¿Cabe otro miembro en este proyecto?
   *
   * ⚠️ **El tope lo pone el plan del DUEÑO del proyecto, no el de quien
   * invita.** Es su proyecto el que crece, y al revés un invitado con plan
   * grande podría meter gente en el tablero de alguien que paga el pequeño.
   */
  async exigirMiembro(datos: {
    ownerUserId: string;
    miembrosActuales: number;
  }): Promise<void> {
    const plan = await this.planDe(datos.ownerUserId);
    const tope = plan.quotas.miembrosPorProyecto;

    this.exigir(cabe(datos.miembrosActuales, tope), {
      kind: QuotaKind.MIEMBROS_POR_PROYECTO,
      tier: plan.tier,
      tope,
      actual: datos.miembrosActuales,
    });
  }

  /**
   * ¿Cabe otro miembro en este proyecto? Contando por él mismo.
   *
   * Es la versión que usan los controladores: sabe sacar el dueño y la cuenta a
   * partir del proyecto, para que la comprobación sea una sola línea allí donde
   * se escribe.
   *
   * ⚠️ **Las invitaciones pendientes cuentan.** Es la misma razón por la que un
   * asiento invitado ocupa asiento: si no contaran, se podrían mandar veinte
   * sobre un tope de cinco y el límite se rompería en el momento de aceptarlas
   * —con el proyecto ya por encima del plan y nadie que haya hecho nada mal—.
   *
   * ⚠️ Y si no se puede contar, **se deja pasar** y se registra. Negar por no
   * haber podido contar es un falso positivo que quien lo sufre no puede
   * resolver de ninguna manera; un miembro de más se saca.
   */
  async exigirMiembroDeProyecto(projectId: string): Promise<void> {
    const [proyecto, miembros, invitaciones] = await Promise.all([
      firstValueFrom(
        this.projectsClient.send<{ ownerId: string } | null>(
          { cmd: 'project_find_one' },
          { id: projectId },
        ),
      ).catch(() => null),
      firstValueFrom(
        this.projectsClient.send<unknown[]>({ cmd: 'member_find_all' }, { projectId }),
      ).catch(() => null),
      firstValueFrom(
        this.projectsClient.send<unknown[]>({ cmd: 'invitation_find_for_project' }, { projectId }),
      ).catch(() => []),
    ]);

    if (!proyecto?.ownerId || miembros === null) {
      this.log.error(`No se pudo contar la gente de ${projectId}: se deja invitar.`);
      return;
    }

    await this.exigirMiembro({
      ownerUserId: proyecto.ownerId,
      miembrosActuales: miembros.length + (invitaciones?.length ?? 0),
    });
  }

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
  [QuotaKind.MIEMBROS_POR_PROYECTO]: (tope) =>
    `Este proyecto ya tiene ${tope} miembros, que es todo lo que caben. Saca a alguien o amplía el plan.`,
};
