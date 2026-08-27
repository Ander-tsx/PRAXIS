import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MembershipStatus,
  OrganizationKind,
  OrganizationRole,
  PLANS,
  PlanTier,
  SubscriptionStatus,
  estaVigente,
  mejorPlan,
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

  /* ─── La organización personal ─────────────────────────────────────────── */

  /**
   * La organización personal de alguien, creándola si aún no existe.
   *
   * ## Por qué se crea aquí y no al registrarse
   *
   * Porque rellenar una tabla para todo el mundo antes de que sirva de algo es
   * una migración pendiente disfrazada, y porque **sin fila el plan ya es el
   * correcto**: FREE. La fila aparece la primera vez que hace falta guardar
   * algo —un pago, una invitación aceptada— y no antes.
   *
   * ## La carrera, que es real
   *
   * Dos peticiones simultáneas de alguien que aún no la tiene entran las dos por
   * el `findFirst`, las dos ven `null` y las dos crean. El índice único parcial
   * de la migración (`organizations_personal_por_usuario`) hace que la segunda
   * falle con P2002, y aquí se recoge volviendo a leer. Sin ese índice habría
   * dos organizaciones y la suscripción se guardaría en la que no se lee.
   */
  async personalDe(userId: string) {
    const existente = await this.prisma.organization.findFirst({
      where: { ownerUserId: userId, kind: OrganizationKind.PERSONAL },
      include: { subscription: true },
    });
    if (existente) return existente;

    try {
      return await this.prisma.organization.create({
        data: {
          kind: OrganizationKind.PERSONAL,
          ownerUserId: userId,
          members: {
            create: {
              userId,
              /* No hay correo que poner: la personal no invita a nadie y nunca
                 se le manda un mensaje. La cadena vacía sería mentir menos que
                 inventar una dirección, y el único de la tabla que lo tiene así
                 es este caso. */
              email: '',
              role: OrganizationRole.OWNER,
              status: MembershipStatus.ACTIVE,
              joinedAt: new Date(),
            },
          },
        },
        include: { subscription: true },
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

  /** Las de empresa a las que pertenece, con su papel y sus asientos. */
  async organizacionesDe(userId: string) {
    const membresias = await this.prisma.organizationMember.findMany({
      where: { userId, status: MembershipStatus.ACTIVE, organization: { kind: 'ENTERPRISE' } },
      include: {
        organization: { include: { subscription: true, _count: { select: { members: true } } } },
      },
      orderBy: { invitedAt: 'asc' },
    });

    return membresias.map((membresia) => this.vista(membresia.organization, membresia.role));
  }

  /** Una, con la comprobación de que quien pregunta está dentro. */
  async una(organizationId: string, userId: string) {
    const membresia = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId, status: MembershipStatus.ACTIVE },
      include: {
        organization: { include: { subscription: true, _count: { select: { members: true } } } },
      },
    });
    if (!membresia) {
      return { error: 'No perteneces a esa organización.', codigo: 'NO_ERES_MIEMBRO' } as Fallo;
    }
    return this.vista(membresia.organization, membresia.role);
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
    myRole: string,
  ) {
    return {
      id: organizacion.id,
      kind: organizacion.kind as OrganizationKind,
      name: organizacion.name,
      slug: organizacion.slug,
      ownerUserId: organizacion.ownerUserId,
      tier: (organizacion.subscription?.tier ?? PlanTier.FREE) as PlanTier,
      myRole: myRole as OrganizationRole,
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

    const organizacion = await this.prisma.organization.create({
      data: {
        kind: OrganizationKind.ENTERPRISE,
        name: datos.name.trim(),
        slug: await this.slugLibre(datos.name),
        ownerUserId: datos.ownerUserId,
        members: {
          create: {
            userId: datos.ownerUserId,
            email: datos.ownerEmail,
            role: OrganizationRole.OWNER,
            status: MembershipStatus.ACTIVE,
            joinedAt: new Date(),
          },
        },
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
      include: { subscription: true, _count: { select: { members: true } } },
    });

    return this.vista(organizacion, OrganizationRole.OWNER);
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
    const permiso = await this.exigir(organizationId, userId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
    if (esFallo(permiso)) return permiso;

    const organizacion = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { name: name.trim() },
      include: { subscription: true, _count: { select: { members: true } } },
    });
    return this.vista(organizacion, permiso.role);
  }

  /* ─── Miembros ─────────────────────────────────────────────────────────── */

  async miembros(organizationId: string, userId: string) {
    const permiso = await this.exigir(organizationId, userId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
      OrganizationRole.MEMBER,
    ]);
    if (esFallo(permiso)) return permiso;

    const filas = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: [{ role: 'asc' }, { invitedAt: 'asc' }],
    });

    return filas.map((fila) => ({
      userId: fila.userId,
      email: fila.email,
      /* El nombre lo pega el gateway, que es quien tiene el directorio. Aquí
         solo está el correo, que es lo que se escribió al invitar. */
      name: null as string | null,
      role: fila.role as OrganizationRole,
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
    role?: OrganizationRole;
  }) {
    const permiso = await this.exigir(datos.organizationId, datos.porUserId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
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

    const token = randomBytes(24).toString('hex');
    const expira = new Date(Date.now() + this.inviteTtlHoras * 3600_000);

    await this.prisma.organizationMember.create({
      data: {
        organizationId: datos.organizationId,
        email,
        role: datos.role ?? OrganizationRole.MEMBER,
        status: MembershipStatus.INVITED,
        inviteTokenHash: hashDe(token),
        inviteExpiresAt: expira,
      },
    });

    await this.registrar(datos.organizationId, 'miembro_invitado', { email, role: datos.role });

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
    role: OrganizationRole;
  }) {
    const permiso = await this.exigir(datos.organizationId, datos.porUserId, [
      OrganizationRole.OWNER,
    ]);
    if (esFallo(permiso)) return permiso;

    const miembro = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: datos.organizationId, userId: datos.userId },
      },
    });
    if (!miembro) return { error: 'Esa persona no está dentro.', codigo: 'NO_EXISTE' } as Fallo;
    if (miembro.role === OrganizationRole.OWNER) {
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
      data: { role: datos.role },
    });
    await this.registrar(datos.organizationId, 'rol_cambiado', {
      userId: datos.userId,
      role: datos.role,
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
    const permiso = await this.exigir(datos.organizationId, datos.porUserId, [
      OrganizationRole.OWNER,
      OrganizationRole.ADMIN,
    ]);
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
    if (miembro.role === OrganizationRole.OWNER) {
      return {
        error: 'Al dueño no se le puede sacar de su propia organización.',
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

  /* ─── Comprobación de papel ────────────────────────────────────────────── */

  /**
   * Que quien pregunta esté dentro y con papel suficiente.
   *
   * ⚠️ **Devuelve el `Fallo` en vez de lanzarlo**, por lo mismo que todo lo
   * demás de este archivo: quien traduce a HTTP es el gateway. Y distingue «no
   * estás dentro» de «estás pero no puedes», que en la pantalla son dos frases
   * distintas — la primera se arregla pidiendo una invitación y la segunda no.
   */
  async exigir(organizationId: string, userId: string, admitidos: OrganizationRole[]) {
    const membresia = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId, status: MembershipStatus.ACTIVE },
    });
    if (!membresia) {
      return { error: 'No perteneces a esa organización.', codigo: 'NO_ERES_MIEMBRO' } as Fallo;
    }
    if (!admitidos.includes(membresia.role as OrganizationRole)) {
      return {
        error: 'Tu papel en la organización no alcanza para esto.',
        codigo: 'SIN_PERMISO',
      } as Fallo;
    }
    return { role: membresia.role as OrganizationRole };
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
