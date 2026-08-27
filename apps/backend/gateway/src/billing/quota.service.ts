import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  NOT_IN_ORG_CODE,
  OrganizationPermission,
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
   * En qué organización va a caer un proyecto, y si quien lo crea puede.
   *
   * Tres comprobaciones seguidas, y **cada una falla distinto** porque cada una
   * se arregla de otra forma:
   *
   * 1. **¿Estás dentro?** — `403 NOT_IN_ORG`. Se arregla con un asiento.
   * 2. **¿Puedes crear aquí?** — `403 FORBIDDEN`. Se arregla con un papel.
   * 3. **¿Queda sitio?** — `402 QUOTA_EXCEEDED`. Se arregla pagando o borrando.
   *
   * 🔴 **Sin organización elegida cae en la personal**, que es lo correcto para
   * quien solo tiene una: la pantalla ni siquiera enseña el selector en ese
   * caso. Lo que **no** puede pasar es aceptar la que venga en el cuerpo sin
   * comprobar nada — sería meter un proyecto en la organización de cualquiera
   * escribiendo su identificador.
   */
  async resolverOrganizacionParaProyecto(datos: {
    userId: string;
    organizationId?: string;
    /** Para poder nombrar la organización personal si hay que crearla. */
    nombre?: string;
    email?: string;
  }): Promise<string> {
    if (!datos.organizationId) {
      const personal = await firstValueFrom(
        this.billingClient.send<{ id: string }>(
          { cmd: 'billing_personal_org' },
          { userId: datos.userId, name: datos.nombre, email: datos.email },
        ),
      );
      return personal.id;
    }

    const permisos = await firstValueFrom(
      this.billingClient.send<{ permisos: Record<string, boolean> } | null>(
        { cmd: 'billing_org_permissions' },
        { organizationId: datos.organizationId, userId: datos.userId },
      ),
    ).catch(() => null);

    if (!permisos) {
      throw new ForbiddenException({
        code: NOT_IN_ORG_CODE,
        message: 'No perteneces a esa organización.',
      });
    }
    if (!permisos.permisos[OrganizationPermission.CAN_CREATE_PROJECT]) {
      throw new ForbiddenException(
        'Tu papel en esta organización no permite crear proyectos aquí.',
      );
    }

    return datos.organizationId;
  }

  /**
   * ¿Cabe un proyecto más en esta organización?
   *
   * 🔴 **Por organización, no por persona, y ese es el cambio de 2026-08-26.**
   * Antes contaba los que sostenía cada cuenta, y con el plan prometiendo
   * «veinticinco proyectos» eso significaba veinticinco **para cada miembro** en
   * vez de veinticinco para el equipo. Poner la columna sin mover este contador
   * habría dejado un plan que promete una cosa y da otra, sin que nada fallara.
   *
   * ⚠️ **No cuenta los `DELETED`.** Cobrar por algo que ya no se ve es
   * exactamente la clase de cuota que parece una avería.
   *
   * ⚠️ Y si **no se puede contar**, se deja pasar y se registra: negar una
   * creación por no haber podido contar es un falso positivo que quien lo sufre
   * no puede resolver de ninguna manera. Es la asimetría de siempre — un
   * proyecto de más se borra.
   */
  async exigirProyecto(userId: string, organizationId: string): Promise<void> {
    const plan = await this.planDe(userId);
    const tope = plan.quotas.proyectos;
    if (tope === null) return;

    const deLaOrganizacion = await firstValueFrom(
      this.projectsClient.send<{ id: string; status: string }[]>(
        { cmd: 'project_find_by_organization' },
        { organizationId },
      ),
    ).catch(() => null);

    if (deLaOrganizacion === null) {
      this.log.error(`No se pudieron contar los proyectos de ${organizationId}: se deja crear.`);
      return;
    }

    const vivos = deLaOrganizacion.filter((proyecto) => proyecto.status !== 'DELETED').length;
    if (cabe(vivos, tope)) return;

    /* 🔴 **Solo en el camino del fallo, y solo por esto.** Quien ve el 402 puede
       no ser quien puede resolverlo: en un equipo de diez, nueve no tocan la
       tarjeta de la empresa. La pantalla necesita saberlo para ofrecer «avisa a
       quien administra» en vez de un botón de pagar que esa persona no puede
       pulsar — y un botón así se lee como una avería.

       Es una llamada TCP de más, pero solo cuando ya se va a negar la escritura:
       en el camino normal no cuesta nada. */
    const permisos = await firstValueFrom(
      this.billingClient.send<{ permisos: Record<string, boolean> } | null>(
        { cmd: 'billing_org_permissions' },
        { organizationId, userId },
      ),
    ).catch(() => null);

    this.exigir(false, {
      kind: QuotaKind.PROYECTOS,
      tier: plan.tier,
      tope,
      actual: vivos,
      /* Sin respuesta se omite, que la pantalla lee como «no se sabe» y ofrece
         la salida igual. Esconderle el camino a quien sí puede pagar cuesta más
         que enseñárselo a quien no. */
      extras: permisos
        ? { puedeAmpliar: permisos.permisos[OrganizationPermission.CAN_MANAGE_BILLING] === true }
        : {},
    });
  }

  /* ─── Miembros de un proyecto ──────────────────────────────────────────── */

  /**
   * ¿Puede esta persona estar en este proyecto?
   *
   * 🔴 **Tiene que tener asiento en la organización del proyecto**, y esta es la
   * regla que sostiene todo el modelo de precios. Si se pudiera meter a alguien
   * de fuera, nadie compraría un asiento nunca: se invitaría a todo el mundo
   * como «externo» y el plan sería decorativo.
   *
   * ⚠️ **Sustituye al tope de miembros por proyecto**, que se retiró en O1. Aquel
   * lo ponía el plan del dueño del proyecto y medía algo que el asiento ya mide;
   * este mide lo que de verdad cuesta dinero.
   *
   * ⚠️ **Es un `403 NOT_IN_ORG`, no un `402`.** No se ha agotado nada: esa
   * persona no está dentro. La salida es darle un asiento, que es otra pantalla
   * y otra conversación que «amplía el plan».
   *
   * ⚠️ Y si **no se puede comprobar**, se deja pasar y se registra. Misma
   * asimetría que el resto: negar por no haber podido preguntar es un falso
   * positivo que quien lo sufre no puede resolver, y a un miembro de más se le
   * saca.
   */
  async exigirAsientoEnProyecto(projectId: string, userId: string): Promise<void> {
    const proyecto = await firstValueFrom(
      this.projectsClient.send<{ organizationId?: string } | null>(
        { cmd: 'project_find_one' },
        { id: projectId },
      ),
    ).catch(() => null);

    if (!proyecto?.organizationId) {
      this.log.error(`No se supo de qué organización es ${projectId}: se deja invitar.`);
      return;
    }

    const dentro = await firstValueFrom(
      this.billingClient.send<boolean>(
        { cmd: 'billing_org_is_member' },
        { organizationId: proyecto.organizationId, userId },
      ),
    ).catch(() => null);

    if (dentro === null) {
      this.log.error(`billing-service no contestó por ${userId}: se deja invitar.`);
      return;
    }
    if (!dentro) {
      throw new ForbiddenException({
        code: NOT_IN_ORG_CODE,
        message:
          'Esa persona no tiene asiento en la organización de este proyecto. Dale uno antes de añadirla.',
      });
    }
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
    datos: {
      kind: QuotaKind;
      tier: PlanTier;
      tope: Tope;
      actual: number;
      /**
       * Lo que la pantalla necesita además del número.
       *
       * ⚠️ **Antes este helper reconstruía el detalle con cuatro campos fijos y
       * tiraba en silencio todo lo demás.** Añadir un dato al 402 «funcionaba»
       * —compilaba, y el objeto llegaba hasta aquí— pero no salía por la
       * respuesta, y el síntoma era una pantalla que se comportaba como si el
       * dato no existiera. Los extras pasan explícitos.
       */
      extras?: Partial<QuotaExceededDetails>;
    },
  ): void {
    if (permitido) return;

    const spec = PLANS[datos.tier];
    const detalle: QuotaExceededDetails = {
      kind: datos.kind,
      tier: datos.tier,
      tope: datos.tope ?? 0,
      actual: datos.actual,
      ...datos.extras,
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
  /* ⚠️ Dice «esta organización» y no «ya tienes», porque desde 2026-08-26 el
     tope se cuenta **por organización**: quien ve el mensaje puede no ser quien
     puede resolverlo. Un «ya tienes 3 proyectos» a alguien que no tiene ninguno
     suyo se lee como una avería. */
  [QuotaKind.PROYECTOS]: (tope) =>
    `Esta organización ya tiene ${tope} proyectos, que es todo lo que caben. Borra uno o amplía el plan.`,
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
