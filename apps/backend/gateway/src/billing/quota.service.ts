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
  MAX_ORGANIZACIONES_PROPIAS,
  NOT_IN_ORG_CODE,
  OrganizationPermission,
  PLANS,
  type PlanQuotas,
  PlanTier,
  QUOTA_EXCEEDED_CODE,
  type QuotaExceededDetails,
  QuotaKind,
  SEAT_FROZEN_CODE,
  type SeatFrozenDetails,
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
    /* Solo para el correo de quien entra en una organización: billing-service no
       tiene directorio y la fila del asiento necesita una dirección propia. Ver
       `exigirAsientoEnProyecto`. */
    @Inject('CREDENTIALS_SERVICE') private readonly credentialsClient: ClientProxy,
    /* Los dos que **cuentan** las cuotas que faltaban. Ninguno decide nada: uno
       sabe cuántas reglas activas tiene un proyecto y el otro cuántos bytes
       ocupan sus adjuntos, y el tope contra el que se comparan solo lo tiene
       este servicio. Ver la cabecera de la clase. */
    @Inject('AUTOMATION_SERVICE') private readonly automationClient: ClientProxy,
    @Inject('TASKS_SERVICE') private readonly tasksClient: ClientProxy,
  ) {}

  /**
   * El plan que vale para alguien **dentro de una organización**.
   *
   * 🔴 **La organización es obligatoria de facto, aunque el tipo la deje pasar
   * nula.** Desde 2026-08-28 el plan vale solo dentro de la organización que lo
   * paga, así que llamar a esto sin decir dónde devuelve FREE — el peldaño más
   * bajo— y nunca «el mejor que tengas». Si una ruta nueva no sabe qué
   * organización pasar, la respuesta correcta es averiguarlo, no omitirlo.
   *
   * ⚠️ **Y de dónde sale ese identificador importa más que el identificador.**
   * Nunca de la cookie `praxis_org`, que la escribe el navegador: o se deriva del
   * recurso (un proyecto sabe en qué organización está) o viene en el cuerpo y se
   * **valida la pertenencia antes de usarlo**, como hace
   * `resolverOrganizacionParaProyecto`. billing-service comprueba la membresía
   * por su cuenta y devuelve FREE ante una organización ajena, así que esto es
   * cinturón y tirantes — pero el cinturón se pone aquí.
   *
   * ⚠️ FREE también si billing-service no contesta. Ver la nota de la clase: un
   * fallo aquí no puede regalar el plan más caro.
   */
  async planDe(userId: string, organizationId?: string | null): Promise<PlanEfectivo> {
    try {
      const plan = await firstValueFrom(
        this.billingClient.send<PlanEfectivo>(
          { cmd: 'billing_plan_of' },
          { userId, organizationId: organizationId ?? null },
        ),
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
      organizationId: organizationId ?? null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAt: null,
    };
  }

  /**
   * ¿Cabe otra organización a nombre de esta persona?
   *
   * 🔴 **El tope existía escrito y no se comprobaba en ningún sitio.**
   * `organizacionesPropias` tenía valor en los cuatro planes y `QuotaKind.
   * ORGANIZACIONES` tenía hasta su mensaje de error, pero ninguna ruta lo
   * invocaba: hasta 2026-08-28 se podían crear sin límite.
   *
   * ⚠️ **Y ya no depende del plan**, que es lo que lo hacía incoherente: si el
   * plan vale solo dentro de su organización, uno que te deje crear más
   * organizaciones se está escapando de ella. Es una constante,
   * `MAX_ORGANIZACIONES_PROPIAS`.
   *
   * ⚠️ **Si no se puede contar, se deja crear.** La misma asimetría que en
   * proyectos: negar por no haber podido contar es un falso positivo que quien lo
   * sufre no puede resolver de ninguna manera, y una organización de más se
   * borra.
   */
  async exigirOrganizacion(userId: string): Promise<void> {
    const propias = await firstValueFrom(
      this.billingClient.send<number>({ cmd: 'billing_orgs_owned_count' }, { userId }),
    ).catch(() => null);

    if (propias === null) {
      this.log.error(`No se pudieron contar las organizaciones de ${userId}: se deja crear.`);
      return;
    }

    if (cabe(propias, MAX_ORGANIZACIONES_PROPIAS)) return;

    /* Sin `puedeAmpliar`: este tope no se amplía pagando —no es de ningún
       plan— así que ofrecer el botón de mejorar sería mandar a alguien a una
       pantalla que no arregla lo que le acaba de pasar. */
    throw new HttpException(
      {
        code: QUOTA_EXCEEDED_CODE,
        message:
          `Ya tienes ${MAX_ORGANIZACIONES_PROPIAS} organizaciones a tu nombre, que es el máximo. ` +
          'Borra una que no uses, o pide que te inviten a la que necesitas.',
        details: {
          kind: QuotaKind.ORGANIZACIONES,
          tier: PlanTier.FREE,
          tope: MAX_ORGANIZACIONES_PROPIAS,
          actual: propias,
          puedeAmpliar: false,
        } satisfies QuotaExceededDetails,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  /**
   * De qué organización es un proyecto.
   *
   * ⚠️ **Es la forma correcta de resolver la organización en una ruta que tiene
   * proyecto**, y la única que no se puede falsificar: sale del recurso, no de
   * lo que mande el cliente. Toda ruta anidada bajo `/projects/:id` que necesite
   * saber en qué organización está trabajando alguien pasa por aquí.
   *
   * `null` si no se puede averiguar. Quien llame decide qué hacer con eso —lo
   * habitual es seguir con FREE, que es el peldaño más bajo—, nunca inventarse
   * una organización.
   */
  async organizacionDelProyecto(projectId: string): Promise<string | null> {
    const proyecto = await firstValueFrom(
      this.projectsClient.send<{ organizationId?: string } | null>(
        { cmd: 'project_find_one' },
        { id: projectId },
      ),
    ).catch(() => null);

    return proyecto?.organizationId ?? null;
  }

  /**
   * En qué organización trabaja alguien cuando **no hay proyecto** que lo diga.
   *
   * ## Por qué hace falta y por qué no vale la cookie
   *
   * Las rutas de PRAX sin proyecto (`/me/assistant/*`) gastan cuota, y desde
   * 2026-08-28 la cuota es de una organización. No tienen recurso del que
   * derivarla, así que la elige quien llama — y por eso **se valida antes de
   * usarla**. La cookie `praxis_org` no sirve: la escribe el navegador, y un
   * identificador ajeno ahí daría el plan de otra empresa.
   *
   * ## Qué hace cada rama
   *
   * - **Con organización**: se comprueba la pertenencia. Sin ella, `403
   *   NOT_IN_ORG` — no es un problema de permisos, es que no estás dentro, y la
   *   salida es un asiento.
   * - **Sin organización**: cae en la **personal**, que todo el mundo tiene.
   *   ⚠️ Se busca en la lista cacheada, no con `billing_personal_org`, que la
   *   **crea** si no existe: esto se llama al abrir un chat, y una lectura no
   *   puede acabar escribiendo una fila. Si no hay ninguna, `null` → FREE, que
   *   es exactamente lo que diría la fila.
   */
  async organizacionElegida(
    userId: string,
    organizationId?: string | null,
  ): Promise<string | null> {
    if (organizationId) {
      const dentro = await firstValueFrom(
        this.billingClient.send<boolean>(
          { cmd: 'billing_org_is_member' },
          { organizationId, userId },
        ),
      ).catch(() => null);

      if (dentro !== true) {
        throw new ForbiddenException({
          code: NOT_IN_ORG_CODE,
          message: 'No perteneces a esa organización.',
        });
      }
      return organizationId;
    }

    const suyas = await firstValueFrom(
      this.billingClient.send<{ id: string; kind: string }[]>(
        { cmd: 'billing_orgs_of' },
        { userId },
      ),
    ).catch(() => [] as { id: string; kind: string }[]);

    return suyas.find((organizacion) => organizacion.kind === 'PERSONAL')?.id ?? null;
  }

  /**
   * ¿Comparten estas dos personas alguna organización?
   *
   * Es la puerta del chat privado desde 2026-08-28. Antes lo era «compartís
   * algún proyecto», que dejaba fuera a alguien de tu propio equipo al que
   * todavía no habías metido en ningún tablero — y no protegía nada más, porque
   * quien está en un proyecto está por fuerza en su organización.
   *
   * ⚠️ **Se apoya en `billing_orgs_of`, que está cacheado en Redis.** Es la
   * misma lista que pide la barra lateral en cada carga de cada zona, así que
   * preguntarla aquí no añade consultas — solo dos lecturas de caché.
   *
   * ⚠️ **Ante un fallo, `false`.** Es lo contrario de lo que hacen las cuotas,
   * donde no poder contar deja pasar. Aquí no cabe la misma asimetría: esto no
   * es un tope que se resuelve borrando algo, es quién puede escribirle a quién,
   * y dejar pasar por no haber podido comprobarlo abre el chat a toda la
   * plataforma.
   */
  async compartenOrganizacion(unUsuario: string, otroUsuario: string): Promise<boolean> {
    const suyas = (ids: { id: string }[]) => new Set(ids.map((organizacion) => organizacion.id));

    const [unas, otras] = await Promise.all([
      firstValueFrom(
        this.billingClient.send<{ id: string }[]>(
          { cmd: 'billing_orgs_of' },
          { userId: unUsuario },
        ),
      ).catch(() => null),
      firstValueFrom(
        this.billingClient.send<{ id: string }[]>(
          { cmd: 'billing_orgs_of' },
          { userId: otroUsuario },
        ),
      ).catch(() => null),
    ]);

    if (!unas || !otras) {
      this.log.error(
        `No se pudo comprobar si ${unUsuario} y ${otroUsuario} comparten organización: se niega.`,
      );
      return false;
    }

    const deUno = suyas(unas);
    return otras.some((organizacion) => deUno.has(organizacion.id));
  }

  /**
   * Todo el mundo con quien compartes organización, por id.
   *
   * Es la lista que define **con quién puedes hablar** y **a quién se le anuncia
   * tu presencia**, y las dos tienen que salir del mismo sitio: si la presencia
   * se calculara con otra regla, se le anunciaría el estado a gente a la que no
   * puedes escribir, o al revés — un punto de color que aparece y desaparece sin
   * motivo aparente.
   *
   * ⚠️ **No incluye a quien tiene una invitación sin aceptar.** Ocupa asiento,
   * pero todavía no tiene cuenta con la que hablar: sus filas vienen con
   * `userId` nulo.
   *
   * ⚠️ **Ni a uno mismo.** Quien llama suele añadirse aparte y con otro
   * significado —la presencia propia va marcada como `mio`—, así que devolverlo
   * aquí obligaría a filtrarlo en cada sitio.
   */
  async companerosDeOrganizacion(userId: string): Promise<string[]> {
    const suyas = await firstValueFrom(
      this.billingClient.send<{ id: string }[]>({ cmd: 'billing_orgs_of' }, { userId }),
    ).catch(() => [] as { id: string }[]);

    const listas = await Promise.all(
      suyas.map((organizacion) =>
        firstValueFrom(
          this.billingClient.send<{ userId: string | null }[]>(
            { cmd: 'billing_org_members' },
            { organizationId: organizacion.id, userId },
          ),
        ).catch(() => [] as { userId: string | null }[]),
      ),
    );

    const companeros = new Set<string>();
    for (const lista of listas) {
      for (const miembro of lista ?? []) {
        if (miembro.userId && miembro.userId !== userId) companeros.add(miembro.userId);
      }
    }

    return [...companeros];
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
    const plan = await this.planDe(userId, organizationId);
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

  /**
   * ¿Cabe una automatización activa más en este proyecto?
   *
   * 🔴 **Se comprueba al ACTIVAR, no al crear**, y es la decisión D2 de
   * `docs/PLAN-CUOTAS.md`. La cuota dice «reglas activas; las pausadas no
   * cuentan», así que el guard tiene que estar donde una regla pasa a estar
   * activa. Si estuviera al crear, alguien con el cupo lleno no podría ni
   * redactar una para dejarla lista, y —peor— la salida que ofrece el mensaje,
   * «pausa una», no liberaría nada: la pausada seguiría ocupando.
   *
   * ⚠️ **Hay dos puertas y hace falta cerrar las dos**: crear con `ENABLED` y
   * actualizar una que estaba pausada. La segunda es la que se olvida, y es la
   * misma clase de puerta trasera que la invitación en `cabenEn`.
   *
   * ⚠️ `exceptoId` no es un adorno. Al actualizar, la regla que se está
   * activando **ya existe**: contarla dentro del total la haría negarse a sí
   * misma en cuanto el cupo estuviera justo.
   *
   * ⚠️ Y si no se puede contar, se deja pasar y se registra (I1). Una regla de
   * más se pausa; una que no se pudo activar sin motivo no tiene arreglo por
   * ninguna vía que quien la sufre pueda encontrar.
   */
  async exigirAutomatizacion(userId: string, projectId: string, exceptoId?: string): Promise<void> {
    const organizationId = await this.organizacionDelProyecto(projectId);
    const plan = await this.planDe(userId, organizationId);
    const tope = plan.quotas.automatizacionesPorProyecto;
    if (tope === null) return;

    const activas = await firstValueFrom(
      this.automationClient.send<number>(
        { cmd: 'automation_rule_active_count' },
        { projectId, ...(exceptoId ? { exceptoId } : {}) },
      ),
    ).catch(() => null);

    if (activas === null) {
      this.log.error(
        `No se pudieron contar las automatizaciones de ${projectId}: se deja activar.`,
      );
      return;
    }

    this.exigir(cabe(activas, tope), {
      kind: QuotaKind.AUTOMATIZACIONES,
      tier: plan.tier,
      tope,
      actual: activas,
      /* ⚠️ **Sin `puedeAmpliar`, y no es un olvido.** Quien administra las
         automatizaciones de un tablero es quien tiene `canManageAutomations`
         en ese proyecto, que no dice nada de si puede tocar la tarjeta de la
         organización. Averiguarlo cuesta otro viaje TCP y la pantalla ya sabe
         leer la ausencia como «no se sabe»: ofrece la salida, que es lo caro de
         esconder. La salida barata —pausar una— la nombra el mensaje y no
         depende de ningún permiso de facturación. */
      extras: {},
    });
  }

  /**
   * Cuántos bytes ocupan los adjuntos de una organización, o `null` si no se pudo.
   *
   * Lo comparten el guard de la subida y el resumen de facturación, y por eso
   * está fuera de los dos: si cada uno hiciera su propia cuenta, el aviso de la
   * pantalla y la negativa del servidor podrían discrepar — y discreparían justo
   * en el caso interesante, que es el de quien está al borde.
   *
   * ⚠️ **Los `DELETED` no cuentan.** Sus adjuntos no se pueden ni abrir ni
   * borrar, así que cobrar por ellos sería cobrar por algo que nadie puede
   * liberar. Es la misma regla que en el conteo de proyectos.
   */
  async almacenamientoDe(organizationId: string): Promise<number | null> {
    const proyectos = await firstValueFrom(
      this.projectsClient.send<{ id: string; status: string }[]>(
        { cmd: 'project_find_by_organization' },
        { organizationId },
      ),
    ).catch(() => null);

    if (proyectos === null) return null;

    const vivos = proyectos
      .filter((proyecto) => proyecto.status !== 'DELETED')
      .map((proyecto) => proyecto.id);

    return firstValueFrom(
      this.tasksClient.send<number>({ cmd: 'attachment_bytes_of_projects' }, { projectIds: vivos }),
    ).catch(() => null);
  }

  /**
   * ¿Caben estos bytes más en el almacén de la organización?
   *
   * ## Por qué la suma se compone aquí
   *
   * Porque no la tiene nadie entero: tasks-service guarda los adjuntos y **no
   * sabe de organizaciones**; billing-service sabe de organizaciones y no ha
   * visto un adjunto en su vida. El gateway es el único que habla con los dos,
   * así que pide los proyectos de la organización por un lado y la suma de sus
   * bytes por el otro. Es la misma composición que hace `exigirProyecto`, y la
   * misma regla de arquitectura que fijó B7 de la etapa anterior: **no se abre
   * una dependencia entre microservicios que hoy no existe.**
   *
   * ⚠️ **Se mide lo que ocupa ahora, no lo que se subió alguna vez.** Borrar un
   * adjunto libera, igual que borrar un proyecto libera un hueco. Un contador
   * que solo sube cobra por lo que ya no está, y eso se lee como una avería.
   *
   * ⚠️ **`nuevosBytes` es `file.size`, medido en el servidor.** Nunca un tamaño
   * declarado por el cliente: sería un tope que se salta escribiendo un número.
   *
   * ⚠️ El tope del catálogo va en **megabytes** y esto compara **bytes**. La
   * conversión se hace en un solo sitio, aquí, porque los dos son números y
   * confundirlos no da ningún error — solo un tope un millón de veces más
   * grande o más pequeño de lo que dice la tabla de precios.
   */
  async exigirAlmacenamiento(
    userId: string,
    projectId: string,
    nuevosBytes: number,
  ): Promise<void> {
    const organizationId = await this.organizacionDelProyecto(projectId);
    const plan = await this.planDe(userId, organizationId);
    const topeMb = plan.quotas.almacenamientoOrgMb;
    if (topeMb === null || !organizationId) return;

    const ocupados = await this.almacenamientoDe(organizationId);
    if (ocupados === null) {
      this.log.error(`No se pudo medir el almacén de ${organizationId}: se deja subir.`);
      return;
    }

    const topeBytes = topeMb * 1024 * 1024;

    /* No es `cabe()`, y es el único sitio del repositorio donde no lo es: `cabe`
       contesta «¿cabe uno más?» sobre unidades, y aquí lo que entra tiene
       tamaño. Un archivo de 30 MB con 190 de 200 ocupados **no cabe** aunque
       quepa «uno más». El `null` ya se descartó arriba, así que la comparación
       suelta que `cabe()` existe para evitar no puede darse. */
    if (ocupados + nuevosBytes <= topeBytes) return;

    this.exigir(false, {
      kind: QuotaKind.ALMACENAMIENTO,
      tier: plan.tier,
      tope: topeMb,
      /* En MB, como el tope: el mensaje los pone en la misma frase y mezclar
         unidades ahí produce un «ocupas 199229440 de 200 MB». Se redondea hacia
         arriba para que 0,4 MB no salga como 0 ocupados con el aviso puesto. */
      actual: Math.ceil(ocupados / (1024 * 1024)),
    });
  }

  /**
   * Que quien pide mande sobre los proyectos de una organización.
   *
   * ⚠️ **No es `canManageBilling` ni ser dueño**: es `canManageAllProjects`, que
   * es el papel que se concede a propósito para poder recuperar un tablero.
   * Pagar no abre puertas dentro; un papel sí, y dejando rastro.
   */
  async exigirMandoEnLaOrganizacion(organizationId: string, userId: string): Promise<void> {
    const permisos = await firstValueFrom(
      this.billingClient.send<{ permisos: Record<string, boolean> } | null>(
        { cmd: 'billing_org_permissions' },
        { organizationId, userId },
      ),
    ).catch(() => null);

    if (!permisos?.permisos[OrganizationPermission.CAN_MANAGE_ALL_PROJECTS]) {
      throw new ForbiddenException(
        'Tu papel en esa organización no permite administrar sus proyectos.',
      );
    }
  }

  /** ¿Manda sobre los proyectos de esa organización? Sin lanzar. */
  async mandaEnLaOrganizacion(organizationId: string, userId: string): Promise<boolean> {
    const permisos = await firstValueFrom(
      this.billingClient.send<{ permisos: Record<string, boolean> } | null>(
        { cmd: 'billing_org_permissions' },
        { organizationId, userId },
      ),
    ).catch(() => null);

    return permisos?.permisos[OrganizationPermission.CAN_MANAGE_ALL_PROJECTS] === true;
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
  async exigirAsientoEnProyecto(
    projectId: string,
    userId: string,
    /**
     * Quién está metiendo a esa persona.
     *
     * 🔴 **Con él, un asiento libre se ocupa solo**, y sin él la regla del
     * asiento rompía el producto: quien trabaja solo no podía invitar a nadie a
     * su propio proyecto, y el plan gratuito promete «tú y dos personas más».
     * Pedirle dos pasos —«mete a Ana en tu organización, y luego en el
     * proyecto»— es burocracia para el caso más común de todos.
     *
     * ⚠️ **Solo si quien invita puede invitar a la organización**
     * (`canInviteMembers`). En un equipo grande, meter a alguien en la
     * organización no es un efecto secundario de invitarlo a un tablero: le da
     * el papel por defecto y le enseña la lista del equipo. Quien no tenga ese
     * permiso recibe el 403 y el mensaje dice a quién pedírselo.
     */
    porUserId?: string,
  ): Promise<void> {
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
    if (dentro) return;

    /* No tiene asiento. Antes de negar, se intenta darle uno: es lo que hace que
       «invitar a Ana a mi proyecto» siga siendo un solo gesto. Falla sola si no
       quedan asientos o si quien invita no puede repartirlos. */
    if (porUserId) {
      /* 🔴 **Con su correo, que lo tiene el directorio y no billing-service.** La
         fila del asiento va en un índice único `(organizationId, email)`: sin
         dirección propia, la segunda persona de la organización chocaba con la
         primera y el choque salía por aquí como un 403 `NOT_IN_ORG` con asientos
         libres. */
      const email = await this.correo(userId);

      const ocupado = email
        ? await firstValueFrom(
            this.billingClient.send<{ error?: string } | { ok: true }>(
              { cmd: 'billing_org_seat_grant' },
              { organizationId: proyecto.organizationId, porUserId, userId, email },
            ),
          ).catch(() => null)
        : null;

      if (!email) {
        this.log.error(`credentials-service no dio el correo de ${userId}: no se da asiento.`);
      }
      if (ocupado && !('error' in ocupado)) return;
    }

    throw new ForbiddenException({
      code: NOT_IN_ORG_CODE,
      message:
        'Esa persona no tiene asiento en la organización de este proyecto, y no se le pudo dar uno. ' +
        'Pídele a quien la administra que la añada, o libera un asiento.',
    });
  }

  /**
   * El correo de alguien, o `undefined` si el directorio no contesta.
   *
   * ⚠️ **Y aquí no se falla hacia el lado permisivo.** El resto de este archivo
   * deja pasar cuando no puede comprobar, porque negar por no haber podido
   * preguntar es un falso positivo que quien lo sufre no puede resolver. Esto es
   * distinto: es una **escritura**, y sin correo la fila que se guardaría sería
   * la que ya rompió esto una vez. Se prefiere el 403, que se reintenta.
   */
  private correo(userId: string): Promise<string | undefined> {
    return firstValueFrom(
      this.credentialsClient.send<{ credential?: { email?: string } }>(
        { cmd: 'user_find_one' },
        { id: userId },
      ),
    )
      .then((perfil) => perfil?.credential?.email)
      .catch(() => undefined);
  }

  /* ─── El análisis ──────────────────────────────────────────────────────── */

  /**
   * Hasta dónde hacia atrás puede mirar un informe de este proyecto.
   *
   * ## 🔴 Esto NO lanza 402, y es la decisión D4 de `docs/PLAN-CUOTAS.md`
   *
   * Las otras cuotas acotan una **escritura**: te pasas, no entra, y hay algo
   * que puedes hacer —borrar, pausar, ampliar—. Esta acota una **lectura**, y
   * ahí un 402 sería otra cosa: convertiría una pantalla de consulta en un muro
   * de pago a media sesión, sobre una pregunta que ni siquiera es
   * desproporcionada. No es que alguien se haya pasado; es que preguntó por más
   * atrás de lo que su plan alcanza.
   *
   * Así que se recorta y **se devuelve el recorte**, para que la pantalla lo
   * escriba. ⚠️ Un recorte mudo es peor que no recortar: un gráfico que empieza
   * noventa días atrás sin explicar por qué se lee como un dato incompleto, no
   * como un plan, y quien lo lea sacará conclusiones de una serie que cree
   * entera. Es la misma regla que `tareasOmitidas` en el briefing del asistente.
   *
   * ⚠️ **Ante un fallo devuelve `SIN_TOPE`, no el tope de FREE.** Es la regla I1
   * —el conteo falla hacia el lado permisivo— y aquí además es lo barato: el
   * riesgo de dejar leer noventa días de más es un escaneo algo mayor, y el de
   * recortar sin motivo es un gráfico equivocado que nadie sabe que lo está.
   */
  async ventanaDeAnalisis(
    userId: string,
    projectId: string,
  ): Promise<{ dias: Tope; tier: PlanTier }> {
    const organizationId = await this.organizacionDelProyecto(projectId);
    const plan = await this.planDe(userId, organizationId);
    return { dias: plan.quotas.historialAnalisisDias, tier: plan.tier };
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
  async limiteDeIa(userId: string, organizationId?: string | null): Promise<number | null> {
    const plan = await this.planDe(userId, organizationId);
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
  async iaDe(
    userId: string,
    organizationId?: string | null,
  ): Promise<{ tier: PlanTier; limite: Tope; organizationId: string | null }> {
    const plan = await this.planDe(userId, organizationId);
    /* La organización se devuelve resuelta y no se da por sabida: el contador de
       assistant-service la usa como parte de su clave, y si la de la respuesta
       no fuera la misma que la del tope, el mes se contaría contra un cubo y se
       negaría contra otro. */
    return {
      tier: plan.tier,
      limite: plan.quotas.iaMensualPorPersona,
      organizationId: plan.organizationId,
    };
  }

  /* ─── Asiento congelado ────────────────────────────────────────────────── */

  /**
   * Que quien escribe tenga su asiento **vivo** en esa organización.
   *
   * ## Qué es esto y por qué no es una cuota más
   *
   * Es el corazón de `docs/PLAN-ASIENTOS-CONGELADOS.md`. Cuando el techo del
   * plan baja por debajo de la gente que ya está dentro —al cancelar, o al bajar
   * de plan— **no se echa a nadie**: la cola de antigüedad se corta por el tope
   * y quien sobra se queda dentro en solo lectura. Ve sus proyectos, lee sus
   * tareas, lee el chat, y no puede escribir nada.
   *
   * ⚠️ **No es un 402 y no pasa por `exigir`.** Las cuotas se arreglan borrando
   * algo o pagando, y las dos cosas las puede hacer quien recibe el error. Esto
   * no: quien está congelado no tiene nada que borrar —no ha creado nada de más—
   * y no es quien paga. Un 402 le ofrecería una salida que no existe. Es un 403
   * con código propio, `SEAT_FROZEN`, y el detalle lleva el puesto en la cola
   * para que la pantalla pueda decir «eres el primero de dos» en vez de «acceso
   * denegado».
   *
   * ## 🔴 De dónde sale `organizationId`
   *
   * **Siempre del recurso**, nunca de la cookie `praxis_org` (trampa 20 de
   * `CLAUDE.md`). Es lo que hace cierta la decisión D10: estar congelado en la
   * organización de tu empresa no te congela en la tuya personal, y eso no es
   * una comprobación que se haga en ningún sitio — es la consecuencia de que el
   * identificador salga del proyecto que se está tocando. Una ruta nueva que lo
   * resolviera por otro camino congelaría a alguien donde nadie le ha bajado el
   * plan, y no daría ningún error.
   *
   * ## Y falla hacia el lado permisivo
   *
   * ⚠️ Si billing-service no contesta, **se deja escribir** y se registra. Es la
   * misma asimetría que `exigirAsientoEnProyecto` y la contraria a
   * `compartenOrganizacion`, y la línea entre las dos es quién puede resolver el
   * falso positivo: a quien se le niega escribir por una caída de billing no
   * tiene absolutamente nada que hacer al respecto, y el daño de dejar pasar una
   * escritura de alguien que debía estar congelado es una fila de más en un
   * tablero que ya era suyo.
   */
  async exigirAsientoVivo(userId: string, organizationId: string | null): Promise<void> {
    if (!organizationId) return;

    const estado = await firstValueFrom(
      this.billingClient.send<{ congelado: boolean; puesto: number | null; tope: Tope }>(
        { cmd: 'billing_seat_frozen' },
        { organizationId, userId },
      ),
    ).catch(() => null);

    if (estado === null) {
      this.log.error(
        `billing-service no dijo si ${userId} está congelado en ${organizationId}: se deja escribir.`,
      );
      return;
    }
    if (!estado.congelado) return;

    const detalles: SeatFrozenDetails = {
      organizationId,
      puesto: estado.puesto,
      tope: estado.tope,
    };

    /* Al primero de la cola se le dice que lo es: es la diferencia entre «espera»
       y «espera, y eres el siguiente». El resto no lleva número en el mensaje
       —lo lleva `details.puesto`— porque la pantalla sabe redactarlo mejor. */
    const elSiguiente =
      estado.puesto === 1
        ? 'Eres la primera persona que vuelve en cuanto se libere un asiento. '
        : '';

    throw new ForbiddenException({
      code: SEAT_FROZEN_CODE,
      message: `Tu organización tiene más gente que asientos, así que tu cuenta está en solo lectura: puedes verlo todo y no puedes escribir. ${elSiguiente}Se arregla desde facturación, ampliando el plan o liberando un asiento.`,
      details: detalles,
    });
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
  /* ⚠️ **No dice «en tu plan», y es el único de la lista que no lo dice.** Este
     tope no es de ningún plan desde 2026-08-28: es una constante por persona, y
     no se amplía pagando. Prometer lo contrario manda a alguien a la tabla de
     precios a resolver algo que la tabla de precios no resuelve. El camino real
     lo construye `exigirOrganizacion`, que lanza su propio mensaje con la
     salida buena; esta entrada existe para que el `Record` esté completo. */
  [QuotaKind.ORGANIZACIONES]: (tope) =>
    `Ya tienes ${tope} organizaciones a tu nombre, que es el máximo por persona.`,
  [QuotaKind.AUTOMATIZACIONES]: (tope) =>
    `Este proyecto ya tiene ${tope} automatizaciones activas. Pausa una o amplía el plan.`,
  [QuotaKind.ALMACENAMIENTO]: (tope) =>
    `Los adjuntos de tu organización ocupan los ${tope} MB del plan. Borra alguno o amplía.`,
};
