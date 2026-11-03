import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MembershipStatus,
  ORG_ROLE_ADMIN_NAME,
  ORG_ROLE_MEMBER_NAME,
  OrganizationKind,
  OrganizationPermission,
  type OrganizationPermissions,
  PLANS,
  PlanTier,
  ProjectPermission,
  SubscriptionStatus,
  type Tope,
  cabe,
  cabenEn,
  estaVigente,
  normalizarPermisosOrg,
  permisosDeAdministracion,
  permisosDeDueno,
  permisosDeMiembro,
  quotasDe,
} from '@praxis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { mensajeSinAsientos, topeDeAsientos } from './asientos';
import { type Corte, type MiembroParaCongelar, calcularCorte } from './congelados';

/**
 * El error que este servicio devuelve cuando algo no se puede hacer.
 *
 * ⚠️ **Se devuelve, no se lanza como `RpcException`.** Igual que el resto de
 * servicios internos: quien traduce a HTTP es el gateway, que es el único que
 * sabe si esto es un 400, un 403 o un 409. Un `throw` aquí llega al otro lado
 * como un error de transporte y pierde el motivo por el camino.
 */
export interface Fallo {
  error: string;
  /** Para que el gateway elija el status sin leer el texto. */
  codigo:
    | 'NO_EXISTE'
    | 'NO_ERES_MIEMBRO'
    | 'SIN_PERMISO'
    | 'SIN_ASIENTOS'
    | 'YA_ESTA'
    | 'NO_VALE'
    | 'EN_USO'
    | 'INVITACION_INVALIDA'
    /* El directorio no contestó y la fila necesita una dirección propia. No es
       culpa de quien pide: se reintenta. Ver `darAsiento`. */
    | 'SIN_CORREO';
}

export function esFallo(valor: unknown): valor is Fallo {
  return typeof valor === 'object' && valor !== null && 'codigo' in valor && 'error' in valor;
}

/**
 * Cuánto vive lo cacheado.
 *
 * ⚠️ **Treinta segundos, el mismo orden que permissions-service.** No es una
 * cifra elegida al azar: es lo que se tarda en no notar la caché navegando, y lo
 * poco que se tarda en notar un permiso que ya no debería estar. Con invalidación
 * explícita en cada escritura, el TTL solo cubre lo que la invalidación no
 * alcance —otro proceso, un Redis que parpadeó— y por eso es corto.
 */
const PERMISOS_TTL = 30;
const ORGS_TTL = 30;

@Injectable()
export class OrganizationsService {
  private readonly log = new Logger(OrganizationsService.name);
  private readonly inviteTtlHoras: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.inviteTtlHoras = Number(config.get('INVITE_TTL_HOURS') ?? 168);
  }

  /* ─── Lo que nace con una organización ─────────────────────────────────── */

  /**
   * Los dos papeles de arranque y las tres plantillas de rol de proyecto.
   *
   * ⚠️ **Toda organización nace con ellos, también la personal.** Una sin
   * ningún papel no puede aceptar una invitación —`roleId` es obligatorio— y una
   * sin plantillas crea proyectos con los roles genéricos de siempre, que es
   * exactamente el problema que las plantillas vienen a quitar.
   *
   * ⚠️ **«Administración» NO lleva `canManageBilling`.** Quien lleva el equipo no
   * toca la tarjeta de la empresa salvo que el dueño se lo dé a propósito. Es la
   * clase de permiso que se concede una vez y con nombre, no el que viene puesto.
   */
  private datosDeSemilla() {
    const papeles = [
      {
        name: ORG_ROLE_ADMIN_NAME,
        permissions: permisosDeAdministracion() as never,
        isDefault: false,
      },
      {
        /* El que se lleva quien entra sin que nadie diga cuál. Solo crear
           proyectos: es lo que hace que entrar sirva de algo el primer día sin
           que nadie tenga que configurar nada. */
        name: ORG_ROLE_MEMBER_NAME,
        permissions: permisosDeMiembro() as never,
        isDefault: true,
      },
    ];

    const plantillas = [
      { name: 'Administrador', permissions: permisosDeProyecto(PERMISOS_DE_PROYECTO) as never },
      {
        name: 'Colaborador',
        permissions: permisosDeProyecto([
          ProjectPermission.CAN_VIEW_PROJECT,
          ProjectPermission.CAN_CREATE_TASK,
          ProjectPermission.CAN_MOVE_TASK,
          ProjectPermission.CAN_EDIT_TASK,
          ProjectPermission.CAN_COMMENT,
          ProjectPermission.CAN_MANAGE_LABELS,
          ProjectPermission.CAN_VIEW_REPORTS,
        ]) as never,
      },
      {
        /* El rol que antes no se podía representar: ver sin poder tocar. Existe
           desde que `canViewProject` dejó de exigir `canEditBoard`. */
        name: 'Lectura',
        permissions: permisosDeProyecto([
          ProjectPermission.CAN_VIEW_PROJECT,
          ProjectPermission.CAN_COMMENT,
          ProjectPermission.CAN_VIEW_REPORTS,
        ]) as never,
      },
    ];

    return { papeles, plantillas };
  }

  /* ─── La organización personal ─────────────────────────────────────────── */

  /**
   * La organización personal de alguien, creándola si aún no existe.
   *
   * ## Nace con nombre, con papeles y con plantillas
   *
   * ⚠️ **Ya no es invisible.** Mientras una organización solo repartía topes,
   * una sin nombre que no salía en ninguna pantalla tenía sentido; desde que
   * **contiene** los proyectos, una que no se ve es un sitio donde no se puede
   * meter nada. Sale en el selector del sidebar como una más.
   *
   * El nombre lo pasa el gateway, que es quien tiene el directorio: aquí no se
   * sabe cómo se llama nadie, y este servicio no habla con ninguno otro. Si no
   * llega, se pone uno genérico antes que dejar un hueco.
   *
   * ## La carrera, que es real
   *
   * Dos peticiones simultáneas de alguien que aún no la tiene entran las dos por
   * el `findFirst`, las dos ven `null` y las dos crean. El índice único parcial
   * de la migración (`organizations_personal_por_usuario`) hace que la segunda
   * falle con P2002, y aquí se recoge volviendo a leer. Sin ese índice habría
   * dos organizaciones y la suscripción se guardaría en la que no se lee.
   */
  async personalDe(userId: string, datos?: { name?: string; email?: string }) {
    const existente = await this.prisma.organization.findFirst({
      where: { ownerUserId: userId, kind: OrganizationKind.PERSONAL },
      include: { subscription: true },
    });
    if (existente) return existente;

    /* Quien eliminó su espacio personal pero conserva otra organización propia no
       vuelve a tener una vacía: «la de respaldo» pasa a ser su organización propia
       más antigua. Si no, cada entrada la recrearía y borrarla no serviría de nada. */
    const propia = await this.prisma.organization.findFirst({
      where: { ownerUserId: userId },
      orderBy: { createdAt: 'asc' },
      include: { subscription: true },
    });
    if (propia) return propia;

    const nombre = datos?.name?.trim() || 'Mi espacio';
    const semilla = this.datosDeSemilla();

    try {
      /* ⚠️ **En una transacción, y no en un `create` anidado.** La membresía
         necesita el id de un papel que se crea en la misma operación, y Prisma no
         sabe referenciar hacia dentro de un anidado. Sin la transacción, un fallo
         al escribir la membresía dejaría una organización sin nadie dentro: nadie
         puede entrar en ella, nadie la ve, y el índice único parcial impide crear
         otra. */
      return await this.prisma.$transaction(async (tx) => {
        const organizacion = await tx.organization.create({
          data: {
            kind: OrganizationKind.PERSONAL,
            name: nombre,
            slug: await this.slugLibre(nombre),
            ownerUserId: userId,
            roles: { create: semilla.papeles },
            roleTemplates: { create: semilla.plantillas },
            /* 🔴 **Con los asientos del plan gratuito, no con uno.**
               `Subscription.seats` tiene `@default(1)` y sin fila se leía como
               uno: eso dejaba a quien trabaja solo **sin poder invitar a nadie a
               su propio proyecto**, porque entrar exige asiento. Y el plan
               gratuito promete justo lo contrario — «tú y dos personas más». El
               número sale de `PLANS`, como todos. */
            subscription: {
              create: {
                tier: PlanTier.FREE,
                status: SubscriptionStatus.ACTIVE,
                seats: PLANS[PlanTier.FREE].quotas.asientos ?? 1,
              },
            },
          },
          include: { subscription: true, roles: true },
        });

        const papel =
          organizacion.roles.find((rol) => rol.name === ORG_ROLE_ADMIN_NAME) ??
          organizacion.roles[0];

        await tx.organizationMember.create({
          data: {
            organizationId: organizacion.id,
            userId,
            /* La personal no invita a nadie y nunca se le manda un mensaje: la
               cadena vacía miente menos que inventar una dirección, y es el único
               caso de la tabla que la lleva así. */
            email: datos?.email?.trim().toLowerCase() ?? '',
            roleId: papel.id,
            status: MembershipStatus.ACTIVE,
            joinedAt: new Date(),
          },
        });

        return organizacion;
      });
    } catch (error) {
      const repetida = (error as { code?: string }).code === 'P2002';
      if (!repetida) throw error;

      const ganadora = await this.prisma.organization.findFirst({
        where: { ownerUserId: userId, kind: OrganizationKind.PERSONAL },
        include: { subscription: true },
      });
      if (!ganadora) throw error;
      return ganadora;
    }
  }

  /* ─── El plan efectivo ─────────────────────────────────────────────────── */

  /**
   * Qué plan vale para alguien **dentro de una organización concreta**.
   *
   * ## 🔴 Esto miraba todas, y valía la mejor
   *
   * Hasta 2026-08-28 esta función recorría todas las organizaciones de una
   * persona y aplicaba `mejorPlan` sobre las suscripciones vigentes. Su
   * argumento era bueno mientras lo fue: *«si el plan dependiera de cuál está
   * mirando, la misma acción se permitiría o se negaría según la pantalla, que
   * no hay forma de explicar»*.
   *
   * Dejó de serlo cuando la organización pasó a **ser** la pantalla. Ahora sí
   * hay forma de explicarlo —«esto es lo que da Estudio Nordeste, y estás
   * dentro de Estudio Nordeste»— y es la única manera de que un plan de pago
   * signifique algo: con el criterio viejo, pagar BUSINESS en el trabajo
   * regalaba BUSINESS en el espacio personal de cada empleado, y de paso hacía
   * mentir a cualquier pantalla acotada a una organización.
   *
   * ## Qué pasa sin organización
   *
   * ⚠️ **`organizationId` nulo cae en FREE, no en «la mejor».** Es el camino de
   * las rutas que todavía no saben desde dónde se las llama, y tiene que ser el
   * peldaño más bajo: heredar el mejor plan por no haber dicho dónde estás sería
   * exactamente el agujero que esta función viene a cerrar.
   *
   * ## Lo que no ha cambiado
   *
   * ⚠️ **Una suscripción que no está vigente no cuenta.** Una BUSINESS cancelada
   * deja de dar BUSINESS y cae a FREE, que es lo que hace que darse de baja
   * funcione sin tocar nada más.
   *
   * ⚠️ **No crea la organización personal.** Esto se llama en cada comprobación
   * de cuota —o sea, casi en cada escritura del producto— y crear una fila ahí
   * convertiría una lectura en una escritura para todo el mundo. Sin fila, FREE,
   * que es exactamente lo mismo que diría la fila.
   *
   * ⚠️ **Y se comprueba la pertenencia igual.** Mandar aquí una organización
   * ajena no da su plan: sin membresía activa no hay suscripción que mirar y
   * sale FREE. El identificador lo elige quien llama, así que esto no puede
   * fiarse de él.
   */
  async planEfectivoDe(userId: string, organizationId?: string | null) {
    if (!organizationId) return this.planVacio(userId);

    const membresia = await this.prisma.organizationMember.findFirst({
      where: { userId, organizationId, status: MembershipStatus.ACTIVE },
      include: { organization: { include: { subscription: true } } },
    });

    if (!membresia) return this.planVacio(userId);

    /* `subscription` es una relación **a uno** (`Subscription?`), no una lista:
       una organización tiene una suscripción o ninguna. */
    const suscripcion = membresia.organization.subscription;
    const vigente =
      suscripcion && estaVigente(suscripcion.status as SubscriptionStatus) ? suscripcion : null;

    if (!vigente) return this.planVacio(userId, organizationId);

    return {
      userId,
      tier: vigente.tier as PlanTier,
      quotas: quotasDe(vigente.tier),
      status: vigente.status as SubscriptionStatus,
      organizationId: vigente.organizationId,
      trialEndsAt: vigente.trialEndsAt ?? null,
      currentPeriodEnd: vigente.currentPeriodEnd ?? null,
      cancelAt: vigente.cancelAt ?? null,
    };
  }

  /**
   * FREE, con la organización dentro si se sabe cuál era.
   *
   * ⚠️ **`organizationId` se conserva aunque no haya suscripción**, y no es
   * decorativo: es lo que deja a la pantalla decir «esta organización es
   * gratuita» en vez de «no hay organización», que son cosas distintas y solo
   * una de las dos tiene un botón que ofrecer.
   */
  private planVacio(userId: string, organizationId: string | null = null) {
    return {
      userId,
      tier: PlanTier.FREE,
      quotas: quotasDe(PlanTier.FREE),
      status: SubscriptionStatus.ACTIVE,
      organizationId,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAt: null,
    };
  }

  /**
   * Cuántas organizaciones existen ya a nombre de alguien.
   *
   * ⚠️ **Por `ownerUserId`, e incluye la personal.** El tope
   * (`MAX_ORGANIZACIONES_PROPIAS`) cuenta la propia porque existe igualmente y
   * consume sus cuotas gratuitas como cualquier otra; lo que no cuenta es estar
   * invitado en las de otros, que no tiene límite.
   */
  contarPropias(userId: string): Promise<number> {
    return this.prisma.organization.count({ where: { ownerUserId: userId } });
  }

  /* ─── Las organizaciones de una persona ────────────────────────────────── */

  /**
   * Todas a las que pertenece, con sus permisos y sus asientos.
   *
   * ⚠️ **La personal también sale**, desde 2026-08-26. Antes se filtraba por
   * `kind: 'ENTERPRISE'` porque la personal era invisible; ahora es donde viven
   * los proyectos de quien trabaja solo, así que esconderla del selector dejaría
   * a esa persona sin poder llegar a los suyos.
   */
  async organizacionesDe(userId: string) {
    /* Lo pide `loadPrivateChrome` en **cada carga de cada zona** para pintar el
       selector de la barra lateral. Sin caché, eso es una consulta con tres
       `include` por navegación para una lista que cambia cuando alguien crea o
       acepta algo. */
    /* 🔴 **Y por eso mismo aquí no entra nada derivado.** En concreto, no entra
       si quien pregunta está congelado: eso se calcula al leer (D1 de
       `docs/PLAN-ASIENTOS-CONGELADOS.md`) justo para que volver a pagar lo
       apague **en el mismo instante** (invariante 3). Guardado aquí duraría
       treinta segundos más que el pago, con la cinta de «solo lectura» puesta en
       una organización que ya paga, y sin que nada fallara. Quien lo necesite
       que pregunte por `billing_seat_frozen`, que no cachea. */
    const clave = `billing:user:${userId}:orgs`;
    const cacheado = await this.redis.get<unknown[]>(clave);
    if (cacheado) return cacheado;

    let membresias = await this.prisma.organizationMember.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      include: {
        role: true,
        organization: { include: { subscription: true, _count: { select: { members: true } } } },
      },
      orderBy: [{ organization: { kind: 'asc' } }, { invitedAt: 'asc' }],
    });

    if (membresias.length === 0) {
      await this.personalDe(userId);
      membresias = await this.prisma.organizationMember.findMany({
        where: { userId, status: MembershipStatus.ACTIVE },
        include: {
          role: true,
          organization: { include: { subscription: true, _count: { select: { members: true } } } },
        },
        orderBy: [{ organization: { kind: 'asc' } }, { invitedAt: 'asc' }],
      });
    }

    const vistas = membresias.map((membresia) =>
      this.vista(membresia.organization, membresia, userId),
    );
    await this.redis.set(clave, vistas, ORGS_TTL);
    return vistas;
  }

  /** Una, con la comprobación de que quien pregunta está dentro. */
  async una(organizationId: string, userId: string) {
    const membresia = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId, status: MembershipStatus.ACTIVE },
      include: {
        role: true,
        organization: { include: { subscription: true, _count: { select: { members: true } } } },
      },
    });
    if (!membresia) {
      return { error: 'No perteneces a esa organización.', codigo: 'NO_ERES_MIEMBRO' } as Fallo;
    }
    return this.vista(membresia.organization, membresia, userId);
  }

  private vista(
    organizacion: {
      id: string;
      kind: string;
      name: string | null;
      slug: string | null;
      ownerUserId: string;
      iconKey: string | null;
      color: string | null;
      imageUrl?: string | null;
      mcpAllowed?: boolean;
      createdAt: Date;
      subscription: { tier: string; status: string; seats: number } | null;
      _count?: { members: number };
    },
    membresia: { role: { name: string; permissions: unknown } },
    userId: string,
  ) {
    /* El dueño lo puede todo sin mirar su papel: es el mismo bypass que
       `ownerId` en un proyecto. Ver `permisosDe`. */
    const esDueno = organizacion.ownerUserId === userId;

    return {
      id: organizacion.id,
      kind: organizacion.kind as OrganizationKind,
      name: organizacion.name,
      slug: organizacion.slug,
      ownerUserId: organizacion.ownerUserId,
      tier: (organizacion.subscription?.tier ?? PlanTier.FREE) as PlanTier,
      soyDueno: esDueno,
      myRoleName: esDueno ? null : membresia.role.name,
      myPermissions: esDueno
        ? permisosDeDueno()
        : normalizarPermisosOrg(membresia.role.permissions),
      seats: organizacion.subscription?.seats ?? 1,
      /* ⚠️ **Y el tope de verdad al lado, que no siempre es ese número.** Es lo
         que aplica la puerta de invitar desde A1 (`asientos.ts`): el menor entre
         lo contratado y lo que admite el plan. Enseñar solo lo contratado
         después de cancelar deja la pantalla diciendo «3 de 15» mientras el
         cuarto invitado recibe un error — que es la pareja de siempre, la tabla
         prometiendo lo que el guard niega. */
      seatsCap: topeDeAsientos(organizacion.subscription).tope,
      /* `_count.members` cuenta invitadas **y** activas, que es justo lo que
         significa un asiento gastado. Ver la nota de `OrganizationMember`. */
      seatsUsed: organizacion._count?.members ?? 0,
      iconKey: organizacion.iconKey,
      color: organizacion.color,
      imageUrl: organizacion.imageUrl ?? null,
      mcpAllowed: organizacion.mcpAllowed ?? true,
      createdAt: organizacion.createdAt.toISOString(),
    };
  }

  /* ─── Crear ────────────────────────────────────────────────────────────── */

  /**
   * Una organización de empresa nueva.
   *
   * ⚠️ **Nace sin suscripción vigente y con el plan sin aplicar.** Se crea aquí
   * y se paga después: quien decide el plan es el webhook de Stripe, nunca esta
   * llamada ni la vuelta del navegador. Mientras no llegue el pago, la
   * organización existe, se puede invitar a la gente y **las cuotas son las de
   * FREE** — que es lo honesto, porque nadie ha pagado nada todavía.
   */
  async crear(datos: {
    ownerUserId: string;
    ownerEmail: string;
    name: string;
    tier: PlanTier;
    seats: number;
  }) {
    const spec = PLANS[datos.tier];
    /* ⚠️ **Ya no se rechaza ningún plan por «ser individual»**, porque desde
       2026-08-26 no existe esa categoría: una persona sola es una organización
       de un asiento. Lo único que se comprueba aquí es el suelo de asientos del
       plan; cuántas organizaciones puedes tener lo decide la cuota, y eso lo
       mira el gateway, que es quien sabe contar. */
    if (!spec) {
      return { error: 'Ese plan no existe.', codigo: 'NO_VALE' } as Fallo;
    }
    if (datos.seats < spec.asientosMinimos) {
      return {
        error: `El plan ${spec.nombre} empieza en ${spec.asientosMinimos} asientos.`,
        codigo: 'NO_VALE',
      } as Fallo;
    }

    const semilla = this.datosDeSemilla();
    const slug = await this.slugLibre(datos.name);

    /* Igual que la personal: la membresía necesita el id de un papel creado en
       la misma operación, así que va en transacción y no anidada. Una
       organización sin nadie dentro no la ve ni la puede arreglar nadie. */
    const organizacion = await this.prisma.$transaction(async (tx) => {
      const creada = await tx.organization.create({
        data: {
          kind: OrganizationKind.ENTERPRISE,
          name: datos.name.trim(),
          slug,
          ownerUserId: datos.ownerUserId,
          roles: { create: semilla.papeles },
          roleTemplates: { create: semilla.plantillas },
          subscription: {
            create: {
              /* FREE hasta que el webhook diga otra cosa. Ver la nota de arriba. */
              tier: PlanTier.FREE,
              status: SubscriptionStatus.ACTIVE,
              seats: datos.seats,
            },
          },
          events: {
            create: {
              type: 'organizacion_creada',
              payload: { tier: datos.tier, seats: datos.seats },
            },
          },
        },
        include: { subscription: true, roles: true },
      });

      const papel = creada.roles.find((rol) => rol.name === ORG_ROLE_ADMIN_NAME) ?? creada.roles[0];

      await tx.organizationMember.create({
        data: {
          organizationId: creada.id,
          userId: datos.ownerUserId,
          email: datos.ownerEmail.trim().toLowerCase(),
          roleId: papel.id,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });

      return tx.organization.findUniqueOrThrow({
        where: { id: creada.id },
        include: { subscription: true, _count: { select: { members: true } } },
      });
    });

    return this.vista(
      organizacion,
      { role: { name: ORG_ROLE_ADMIN_NAME, permissions: permisosDeAdministracion() } },
      datos.ownerUserId,
    );
  }

  /**
   * Un slug libre para la URL del portal.
   *
   * ⚠️ **El sufijo de desempate es aleatorio, no un contador.** Es la misma
   * decisión que los proyectos (trampa 10 de CLAUDE.md): `-2`, `-3` dice cuántas
   * organizaciones homónimas hay y deja enumerarlas probando el siguiente.
   *
   * ⚠️ Y sí, es un gemelo de `slugificar` de projects-service. **No se comparte
   * a propósito**: para compartirlo habría que subirlo a `@praxis/contracts`,
   * que es un paquete de formas y validadores, y meterle lógica lo convierte en
   * el sitio donde acaba todo. Son ocho líneas y el precio de que se desvíen es
   * una URL con un guion de más.
   */
  private async slugLibre(nombre: string): Promise<string> {
    const base =
      nombre
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // marcas diacríticas sueltas tras el NFD
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'organizacion';

    const ocupado = await this.prisma.organization.findUnique({ where: { slug: base } });
    if (!ocupado) return base;

    /* 🔴 **Cuatro bytes y comprobando, no dos a ciegas.** Casi todos los
       espacios personales se llaman «Mi espacio», así que caen todos en
       `mi-espacio-XXXX`: con dos bytes son 65 536 sufijos, y por la paradoja
       del cumpleaños la mitad de las veces choca antes de los 300. El choque
       salía como un P2002 en el `create` y la cuenta **se quedaba sin espacio
       personal** —el registro lo trataba como aviso y seguía—. Lo destapó la
       suite e2e, que crea cientos de cuentas. */
    for (let intento = 0; intento < 5; intento += 1) {
      const candidato = `${base}-${randomBytes(4).toString('hex')}`;
      const tomado = await this.prisma.organization.findUnique({ where: { slug: candidato } });
      if (!tomado) return candidato;
    }
    return `${base}-${randomBytes(8).toString('hex')}`;
  }

  /**
   * Guarda la imagen de la organización. Misma puerta que renombrar
   * (`canManageOrganization`): es identidad igual que el nombre.
   *
   * ⚠️ La URL lleva `?v=<epoch>`: sin ella la imagen nueva no se vería, la
   * caché del navegador seguiría sirviendo la vieja.
   */
  async ponerImagen(
    organizationId: string,
    userId: string,
    mimeType: string,
    bytes: Uint8Array<ArrayBuffer>,
  ) {
    const permiso = await this.exigirPermiso(
      organizationId,
      userId,
      OrganizationPermission.CAN_MANAGE_ORGANIZATION,
    );
    if (esFallo(permiso)) return permiso;

    const version = Date.now();
    const [, organizacion] = await this.prisma.$transaction([
      this.prisma.organizationImage.upsert({
        where: { organizationId },
        create: { organizationId, mimeType, size: bytes.length, bytes },
        update: { mimeType, size: bytes.length, bytes },
      }),
      this.prisma.organization.update({
        where: { id: organizationId },
        data: { imageUrl: `/organizations/${organizationId}/image?v=${version}` },
        include: { subscription: true, _count: { select: { members: true } } },
      }),
    ]);
    await this.olvidar(organizationId, userId);
    return this.vista(
      organizacion,
      { role: { name: permiso.roleName ?? '', permissions: permiso.permisos } },
      userId,
    );
  }

  /** Quita la imagen: la organización vuelve a su icono o monograma. */
  async quitarImagen(organizationId: string, userId: string) {
    const permiso = await this.exigirPermiso(
      organizationId,
      userId,
      OrganizationPermission.CAN_MANAGE_ORGANIZATION,
    );
    if (esFallo(permiso)) return permiso;

    await this.prisma.organizationImage.deleteMany({ where: { organizationId } });
    const organizacion = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { imageUrl: null },
      include: { subscription: true, _count: { select: { members: true } } },
    });
    await this.olvidar(organizationId, userId);
    return this.vista(
      organizacion,
      { role: { name: permiso.roleName ?? '', permissions: permiso.permisos } },
      userId,
    );
  }

  /**
   * Los bytes, para la ruta que los sirve. Basta con ser miembro: la imagen se
   * ve en el selector de cualquiera que esté dentro. `null` si no hay.
   */
  async leerImagen(organizationId: string, userId: string) {
    const miembro = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId, status: MembershipStatus.ACTIVE },
      select: { id: true },
    });
    if (!miembro) {
      return { error: 'No perteneces a esa organización.', codigo: 'NO_ERES_MIEMBRO' } as Fallo;
    }
    return this.prisma.organizationImage.findUnique({
      where: { organizationId },
      select: { mimeType: true, size: true, bytes: true },
    });
  }

  /**
   * Permite o no que los miembros conecten su agente por MCP (M14).
   *
   * Misma puerta que renombrar: `canManageOrganization`. No toca ningún token;
   * el gateway lo mira en cada llamada.
   */
  async permitirMcp(organizationId: string, userId: string, mcpAllowed: boolean) {
    const permiso = await this.exigirPermiso(
      organizationId,
      userId,
      OrganizationPermission.CAN_MANAGE_ORGANIZATION,
    );
    if (esFallo(permiso)) return permiso;

    const organizacion = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { mcpAllowed },
      include: { subscription: true, _count: { select: { members: true } } },
    });
    await this.olvidar(organizationId, userId);
    await this.registrar(organizationId, 'mcp_permitido', { mcpAllowed, userId });
    return this.vista(
      organizacion,
      { role: { name: permiso.roleName ?? '', permissions: permiso.permisos } },
      userId,
    );
  }

  /**
   * Lo que necesita saber el MCP en cada llamada: si esa persona sigue dentro
   * y si la organización lo permite. Una sola consulta.
   */
  async accesoMcp(organizationId: string, userId: string) {
    const membresia = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId, status: MembershipStatus.ACTIVE },
      select: { organization: { select: { mcpAllowed: true } } },
    });
    return { miembro: membresia !== null, mcpAllowed: membresia?.organization.mcpAllowed ?? false };
  }

  async renombrar(
    organizationId: string,
    userId: string,
    name: string,
    /* Identidad visual, desde el modal de configuración. `undefined` = no se
       toca; `null` = se borra y vuelve al monograma. */
    iconKey?: string | null,
    color?: string | null,
  ) {
    /* Renombrar es identidad, no gestión de gente: se separó de
       `canManageMembers` para que quien lleva el equipo pueda arreglar una
       errata sin poder además tocar quién está dentro. El icono y el color van
       por la misma puerta — son identidad igual que el nombre. */
    const permiso = await this.exigirPermiso(
      organizationId,
      userId,
      OrganizationPermission.CAN_MANAGE_ORGANIZATION,
    );
    if (esFallo(permiso)) return permiso;

    const organizacion = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: name.trim(),
        ...(iconKey !== undefined && { iconKey: iconKey || null }),
        ...(color !== undefined && { color: color || null }),
      },
      include: { subscription: true, _count: { select: { members: true } } },
    });
    /* El selector de la barra lateral cachea la lista por usuario 30 s: sin este
       olvido, quien acaba de renombrar o de cambiar el icono lo sigue viendo
       viejo hasta media pantalla después. Al resto de miembros les llega al
       caducar el TTL. */
    await this.olvidar(organizationId, userId);
    return this.vista(
      organizacion,
      { role: { name: permiso.roleName ?? '', permissions: permiso.permisos } },
      userId,
    );
  }

  /* ─── Miembros ─────────────────────────────────────────────────────────── */

  async miembros(organizationId: string, userId: string) {
    /* ⚠️ **Aquí no se exige ningún permiso, solo asiento.** Antes admitía los
       tres papeles, o sea a cualquiera que estuviera dentro: saber con quién
       compartes organización no es una capacidad que se conceda, es lo mínimo
       para poder trabajar. Pedir `canManageMembers` habría dejado a la mayoría
       sin poder ver a su propio equipo. */
    const [organizacion, dentro] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId } }),
      this.esMiembroDe(organizationId, userId),
    ]);
    if (!organizacion) {
      return { error: 'Esa organización no existe.', codigo: 'NO_EXISTE' } as Fallo;
    }
    if (!dentro) {
      return { error: 'No perteneces a esa organización.', codigo: 'NO_ERES_MIEMBRO' } as Fallo;
    }

    const filas = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: { role: true },
      orderBy: [{ role: { name: 'asc' } }, { invitedAt: 'asc' }],
    });

    /* ⚠️ **El orden de esta lista no es el de la cola, y no se cambia.** Aquí
       se ordena por papel para que el portal se lea; la cola de antigüedad la
       calcula `congeladosDe` aparte, y por eso el congelado viaja marcado en
       cada fila en vez de deducirse de la posición. Mezclarlos habría hecho que
       reordenar el portal cambiara a quién se congela. */
    const corte = await this.congeladosDe(organizationId);
    const congelado = new Map(corte.congelados.map((uno) => [uno.id, uno.puesto]));

    return filas.map((fila) => ({
      userId: fila.userId,
      email: fila.email,
      /* El nombre lo pega el gateway, que es quien tiene el directorio. Aquí
         solo está el correo, que es lo que se escribió al invitar. */
      name: null as string | null,
      roleId: fila.roleId,
      roleName: fila.role.name,
      isOwner: fila.userId !== null && fila.userId === organizacion.ownerUserId,
      status: fila.status as MembershipStatus,
      invitedAt: fila.invitedAt.toISOString(),
      joinedAt: fila.joinedAt?.toISOString() ?? null,
      frozen: congelado.has(fila.id),
      queuePosition: congelado.get(fila.id) ?? null,
    }));
  }

  /**
   * Invita a alguien por correo.
   *
   * Devuelve el token **en claro una sola vez**, para que el gateway lo meta en
   * el enlace del mensaje. En la base solo queda su hash: es el mismo criterio
   * que la verificación de correo, y significa que quien lea la base no puede
   * aceptar invitaciones ajenas.
   */
  async invitar(datos: {
    organizationId: string;
    porUserId: string;
    email: string;
    roleId?: string;
  }) {
    const permiso = await this.exigirPermiso(
      datos.organizationId,
      datos.porUserId,
      OrganizationPermission.CAN_INVITE_MEMBERS,
    );
    if (esFallo(permiso)) return permiso;

    const email = datos.email.trim().toLowerCase();

    const [organizacion, ocupados, yaEsta] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: datos.organizationId },
        include: { subscription: true },
      }),
      this.prisma.organizationMember.count({ where: { organizationId: datos.organizationId } }),
      this.prisma.organizationMember.findUnique({
        where: { organizationId_email: { organizationId: datos.organizationId, email } },
      }),
    ]);

    if (!organizacion)
      return { error: 'Esa organización no existe.', codigo: 'NO_EXISTE' } as Fallo;
    if (yaEsta) {
      return {
        error:
          yaEsta.status === MembershipStatus.ACTIVE
            ? 'Esa persona ya está en la organización.'
            : 'Esa persona ya tiene una invitación pendiente.',
        codigo: 'YA_ESTA',
      } as Fallo;
    }

    /* ⚠️ Se cuenta antes de escribir y con las invitaciones dentro. Si una
       invitación no ocupara asiento se podrían mandar mil sobre tres, y el tope
       se rompería en el momento de aceptarlas — con la organización ya por
       encima de lo que paga y nada que hacer salvo echar a alguien. */
    const asientos = topeDeAsientos(organizacion.subscription);
    if (!cabe(ocupados, asientos.tope)) {
      return { error: mensajeSinAsientos(ocupados, asientos), codigo: 'SIN_ASIENTOS' } as Fallo;
    }

    /* El papel que se pide, o el que la organización tenga por defecto. Y si se
       pide uno concreto, tiene que caber en lo que tiene quien invita: si no,
       invitar sería la puerta trasera para repartir permisos que no se tienen. */
    const papel = datos.roleId
      ? await this.prisma.organizationRole.findFirst({
          where: { id: datos.roleId, organizationId: datos.organizationId },
        })
      : await this.prisma.organizationRole.findFirst({
          where: { organizationId: datos.organizationId, isDefault: true },
        });

    if (!papel) {
      return { error: 'Ese papel no existe en la organización.', codigo: 'NO_EXISTE' } as Fallo;
    }
    if (!cabenEn(normalizarPermisosOrg(papel.permissions), permiso.permisos)) {
      return {
        error: 'No puedes invitar con un papel que tiene permisos que tú no tienes.',
        codigo: 'SIN_PERMISO',
      } as Fallo;
    }

    const token = randomBytes(24).toString('hex');
    const expira = new Date(Date.now() + this.inviteTtlHoras * 3600_000);

    await this.prisma.organizationMember.create({
      data: {
        organizationId: datos.organizationId,
        email,
        roleId: papel.id,
        status: MembershipStatus.INVITED,
        inviteTokenHash: hashDe(token),
        inviteExpiresAt: expira,
      },
    });

    await this.olvidar(datos.organizationId);
    await this.registrar(datos.organizationId, 'miembro_invitado', { email, papel: papel.name });

    return { email, token, expiraEn: expira.toISOString() };
  }

  /**
   * Acepta una invitación.
   *
   * ⚠️ **El correo de quien acepta tiene que ser el invitado.** Sin esa
   * comprobación, quien consiguiera el enlace entraría con su propia cuenta —el
   * enlace es un secreto, sí, pero también viaja por correo y acaba reenviado—.
   * Con ella, el enlace solo sirve a quien iba dirigido.
   */
  async aceptar(datos: { token: string; userId: string; email: string }) {
    const invitacion = await this.prisma.organizationMember.findUnique({
      where: { inviteTokenHash: hashDe(datos.token) },
    });

    if (!invitacion || invitacion.status !== MembershipStatus.INVITED) {
      return { error: 'Esa invitación ya no vale.', codigo: 'INVITACION_INVALIDA' } as Fallo;
    }
    if (invitacion.inviteExpiresAt && invitacion.inviteExpiresAt < new Date()) {
      return { error: 'Esa invitación ha caducado.', codigo: 'INVITACION_INVALIDA' } as Fallo;
    }
    if (invitacion.email !== datos.email.trim().toLowerCase()) {
      return {
        error: 'Esa invitación es para otra dirección de correo.',
        codigo: 'INVITACION_INVALIDA',
      } as Fallo;
    }

    await this.prisma.organizationMember.update({
      where: { id: invitacion.id },
      data: {
        userId: datos.userId,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
        /* El token se quema al usarse: una invitación aceptada no se vuelve a
           aceptar, y dejar el hash guardado solo daría una segunda oportunidad
           a quien tenga el enlace. */
        inviteTokenHash: null,
        inviteExpiresAt: null,
      },
    });

    /* 🔴 Aquí la invalidación es lo que hace que entrar funcione: sin ella,
       quien acaba de aceptar sigue treinta segundos sin ver su organización en
       el selector, que se lee como que la invitación no ha servido. */
    await this.olvidar(invitacion.organizationId, datos.userId);
    await this.registrar(invitacion.organizationId, 'invitacion_aceptada', {
      email: invitacion.email,
    });

    return this.una(invitacion.organizationId, datos.userId);
  }

  async cambiarRol(datos: {
    organizationId: string;
    porUserId: string;
    userId: string;
    roleId: string;
  }) {
    /* ⚠️ Antes esto era solo del dueño. Ahora es `canManageMembers`, y lo que
       impide que se convierta en un ascensor a la cima es `cabenEn`: se puede
       repartir papel, pero no uno que tenga permisos que quien lo reparte no
       tiene. Sin esa regla, quien invita gente podría darse a sí mismo un papel
       con la facturación dentro. */
    const permiso = await this.exigirPermiso(
      datos.organizationId,
      datos.porUserId,
      OrganizationPermission.CAN_MANAGE_MEMBERS,
    );
    if (esFallo(permiso)) return permiso;

    const [organizacion, miembro, papel] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: datos.organizationId } }),
      this.prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId: datos.organizationId, userId: datos.userId },
        },
      }),
      this.prisma.organizationRole.findFirst({
        where: { id: datos.roleId, organizationId: datos.organizationId },
      }),
    ]);

    if (!miembro) return { error: 'Esa persona no está dentro.', codigo: 'NO_EXISTE' } as Fallo;
    if (!papel) {
      return { error: 'Ese papel no existe en la organización.', codigo: 'NO_EXISTE' } as Fallo;
    }
    if (!cabenEn(normalizarPermisosOrg(papel.permissions), permiso.permisos)) {
      return {
        error: 'No puedes dar un papel con permisos que tú no tienes.',
        codigo: 'SIN_PERMISO',
      } as Fallo;
    }
    if (organizacion?.ownerUserId === datos.userId) {
      /* Quien paga es uno solo. Cambiar de dueño es traspasar la suscripción y
         tiene su propia ruta; dejarlo pasar por aquí haría que el dueño pudiera
         degradarse a sí mismo y dejar la organización sin nadie que la gestione. */
      return {
        error: 'Al dueño de la organización no se le cambia el papel desde aquí.',
        codigo: 'NO_VALE',
      } as Fallo;
    }

    await this.prisma.organizationMember.update({
      where: { id: miembro.id },
      data: { roleId: papel.id },
    });
    await this.olvidar(datos.organizationId, datos.userId);
    await this.registrar(datos.organizationId, 'papel_asignado', {
      userId: datos.userId,
      papel: papel.name,
    });
    return { ok: true };
  }

  /**
   * Saca a alguien, o cancela su invitación.
   *
   * ⚠️ **Libera el asiento y no toca nada más.** Quien sale de la organización
   * sigue siendo miembro de los proyectos en los que estuviera: son las dos
   * capas de siempre y esta es la tercera. Echar a alguien del plan y de los
   * tableros a la vez sería una sola acción con dos consecuencias, y la segunda
   * no se puede deshacer.
   */
  async quitar(datos: {
    organizationId: string;
    porUserId: string;
    userId?: string;
    email?: string;
  }) {
    const permiso = await this.exigirPermiso(
      datos.organizationId,
      datos.porUserId,
      OrganizationPermission.CAN_MANAGE_MEMBERS,
    );
    if (esFallo(permiso)) return permiso;

    /* ⚠️ Uno de los dos, y comprobado: con `email: undefined` Prisma **quita la
       condición** en vez de no encontrar nada, así que una llamada sin ninguno
       de los dos habría sacado al primer miembro de la lista. */
    const porCorreo = datos.email?.trim().toLowerCase();
    if (!datos.userId && !porCorreo) {
      return { error: 'Hay que decir a quién se saca.', codigo: 'NO_VALE' } as Fallo;
    }

    const miembro = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId: datos.organizationId,
        ...(datos.userId ? { userId: datos.userId } : { email: porCorreo }),
      },
    });
    if (!miembro) return { error: 'Esa persona no está dentro.', codigo: 'NO_EXISTE' } as Fallo;

    const organizacion = await this.prisma.organization.findUnique({
      where: { id: datos.organizationId },
    });
    if (miembro.userId && organizacion?.ownerUserId === miembro.userId) {
      return {
        error: 'Al dueño no se le puede sacar de su propia organización. Traspásala antes.',
        codigo: 'NO_VALE',
      } as Fallo;
    }

    await this.prisma.organizationMember.delete({ where: { id: miembro.id } });
    await this.olvidar(datos.organizationId, miembro.userId ?? undefined);
    await this.registrar(datos.organizationId, 'miembro_retirado', {
      email: miembro.email,
      userId: miembro.userId,
    });
    return { ok: true };
  }

  /* ─── Administración de la plataforma ──────────────────────────────────── */

  /**
   * Todas las organizaciones, para el panel de administración.
   *
   * ⚠️ **No comprueba nada aquí**, y es a propósito: el rol global lo resuelve el
   * gateway con `@RequireGlobalRole`, que es donde vive esa capa. Este servicio
   * no sabe qué es un administrador de plataforma y no debería — mezclarlo
   * pondría dos sitios que decidir sobre lo mismo.
   *
   * ⚠️ **Sin caché.** Es una pantalla de administración con filtros que cambian
   * en cada petición, y una entrada recién creada tiene que salir: es el mismo
   * criterio que ya tiene el registro de actividad.
   */
  /** Solo el nombre de una organización. Lo pide el registro de administración. */
  nombre(organizationId: string) {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
  }

  async todas(datos: { page?: number; limit?: number; search?: string }) {
    const page = Math.max(1, datos.page ?? 1);
    const limit = Math.min(100, Math.max(1, datos.limit ?? 20));
    const busqueda = datos.search?.trim();

    const where = busqueda ? { name: { contains: busqueda, mode: 'insensitive' as const } } : {};

    const [filas, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        include: {
          subscription: true,
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.organization.count({ where }),
    ]);

    return {
      items: filas.map((fila) => ({
        id: fila.id,
        kind: fila.kind,
        name: fila.name,
        slug: fila.slug,
        ownerUserId: fila.ownerUserId,
        tier: fila.subscription?.tier ?? PlanTier.FREE,
        status: fila.subscription?.status ?? SubscriptionStatus.ACTIVE,
        seats: fila.subscription?.seats ?? 1,
        seatsUsed: fila._count.members,
        /* Si el plan lo concedió administración (sin Stripe): la pantalla lo
           marca y ofrece retirarlo. */
        granted: Boolean(fila.subscription?.grantedBy),
        createdAt: fila.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
    };
  }

  /* ─── Permisos ─────────────────────────────────────────────────────────── */

  /**
   * Lo que puede hacer alguien dentro de una organización.
   *
   * 🔴 **El dueño se resuelve antes de mirar ningún papel.** Es el mismo bypass
   * que `ownerId` en un proyecto, y por el mismo motivo: si su poder saliera de
   * una fila, podría quitársela a sí mismo y dejar la organización sin nadie que
   * la administre y sin ninguna salida.
   *
   * Devuelve `null` si no está dentro, que **no es lo mismo** que estar dentro
   * sin permisos: en la pantalla son dos frases distintas y solo una se arregla
   * pidiendo una invitación.
   */
  async permisosDe(
    organizationId: string,
    userId: string,
  ): Promise<{
    permisos: OrganizationPermissions;
    esDueno: boolean;
    roleName: string | null;
  } | null> {
    /* 🔴 **Cacheado, y no por gusto.** Esto se pregunta en cada escritura que
       toca una organización y en cada carga del armazón de las siete zonas: sin
       caché, cada navegación paga una ida a Postgres para responder algo que
       cambia una vez al mes.

       ⚠️ **Treinta segundos y ni uno más**, y con invalidación en cada escritura
       que reparte permisos. Un papel editado que tarda en aplicarse es un
       permiso que sigue abierto después de habérselo quitado a alguien. */
    const clave = `billing:org:${organizationId}:permisos:${userId}`;
    const cacheado = await this.redis.get<{
      permisos: OrganizationPermissions;
      esDueno: boolean;
      roleName: string | null;
    } | null>(clave);
    if (cacheado) return cacheado;

    const [organizacion, membresia] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId } }),
      this.prisma.organizationMember.findFirst({
        where: { organizationId, userId, status: MembershipStatus.ACTIVE },
        include: { role: true },
      }),
    ]);

    /* ⚠️ El «no estás dentro» **no se cachea**: es el caso que cambia en cuanto
       alguien acepta una invitación, y guardarlo treinta segundos sería dejar a
       quien acaba de entrar fuera de su propia organización. */
    if (!organizacion || !membresia) return null;

    const resuelto =
      organizacion.ownerUserId === userId
        ? { permisos: permisosDeDueno(), esDueno: true, roleName: null }
        : {
            permisos: normalizarPermisosOrg(membresia.role.permissions),
            esDueno: false,
            roleName: membresia.role.name,
          };

    await this.redis.set(clave, resuelto, PERMISOS_TTL);
    return resuelto;
  }

  /** ¿Tiene asiento activo aquí? Lo que pregunta el gateway en cada escritura. */
  async esMiembroDe(organizationId: string, userId: string): Promise<boolean> {
    const membresia = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId, status: MembershipStatus.ACTIVE },
      select: { id: true },
    });
    return membresia !== null;
  }

  /* ─── Congelados ───────────────────────────────────────────────────────── */

  /**
   * Quién se ha quedado **en solo lectura** por haber bajado el techo del plan.
   *
   * ## Se calcula, no se guarda
   *
   * D1 de `docs/PLAN-ASIENTOS-CONGELADOS.md`: no hay columna `frozen`. Un flag
   * habría que mantenerlo al día en cinco sitios —cancelar, pagar, invitar,
   * sacar a alguien, cambiar de plan— y el día que uno se olvide habrá gente
   * congelada en una organización que ya paga, sin que nada falle. Derivado,
   * **volver a pagar descongela solo y en el mismo instante**, que es el
   * invariante 3 y lo que pedía el encargo.
   *
   * ## Por qué esto NO se cachea
   *
   * 🔴 **Porque el instante importa y la caché de este servicio no la invalida
   * un cambio de plan.** `SubscriptionsService` no tiene `RedisService` —no lo
   * necesitaba— así que un `billing_apply_plan` no borra nada de
   * `billing:org:*`. Con treinta segundos de TTL, la frase que oiría quien
   * acaba de pagar es «he pagado y sigo sin poder escribir», que es la queja
   * más cara de este terreno y la que el invariante 3 existe para evitar.
   *
   * El precio es una consulta ordenada por escritura sobre una tabla de decenas
   * de filas, con índice por `organizationId`. Se paga.
   *
   * ⚠️ **Y `ocupados` cuenta igual que la puerta de invitar**: todas las filas,
   * con las invitaciones pendientes dentro (D9). Contar aquí de otra manera
   * dejaría el corte y el tope hablando de números distintos, y el síntoma sería
   * alguien congelado con un asiento aparentemente libre.
   */
  async congeladosDe(organizationId: string): Promise<Corte & { organizationId: string }> {
    const [organizacion, filas] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        include: { subscription: true },
      }),
      this.prisma.organizationMember.findMany({
        where: { organizationId },
        include: { role: true },
      }),
    ]);

    if (!organizacion) {
      return { organizationId, congelados: [], tope: null, ocupados: 0 };
    }

    const { tope } = topeDeAsientos(organizacion.subscription);

    const miembros: MiembroParaCongelar[] = filas.map((fila) => ({
      id: fila.id,
      userId: fila.userId,
      email: fila.email,
      status: fila.status,
      invitedAt: fila.invitedAt,
      joinedAt: fila.joinedAt,
      /* ⚠️ **Solo en una membresía activa** (D8). Un papel con
         `canManageBilling` en una invitación sin aceptar no salva de nada: esa
         persona no ha entrado, así que no puede pagar. */
      puedePagar:
        fila.status === MembershipStatus.ACTIVE &&
        normalizarPermisosOrg(fila.role.permissions)[OrganizationPermission.CAN_MANAGE_BILLING] ===
          true,
    }));

    return {
      organizationId,
      ...calcularCorte({ miembros, ownerUserId: organizacion.ownerUserId, tope }),
    };
  }

  /**
   * ¿Está esta persona en solo lectura **en esta organización**?
   *
   * Es lo que pregunta el gateway en cada escritura. Se apoya en el cálculo
   * entero porque el corte solo tiene sentido con la cola delante: no hay forma
   * de saber si alguien está en la cola de atrás sin ordenar a los demás.
   *
   * ⚠️ **La organización que llega aquí es siempre la del recurso** (D10).
   * Quien está congelado en la organización de su empresa escribe con
   * normalidad en la suya personal el mismo segundo, y eso no es una promesa de
   * este método: es consecuencia de quién le pasa el identificador. Ver
   * `QuotaService.exigirAsientoVivo`.
   */
  async estaCongelado(
    organizationId: string,
    userId: string,
  ): Promise<{ congelado: boolean; puesto: number | null; tope: Tope }> {
    const corte = await this.congeladosDe(organizationId);
    const suyo = corte.congelados.find((uno) => uno.userId === userId);

    return { congelado: suyo !== undefined, puesto: suyo?.puesto ?? null, tope: corte.tope };
  }

  /**
   * Que quien pregunta esté dentro y con permiso suficiente.
   *
   * ⚠️ **Devuelve el `Fallo` en vez de lanzarlo**, por lo mismo que todo lo
   * demás de este archivo: quien traduce a HTTP es el gateway. Y distingue «no
   * estás dentro» de «estás pero no puedes», que en la pantalla son dos frases
   * distintas — la primera se arregla pidiendo una invitación y la segunda no.
   *
   * ⚠️ **Sustituyó a un `exigir(…, admitidos: OrganizationRole[])`** que
   * recibía la lista de papeles escrita a mano en cada llamada. Elegir qué
   * permiso va en cada sitio fue una decisión, no un renombre: un `[OWNER,
   * ADMIN]` de entonces es `canManageMembers` en un sitio y `canViewAuditLog` en
   * otro, y tratarlos igual habría dejado que quien invita gente pudiera además
   * leer el registro de facturación.
   */
  async exigirPermiso(organizationId: string, userId: string, permiso: OrganizationPermission) {
    const resuelto = await this.permisosDe(organizationId, userId);
    if (!resuelto) {
      return { error: 'No perteneces a esa organización.', codigo: 'NO_ERES_MIEMBRO' } as Fallo;
    }
    if (!resuelto.permisos[permiso]) {
      return {
        error: 'Tu papel en la organización no alcanza para esto.',
        codigo: 'SIN_PERMISO',
      } as Fallo;
    }
    return resuelto;
  }

  /* ─── Los papeles ──────────────────────────────────────────────────────── */

  /** Los papeles de una organización, con cuánta gente lleva cada uno. */
  async papeles(organizationId: string, userId: string) {
    const permiso = await this.exigirPermiso(
      organizationId,
      userId,
      /* Verlos exige poder gestionarlos: la lista dice quién puede tocar la
         facturación y quién ve el registro, que es un mapa del poder interno de
         la empresa y no algo que deba leer cualquiera con asiento. */
      OrganizationPermission.CAN_MANAGE_MEMBERS,
    );
    if (esFallo(permiso)) return permiso;

    const filas = await this.prisma.organizationRole.findMany({
      where: { organizationId },
      include: { _count: { select: { members: true } } },
      orderBy: [{ isDefault: 'asc' }, { name: 'asc' }],
    });

    return filas.map((fila) => ({
      id: fila.id,
      name: fila.name,
      permissions: normalizarPermisosOrg(fila.permissions),
      isDefault: fila.isDefault,
      miembros: fila._count.members,
    }));
  }

  /**
   * Crea un papel.
   *
   * 🔴 **No se puede conceder lo que no se tiene.** Sin esta comprobación, quien
   * tenga `canManageMembers` se crea un papel con `canManageBilling`, se lo
   * asigna y ya está tocando la tarjeta de la empresa. Repartir permisos no puede
   * crear permisos, y el dueño la pasa sola porque los tiene todos.
   */
  async crearPapel(datos: {
    organizationId: string;
    porUserId: string;
    name: string;
    permissions: unknown;
  }) {
    const permiso = await this.exigirPermiso(
      datos.organizationId,
      datos.porUserId,
      OrganizationPermission.CAN_MANAGE_MEMBERS,
    );
    if (esFallo(permiso)) return permiso;

    const pedidos = normalizarPermisosOrg(datos.permissions);
    if (!cabenEn(pedidos, permiso.permisos)) {
      return {
        error: 'No puedes dar un permiso que tú no tienes.',
        codigo: 'SIN_PERMISO',
      } as Fallo;
    }

    const name = datos.name.trim();
    const repetido = await this.prisma.organizationRole.findUnique({
      where: { organizationId_name: { organizationId: datos.organizationId, name } },
    });
    if (repetido) {
      return { error: 'Ya hay un papel con ese nombre.', codigo: 'YA_ESTA' } as Fallo;
    }

    const creado = await this.prisma.organizationRole.create({
      data: {
        organizationId: datos.organizationId,
        name,
        permissions: pedidos as never,
      },
    });
    await this.olvidar(datos.organizationId);
    await this.registrar(datos.organizationId, 'papel_creado', { name, roleId: creado.id });

    return {
      id: creado.id,
      name: creado.name,
      permissions: pedidos,
      isDefault: false,
      miembros: 0,
    };
  }

  /** Edita un papel. Misma regla: no se concede lo que no se tiene. */
  async editarPapel(datos: {
    organizationId: string;
    porUserId: string;
    roleId: string;
    name: string;
    permissions: unknown;
  }) {
    const permiso = await this.exigirPermiso(
      datos.organizationId,
      datos.porUserId,
      OrganizationPermission.CAN_MANAGE_MEMBERS,
    );
    if (esFallo(permiso)) return permiso;

    const papel = await this.prisma.organizationRole.findFirst({
      where: { id: datos.roleId, organizationId: datos.organizationId },
      include: { _count: { select: { members: true } } },
    });
    if (!papel) return { error: 'Ese papel no existe.', codigo: 'NO_EXISTE' } as Fallo;

    const pedidos = normalizarPermisosOrg(datos.permissions);
    if (!cabenEn(pedidos, permiso.permisos)) {
      return {
        error: 'No puedes dar un permiso que tú no tienes.',
        codigo: 'SIN_PERMISO',
      } as Fallo;
    }

    await this.prisma.organizationRole.update({
      where: { id: papel.id },
      data: { name: datos.name.trim(), permissions: pedidos as never },
    });
    await this.olvidar(datos.organizationId);
    await this.registrar(datos.organizationId, 'papel_editado', { roleId: papel.id });

    return {
      id: papel.id,
      name: datos.name.trim(),
      permissions: pedidos,
      isDefault: papel.isDefault,
      miembros: papel._count.members,
    };
  }

  /**
   * Borra un papel.
   *
   * ⚠️ **No se borra uno que todavía lleva gente, y tampoco el de por defecto.**
   * Lo primero dejaría a esas personas sin ninguno —la clave foránea es
   * `RESTRICT` justo para eso— y lo segundo dejaría a la organización sin poder
   * escribir la siguiente invitación. Las dos se arreglan reasignando primero, y
   * decir cuánta gente hay que mover es lo que hace que se pueda.
   */
  async borrarPapel(datos: { organizationId: string; porUserId: string; roleId: string }) {
    const permiso = await this.exigirPermiso(
      datos.organizationId,
      datos.porUserId,
      OrganizationPermission.CAN_MANAGE_MEMBERS,
    );
    if (esFallo(permiso)) return permiso;

    const papel = await this.prisma.organizationRole.findFirst({
      where: { id: datos.roleId, organizationId: datos.organizationId },
      include: { _count: { select: { members: true } } },
    });
    if (!papel) return { error: 'Ese papel no existe.', codigo: 'NO_EXISTE' } as Fallo;

    if (papel.isDefault) {
      return {
        error: 'Ese es el papel con el que entra la gente nueva: marca otro antes de borrarlo.',
        codigo: 'EN_USO',
      } as Fallo;
    }
    if (papel._count.members > 0) {
      return {
        /* El plural se concuerda: «lo llevan 1 personas» es la clase de frase
           que hace pensar que nadie ha leído la pantalla. */
        error:
          papel._count.members === 1
            ? 'Ese papel lo lleva una persona: cámbiala de papel antes de borrarlo.'
            : `Ese papel lo llevan ${papel._count.members} personas: cámbialas de papel antes de borrarlo.`,
        codigo: 'EN_USO',
      } as Fallo;
    }

    await this.prisma.organizationRole.delete({ where: { id: papel.id } });
    await this.olvidar(datos.organizationId);
    await this.registrar(datos.organizationId, 'papel_borrado', { name: papel.name });
    return { ok: true };
  }

  /* ─── Las plantillas de rol de proyecto ────────────────────────────────── */

  /**
   * Las plantillas con las que nacen los proyectos de la organización.
   *
   * ⚠️ **Las puede leer cualquiera con asiento.** No son un mapa del poder como
   * los papeles: son los roles que se va a encontrar dentro de un proyecto, y
   * saber cuáles hay antes de crear uno es lo que evita configurarlos a mano.
   */
  async plantillas(organizationId: string, userId: string) {
    const dentro = await this.esMiembroDe(organizationId, userId);
    if (!dentro) {
      return { error: 'No perteneces a esa organización.', codigo: 'NO_ERES_MIEMBRO' } as Fallo;
    }

    const filas = await this.prisma.projectRoleTemplate.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
    return filas.map((fila) => ({
      id: fila.id,
      name: fila.name,
      permissions: fila.permissions as Record<string, boolean>,
    }));
  }

  /**
   * Crea o actualiza una plantilla.
   *
   * ⚠️ **No toca los proyectos que ya existen**, y es a propósito: reescribir sus
   * roles sería borrar el trabajo de quien los ajustó, desde una pantalla que
   * habla de otra cosa. El puente va en una sola dirección y solo se cruza al
   * crear un proyecto.
   */
  async guardarPlantilla(datos: {
    organizationId: string;
    porUserId: string;
    templateId?: string;
    name: string;
    permissions: Record<string, unknown>;
  }) {
    const permiso = await this.exigirPermiso(
      datos.organizationId,
      datos.porUserId,
      OrganizationPermission.CAN_MANAGE_ROLE_TEMPLATES,
    );
    if (esFallo(permiso)) return permiso;

    /* Se filtra contra el vocabulario de **proyecto**, no el de organización: son
       dos listas distintas, y colar aquí un `canManageBilling` daría un rol de
       proyecto con un permiso que nadie comprueba nunca. */
    const permisos = permisosDeProyecto(
      PERMISOS_DE_PROYECTO.filter((clave) => datos.permissions[clave] === true),
    );
    const name = datos.name.trim();

    const fila = datos.templateId
      ? await this.prisma.projectRoleTemplate.update({
          where: { id: datos.templateId },
          data: { name, permissions: permisos as never },
        })
      : await this.prisma.projectRoleTemplate.create({
          data: { organizationId: datos.organizationId, name, permissions: permisos as never },
        });

    await this.registrar(datos.organizationId, 'plantilla_guardada', { name });
    return { id: fila.id, name: fila.name, permissions: permisos };
  }

  /** Borra una plantilla. No afecta a ningún proyecto ya creado. */
  async borrarPlantilla(datos: {
    organizationId: string;
    porUserId: string;
    templateId: string;
  }) {
    const permiso = await this.exigirPermiso(
      datos.organizationId,
      datos.porUserId,
      OrganizationPermission.CAN_MANAGE_ROLE_TEMPLATES,
    );
    if (esFallo(permiso)) return permiso;

    const borradas = await this.prisma.projectRoleTemplate.deleteMany({
      where: { id: datos.templateId, organizationId: datos.organizationId },
    });
    if (borradas.count === 0) {
      return { error: 'Esa plantilla no existe.', codigo: 'NO_EXISTE' } as Fallo;
    }
    await this.registrar(datos.organizationId, 'plantilla_borrada', {
      templateId: datos.templateId,
    });
    return { ok: true };
  }

  /**
   * Le da asiento a alguien directamente, sin invitación que aceptar.
   *
   * 🔴 **Existe para que invitar a alguien a un proyecto siga siendo un solo
   * gesto.** Sin esto, la regla de «quien está en un proyecto está en la
   * organización» dejaba a quien trabaja solo sin poder meter a nadie en su
   * propio tablero, y el plan gratuito promete «tú y dos personas más».
   *
   * ⚠️ **No es una invitación**: no manda correo, no hay token y no hay nada que
   * aceptar. Esa persona ya está diciendo que sí al entrar en el proyecto — la
   * invitación por correo sigue existiendo para quien todavía no está aquí.
   *
   * ⚠️ **Exige `canInviteMembers` en quien lo pide.** Meter a alguien en la
   * organización le da el papel por defecto y le enseña la lista del equipo: no
   * puede ser un efecto secundario que dispare cualquiera con permiso sobre un
   * tablero.
   *
   * ⚠️ **Y ocupa asiento**, con el mismo tope que una invitación. Si no quedan,
   * falla y quien invita lee por qué.
   *
   * 🔴 **El correo lo pone el gateway, y sin él no se da el asiento.** La fila
   * lleva `email` en un índice único por organización —`(organizationId,
   * email)`—, así que la cadena vacía que se escribía aquí solo cabía **una
   * vez**: la segunda persona a la que se le daba asiento en la misma
   * organización chocaba con un P2002 que salía del servicio como una excepción
   * suelta, el gateway lo recogía en su `catch` y contestaba **403 `NOT_IN_ORG`**
   * — «no se le pudo dar asiento», con dos asientos libres y ningún error en
   * ninguna consola. O sea: en cualquier organización, la segunda persona no
   * entraba nunca. Lo destaparon nueve pruebas del chat que llevaban meses en
   * verde.
   *
   * Por eso el correo es obligatorio: es lo único que hace de esa fila una fila
   * distinta. Si el directorio no contesta se falla diciéndolo, en vez de
   * inventar una dirección o volver a escribir la cadena vacía.
   */
  async darAsiento(datos: {
    organizationId: string;
    porUserId: string;
    userId: string;
    /** La dirección de quien entra, resuelta por el gateway. Ver arriba. */
    email?: string;
  }) {
    const permiso = await this.exigirPermiso(
      datos.organizationId,
      datos.porUserId,
      OrganizationPermission.CAN_INVITE_MEMBERS,
    );
    if (esFallo(permiso)) return permiso;

    const email = datos.email?.trim().toLowerCase();
    if (!email) {
      return {
        error: 'No se pudo comprobar el correo de esa persona. Inténtalo dentro de un momento.',
        codigo: 'SIN_CORREO',
      } as Fallo;
    }

    const [organizacion, yaEsta, conEseCorreo, ocupados, papel] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: datos.organizationId },
        include: { subscription: true },
      }),
      this.prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId: datos.organizationId, userId: datos.userId },
        },
      }),
      /* La misma dirección ya puede tener fila aquí: una invitación por correo
         que nadie ha aceptado todavía. No es un choque, es la misma persona
         entrando por la otra puerta — se adopta más abajo. */
      this.prisma.organizationMember.findUnique({
        where: { organizationId_email: { organizationId: datos.organizationId, email } },
      }),
      this.prisma.organizationMember.count({ where: { organizationId: datos.organizationId } }),
      this.prisma.organizationRole.findFirst({
        where: { organizationId: datos.organizationId, isDefault: true },
      }),
    ]);

    if (!organizacion) {
      return { error: 'Esa organización no existe.', codigo: 'NO_EXISTE' } as Fallo;
    }
    if (yaEsta) return { ok: true };
    if (!papel) {
      return { error: 'La organización no tiene papel por defecto.', codigo: 'NO_VALE' } as Fallo;
    }

    /* Una invitación pendiente a esa dirección **ya ocupa su asiento** (es lo que
       impide mandar mil sobre tres), así que entrar por el proyecto la completa
       en vez de pedir otro.
       ⚠️ Y solo si esa fila no es ya de otra cuenta. No debería poder serlo —el
       correo es único en credentials— pero adoptarla a ciegas sería reasignar la
       membresía de otra persona a base de una dirección repetida, y eso no puede
       depender de que una invariante de otro servicio se mantenga. */
    if (conEseCorreo?.userId && conEseCorreo.userId !== datos.userId) {
      return {
        error: 'Ese correo ya es de otra persona dentro de la organización.',
        codigo: 'YA_ESTA',
      } as Fallo;
    }

    if (conEseCorreo) {
      await this.prisma.organizationMember.update({
        where: { id: conEseCorreo.id },
        data: {
          userId: datos.userId,
          status: MembershipStatus.ACTIVE,
          joinedAt: conEseCorreo.joinedAt ?? new Date(),
          /* El enlace que se mandó deja de valer: ya está dentro. */
          inviteTokenHash: null,
          inviteExpiresAt: null,
        },
      });

      await this.olvidar(datos.organizationId, datos.userId);
      await this.olvidar(datos.organizationId, datos.porUserId);
      await this.registrar(datos.organizationId, 'asiento_dado', {
        userId: datos.userId,
        deInvitacionPendiente: true,
      });
      return { ok: true };
    }

    const asientos = topeDeAsientos(organizacion.subscription);
    if (!cabe(ocupados, asientos.tope)) {
      return { error: mensajeSinAsientos(ocupados, asientos), codigo: 'SIN_ASIENTOS' } as Fallo;
    }

    await this.prisma.organizationMember.create({
      data: {
        organizationId: datos.organizationId,
        userId: datos.userId,
        /* 🔴 **Con su correo de verdad, nunca con la cadena vacía.** La columna
           es única por organización: la cadena vacía solo cabía una vez y la
           segunda persona chocaba en silencio. Ver la cabecera. */
        email,
        roleId: papel.id,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });

    await this.olvidar(datos.organizationId, datos.userId);
    /* Y a quien invita: en su lista cacheada está el `seatsUsed` que acaba de
       cambiar, y era suya la pantalla que lo enseña. */
    await this.olvidar(datos.organizationId, datos.porUserId);
    await this.registrar(datos.organizationId, 'asiento_dado', { userId: datos.userId });
    return { ok: true };
  }

  /* ─── El traspaso ──────────────────────────────────────────────────────── */

  /**
   * Le pasa la organización a otra persona.
   *
   * 🔴 **Sin esto una organización muere con su creador**, que es el mismo
   * agujero que tenía un proyecto. Quien se va de la empresa se lleva por delante
   * el sitio donde vive el trabajo del equipo, y no hay ninguna ruta que lo
   * arregle.
   *
   * Dos reglas, y las dos importan:
   *
   * 1. **El nuevo dueño tiene que estar dentro y activo.** Traspasarla a alguien
   *    de fuera la dejaría con un dueño sin asiento, sin forma de entrar en su
   *    propio portal y sin nadie que pueda deshacerlo.
   * 2. **Solo lo hace el dueño.** No es `canManageOrganization`: quien paga es
   *    uno, y regalar la suscripción de otro no es administrar, es otra cosa.
   *
   * ⚠️ **No mueve la suscripción de Stripe.** El cliente sigue siendo el mismo
   * en su sistema; lo que cambia es quién manda aquí. Cambiar el `customer` de
   * Stripe es una operación suya, con su propio consentimiento, y mezclarla con
   * esto haría que un traspaso pudiera fallar a medias con la organización ya
   * cambiada de manos.
   */
  async traspasar(datos: { organizationId: string; porUserId: string; userId: string }) {
    const organizacion = await this.prisma.organization.findUnique({
      where: { id: datos.organizationId },
    });
    if (!organizacion) {
      return { error: 'Esa organización no existe.', codigo: 'NO_EXISTE' } as Fallo;
    }
    if (organizacion.ownerUserId !== datos.porUserId) {
      return {
        error: 'Solo quien es dueño de la organización puede traspasarla.',
        codigo: 'SIN_PERMISO',
      } as Fallo;
    }
    if (organizacion.ownerUserId === datos.userId) {
      return { error: 'Ya es suya.', codigo: 'YA_ESTA' } as Fallo;
    }
    if (organizacion.kind === OrganizationKind.PERSONAL) {
      /* La personal es de una persona por definición, y además solo puede haber
         una por cuenta: traspasarla dejaría a quien la recibe con dos. */
      return {
        error: 'Tu espacio personal no se traspasa. Crea una organización para compartir trabajo.',
        codigo: 'NO_VALE',
      } as Fallo;
    }

    const destino = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId: datos.organizationId,
        userId: datos.userId,
        status: MembershipStatus.ACTIVE,
      },
    });
    if (!destino) {
      return {
        error: 'Esa persona tiene que estar dentro de la organización para recibirla.',
        codigo: 'NO_VALE',
      } as Fallo;
    }

    const administracion = await this.prisma.organizationRole.findFirst({
      where: { organizationId: datos.organizationId, name: ORG_ROLE_ADMIN_NAME },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: datos.organizationId },
        data: { ownerUserId: datos.userId },
      });
      /* Quien la deja se queda dentro con el papel de administración, no fuera.
         Sacarlo sería una segunda consecuencia de una sola acción, y la segunda
         no se puede deshacer. */
      if (administracion) {
        await tx.organizationMember.updateMany({
          where: { organizationId: datos.organizationId, userId: datos.porUserId },
          data: { roleId: administracion.id },
        });
      }
    });

    await this.olvidar(datos.organizationId, datos.porUserId);
    await this.olvidar(datos.organizationId, datos.userId);
    await this.registrar(datos.organizationId, 'organizacion_traspasada', {
      de: datos.porUserId,
      a: datos.userId,
    });
    return { ok: true };
  }

  /* ─── Eliminar ─────────────────────────────────────────────────────────── */

  /**
   * Elimina una organización propia. **No se deshace.**
   *
   * Solo quien es dueño, y solo una de empresa: el espacio personal es de la persona por
   * definición y es donde caen sus cuotas, así que no se borra. Se niega, con el motivo, cuando:
   *
   * - **hay una suscripción de pago viva.** Borrar la fila no cancela nada en Stripe, y se
   *   seguiría cobrando por una organización que ya no existe. Se cancela primero en Facturación.
   * - **quedan proyectos dentro** (lo comprueba el gateway, que es quien habla con projects-service):
   *   un proyecto sin organización es un proyecto huérfano, y `Project.organizationId` es NOT NULL.
   *
   * Los miembros se quitan **antes** que los papeles: `OrganizationMember.roleId` es `Restrict`, y
   * Postgres comprueba eso al momento, no al final del cascade. Lo demás —suscripción vacía,
   * imagen, plantillas— cae con la organización; el historial de eventos se queda sin organización
   * (`SetNull`) porque es la memoria de lo que movió dinero. La memoria de la prueba gratuita
   * (`TrialRedemption`) tampoco se toca: borrar y recrear no puede dar otro mes.
   */
  async eliminar(datos: { organizationId: string; porUserId: string }) {
    const organizacion = await this.prisma.organization.findUnique({
      where: { id: datos.organizationId },
      include: { subscription: true },
    });
    if (!organizacion) {
      return { error: 'Esa organización no existe.', codigo: 'NO_EXISTE' } as Fallo;
    }
    if (organizacion.ownerUserId !== datos.porUserId) {
      return {
        error: 'Solo quien es dueño de la organización puede eliminarla.',
        codigo: 'SIN_PERMISO',
      } as Fallo;
    }
    /* Siempre queda al menos una propia: es el respaldo donde caen los proyectos sin
       organización y el plan gratuito. Puede ser cualquiera, no necesariamente la personal. */
    if ((await this.contarPropias(datos.porUserId)) <= 1) {
      return {
        error: 'Necesitas al menos una organización propia. Crea otra antes de eliminar esta.',
        codigo: 'NO_VALE',
      } as Fallo;
    }

    const suscripcion = organizacion.subscription;
    const viva =
      suscripcion &&
      suscripcion.tier !== PlanTier.FREE &&
      suscripcion.status !== SubscriptionStatus.CANCELED;
    if (viva) {
      return {
        error:
          'Tiene un plan de pago activo. Cancélalo en Facturación antes de eliminar la organización: borrarla no deja de cobrarlo.',
        codigo: 'EN_USO',
      } as Fallo;
    }

    const miembros = await this.prisma.organizationMember.findMany({
      where: { organizationId: datos.organizationId },
      select: { userId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMember.deleteMany({ where: { organizationId: datos.organizationId } });
      await tx.organizationRole.deleteMany({ where: { organizationId: datos.organizationId } });
      await tx.projectRoleTemplate.deleteMany({
        where: { organizationId: datos.organizationId },
      });
      await tx.organization.delete({ where: { id: datos.organizationId } });
    });

    /* Lo cacheado de la organización y de **cada** persona que estaba dentro: su lista de
       organizaciones y sus permisos ya no son los de hace un segundo. */
    await this.olvidar(datos.organizationId);
    for (const { userId } of miembros) {
      if (userId) await this.olvidar(datos.organizationId, userId);
    }
    this.log.log(`Organización ${datos.organizationId} eliminada por ${datos.porUserId}.`);
    return { ok: true };
  }

  /**
   * Olvida lo cacheado de una organización, y de una persona si se dice cuál.
   *
   * 🔴 **Va en toda escritura que cambia quién puede qué**, y no es una
   * optimización: sin ella, un permiso retirado sigue abierto hasta que venza el
   * TTL. Treinta segundos no es «un poco de retraso», es un agujero con reloj.
   *
   * ⚠️ Nunca falla hacia fuera: si Redis no responde, lo que quede vive como
   * mucho un TTL y se sigue. Una caché que puede tumbar una escritura es peor
   * que no tener caché.
   */
  private async olvidar(organizationId: string, userId?: string) {
    await this.redis.olvidarOrganizacion(organizationId);
    if (userId) await this.redis.olvidarUsuario(userId);
  }

  /** Apunta un gesto que ocurrió fuera de este servicio. Ver `billing_org_log`. */
  async apuntar(datos: { organizationId: string; type: string; payload?: unknown }) {
    await this.registrar(datos.organizationId, datos.type, datos.payload);
    return { ok: true };
  }

  /** Una línea en el registro. Nunca falla hacia fuera: es prueba, no camino. */
  private async registrar(organizationId: string, type: string, payload?: unknown) {
    await this.prisma.billingEvent
      .create({ data: { organizationId, type, payload: payload as never } })
      .catch((error: Error) => {
        this.log.error(`No se pudo registrar «${type}» de ${organizationId}: ${error.message}`);
      });
  }

  /**
   * La persona eliminó su cuenta de Kyloo: se limpia lo que billing sabe de ella y se resuelve qué
   * pasa con lo que era suyo.
   *
   * - Las invitaciones **pendientes** a su correo se borran: son solo su correo y ocupaban asiento.
   * - Las organizaciones de **equipo** de las que era dueña pasan a la persona **activa más antigua
   *   con el mismo papel** (el de administración): sigue habiendo alguien con control. Un miembro
   *   con menos papel NUNCA hereda: recibiría de golpe el control de la facturación.
   * - Sin heredero, la organización **se conserva intacta**: no se borra nada que otras personas o
   *   un plan de pago puedan necesitar, y se avisa en el log (`ORGANIZACION_HUERFANA`) para que
   *   alguien del equipo decida. La personal también se conserva: es solo de ella y no estorba.
   * - Donde ya no es dueña, su membresía se borra (libera el asiento). Donde sigue siéndolo
   *   (huérfanas y personal), solo se anonimiza el correo para no tocar quién es dueño.
   *
   * ⚠️ **No toca dinero.** Cancelar una suscripción de Stripe vive en el gateway y es una decisión
   * con consecuencias (se cobra a una persona que ya no está): por eso el log nombra las huérfanas
   * con plan de pago, para cancelarlas a mano. Ver `docs/deploy/KYLOO-ELIMINACION-DE-CUENTA.md`.
   *
   * Idempotente: repetido, ya no es dueña de nada que transferir ni tiene filas que borrar.
   */
  async anonimizarPersona(userId: string, email: string) {
    const invitaciones = await this.prisma.organizationMember.deleteMany({
      where: { status: MembershipStatus.INVITED, email: { equals: email, mode: 'insensitive' } },
    });

    const transferidas: string[] = [];
    const huerfanas: Array<{ organizationId: string; plan: string }> = [];
    const suyas = await this.prisma.organization.findMany({
      where: { ownerUserId: userId },
      select: { id: true, kind: true, subscription: { select: { tier: true, status: true } } },
    });
    for (const organizacion of suyas) {
      if (organizacion.kind === OrganizationKind.PERSONAL) continue;
      const suya = await this.prisma.organizationMember.findFirst({
        where: { organizationId: organizacion.id, userId },
        select: { roleId: true },
      });
      const heredero = suya
        ? await this.prisma.organizationMember.findFirst({
            where: {
              organizationId: organizacion.id,
              status: MembershipStatus.ACTIVE,
              roleId: suya.roleId,
              userId: { not: userId },
              NOT: { userId: null },
            },
            orderBy: { joinedAt: 'asc' },
            select: { userId: true },
          })
        : null;
      if (heredero?.userId) {
        await this.prisma.organization.update({
          where: { id: organizacion.id },
          data: { ownerUserId: heredero.userId },
        });
        await this.olvidar(organizacion.id, heredero.userId);
        await this.olvidar(organizacion.id, userId);
        transferidas.push(organizacion.id);
        this.log.log(
          `Organización ${organizacion.id}: dueño pasa de la cuenta eliminada a otra persona.`,
        );
      } else {
        const plan = organizacion.subscription
          ? `${organizacion.subscription.tier}/${organizacion.subscription.status}`
          : 'sin suscripción';
        huerfanas.push({ organizationId: organizacion.id, plan });
        this.log.warn(
          `ORGANIZACION_HUERFANA ${organizacion.id}: su dueña eliminó la cuenta y nadie puede heredarla. Plan: ${plan}. Si es de pago, cancelarlo a mano en Stripe.`,
        );
      }
    }

    /* Donde ya no es dueña, fuera: libera el asiento. Donde lo sigue siendo, solo el correo. */
    const siguenSiendoSuyas = suyas
      .map((organizacion) => organizacion.id)
      .filter((id) => !transferidas.includes(id));
    const liberadas = await this.prisma.organizationMember.deleteMany({
      where: { userId, organizationId: { notIn: siguenSiendoSuyas } },
    });
    const anonimizadas = await this.prisma.organizationMember.updateMany({
      where: { userId },
      data: { email: `eliminada-${userId}@eliminada.invalid` },
    });

    return {
      invitacionesBorradas: invitaciones.count,
      membresiasLiberadas: liberadas.count,
      membresiasAnonimizadas: anonimizadas.count,
      transferidas,
      huerfanas,
    };
  }
}

/**
 * El hash con el que se guarda un token de invitación.
 *
 * SHA-256 a secas y no bcrypt, y es la misma decisión que toma el token de
 * verificación de correo: esto no es una contraseña elegida por una persona
 * —son 24 bytes aleatorios— así que no hay diccionario que probar y el coste de
 * un hash lento no compra nada. Lo que sí compra es que el token en claro no
 * esté en la base.
 */
function hashDe(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Todos los permisos de proyecto que existen. */
const PERMISOS_DE_PROYECTO = Object.values(ProjectPermission);

/**
 * Un diccionario de permisos de proyecto con solo estos a `true`.
 *
 * ⚠️ **Diccionario, no lista**, igual que en la organización: los roles de
 * proyecto guardados como array son la deuda que todavía se normaliza al leer en
 * projects-service, y las plantillas nacen ya en la forma buena.
 */
function permisosDeProyecto(concedidos: ProjectPermission[]): Record<string, boolean> {
  const dado = new Set<string>(concedidos);
  return Object.fromEntries(PERMISOS_DE_PROYECTO.map((clave) => [clave, dado.has(clave)]));
}
