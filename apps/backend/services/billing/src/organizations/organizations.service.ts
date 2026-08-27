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
  cabenEn,
  estaVigente,
  mejorPlan,
  normalizarPermisosOrg,
  permisosDeAdministracion,
  permisosDeDueno,
  permisosDeMiembro,
  quotasDe,
} from '@praxis/contracts';
import { PrismaService } from '../prisma/prisma.service';

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
    | 'INVITACION_INVALIDA';
}

export function esFallo(valor: unknown): valor is Fallo {
  return typeof valor === 'object' && valor !== null && 'codigo' in valor && 'error' in valor;
}

@Injectable()
export class OrganizationsService {
  private readonly log = new Logger(OrganizationsService.name);
  private readonly inviteTtlHoras: number;

  constructor(
    private readonly prisma: PrismaService,
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
   * Qué plan vale para alguien, mirando **todas** sus organizaciones.
   *
   * Alguien puede estar en la suya personal y a la vez en la de su empresa. Si
   * el plan dependiera de cuál está mirando, la misma acción se permitiría o se
   * negaría según la pantalla, que no hay forma de explicar. Vale el mejor.
   *
   * ⚠️ **Una suscripción que no está vigente no cuenta**, pero tampoco estorba:
   * una BUSINESS cancelada deja de dar BUSINESS y se cae al siguiente mejor, que
   * es lo que hace que darse de baja funcione sin tocar nada más.
   *
   * ⚠️ **No crea la organización personal.** Esto se llama en cada comprobación
   * de cuota —o sea, casi en cada escritura del producto— y crear una fila ahí
   * convertiría una lectura en una escritura para todo el mundo. Sin fila, FREE,
   * que es exactamente lo mismo que diría la fila.
   */
  async planEfectivoDe(userId: string) {
    const membresias = await this.prisma.organizationMember.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      include: { organization: { include: { subscription: true } } },
    });

    const vigentes = membresias
      .flatMap((membresia) => membresia.organization.subscription ?? [])
      .filter((suscripcion) => estaVigente(suscripcion.status as SubscriptionStatus));

    const tier = mejorPlan(vigentes.map((suscripcion) => suscripcion.tier));

    /* Se devuelve también de qué organización sale el plan bueno: la pantalla
       lo necesita para decir «este tope te lo da Estudio Nordeste» en vez de un
       número sin dueño, que es lo que hace que un límite se lea como avería. */
    const fuente = vigentes.find((suscripcion) => suscripcion.tier === tier) ?? null;

    return {
      userId,
      tier,
      quotas: quotasDe(tier),
      status: (fuente?.status ?? SubscriptionStatus.ACTIVE) as SubscriptionStatus,
      organizationId: fuente?.organizationId ?? null,
      trialEndsAt: fuente?.trialEndsAt ?? null,
      currentPeriodEnd: fuente?.currentPeriodEnd ?? null,
      cancelAt: fuente?.cancelAt ?? null,
    };
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
    const membresias = await this.prisma.organizationMember.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      include: {
        role: true,
        organization: { include: { subscription: true, _count: { select: { members: true } } } },
      },
      orderBy: [{ organization: { kind: 'asc' } }, { invitedAt: 'asc' }],
    });

    return membresias.map((membresia) => this.vista(membresia.organization, membresia, userId));
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
      createdAt: Date;
      subscription: { tier: string; seats: number } | null;
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
      /* `_count.members` cuenta invitadas **y** activas, que es justo lo que
         significa un asiento gastado. Ver la nota de `OrganizationMember`. */
      seatsUsed: organizacion._count?.members ?? 0,
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
    return `${base}-${randomBytes(2).toString('hex')}`;
  }

  async renombrar(organizationId: string, userId: string, name: string) {
    /* Renombrar es identidad, no gestión de gente: se separó de
       `canManageMembers` para que quien lleva el equipo pueda arreglar una
       errata sin poder además tocar quién está dentro. */
    const permiso = await this.exigirPermiso(
      organizationId,
      userId,
      OrganizationPermission.CAN_MANAGE_ORGANIZATION,
    );
    if (esFallo(permiso)) return permiso;

    const organizacion = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { name: name.trim() },
      include: { subscription: true, _count: { select: { members: true } } },
    });
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

    const asientos = organizacion.subscription?.seats ?? 1;
    if (ocupados >= asientos) {
      /* ⚠️ Se cuenta antes de escribir y con las invitaciones dentro. Si una
         invitación no ocupara asiento se podrían mandar mil sobre tres, y el
         tope se rompería en el momento de aceptarlas — con la organización ya
         por encima de lo que paga y nada que hacer salvo echar a alguien. */
      return {
        error: `No quedan asientos: ${ocupados} de ${asientos} ocupados, contando las invitaciones pendientes.`,
        codigo: 'SIN_ASIENTOS',
      } as Fallo;
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
    await this.registrar(datos.organizationId, 'miembro_retirado', {
      email: miembro.email,
      userId: miembro.userId,
    });
    return { ok: true };
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
    const [organizacion, membresia] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId } }),
      this.prisma.organizationMember.findFirst({
        where: { organizationId, userId, status: MembershipStatus.ACTIVE },
        include: { role: true },
      }),
    ]);

    if (!organizacion || !membresia) return null;

    if (organizacion.ownerUserId === userId) {
      return { permisos: permisosDeDueno(), esDueno: true, roleName: null };
    }
    return {
      permisos: normalizarPermisosOrg(membresia.role.permissions),
      esDueno: false,
      roleName: membresia.role.name,
    };
  }

  /** ¿Tiene asiento activo aquí? Lo que pregunta el gateway en cada escritura. */
  async esMiembroDe(organizationId: string, userId: string): Promise<boolean> {
    const membresia = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId, status: MembershipStatus.ACTIVE },
      select: { id: true },
    });
    return membresia !== null;
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
        error: `Ese papel lo llevan ${papel._count.members} personas: cámbialas de papel antes de borrarlo.`,
        codigo: 'EN_USO',
      } as Fallo;
    }

    await this.prisma.organizationRole.delete({ where: { id: papel.id } });
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

    await this.registrar(datos.organizationId, 'organizacion_traspasada', {
      de: datos.porUserId,
      a: datos.userId,
    });
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
