import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import { ProjectDomainOutboxFactory } from '../domain-events/project-domain-outbox.factory';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import {
  CreateProjectDto,
  FindProjectsByMemberDto,
  FindProjectsDto,
  UpdateProjectDto,
} from '@praxis/contracts';
import { expandPermissions, normalizePermissions } from '../project-roles/permission-map';
import { generarSlugUnico } from './slug.util';

const PROJECT_CACHE_TTL = 300; // 5 min
const MEMBER_PROJECTS_TTL = 60; // 1 min — proyectos visibles por usuario

/** Rol que se crea con el proyecto para que el dueño pueda operar y delegar. */
const DEFAULT_ROLE_NAME = 'Administrador';

const DEFAULT_ROLE_PERMISSIONS: Record<string, boolean> = {
  canViewProject: true,
  canCreateBoard: true,
  canEditBoard: true,
  canDeleteBoard: true,
  canCreateColumn: true,
  canEditColumn: true,
  canDeleteColumn: true,
  canCreateTask: true,
  canMoveTask: true,
  canEditTask: true,
  canDeleteTask: true,
  canManageMembers: true,
  canManageRoles: true,
  canManageAutomations: true,
  canManageIntegrations: true,
  canComment: true,
  canManageLabels: true,
  canDeleteProject: true,
  canManageSprint: true,
  canEditDocuments: true,
};

/** P2002 de Prisma: violación de restricción única. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

@Injectable()
export class ProjectsService {
  private readonly domainOutbox = new ProjectDomainOutboxFactory();
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /* ─── Projects ───────────────────────────────────────────────────── */

  /**
   * Crea el proyecto y lo deja **usable desde el primer momento**: con un rol
   * de administración y con el dueño dentro como miembro.
   *
   * Antes solo insertaba la fila. El dueño tenía acceso por el bypass del
   * guard, pero `GET /projects/:id/members` salía vacío y no se podía añadir a
   * nadie, porque hace falta un `projectRoleId` que aún no existía. La interfaz
   * quedaba obligada a encadenar *crear proyecto → crear rol → añadir gente*, y
   * un proyecto recién creado parecía roto.
   *
   * Todo en una transacción: un proyecto sin su rol sería justo el estado que
   * queremos evitar.
   */
  async createProject(dto: CreateProjectDto) {
    try {
      const project = await this.prisma.$transaction(async (tx) => {
        /* Dentro de la transacción y con `tx`, no con `this.prisma`: mirando
           por fuera no vería los proyectos creados en esta misma transacción.
           Aun así quien garantiza la unicidad es el índice, no esta consulta —
           entre comprobar e insertar cabe otra petición, y ese caso lo recoge
           el P2002 de abajo. */
        const slug = await generarSlugUnico(dto.name, async (candidato) => {
          const existente = await tx.project.findUnique({
            where: { slug: candidato },
            select: { id: true },
          });
          return existente !== null;
        });

        const project = await tx.project.create({
          data: {
            name: dto.name,
            slug,
            description: dto.description,
            ownerId: dto.ownerId,
            organizationId: dto.organizationId,
          },
        });

        const adminRole = await tx.projectRole.create({
          data: {
            name: DEFAULT_ROLE_NAME,
            projectId: project.id,
            permissions: DEFAULT_ROLE_PERMISSIONS,
          },
        });

        await tx.projectMember.create({
          data: {
            projectId: project.id,
            userId: dto.ownerId,
            projectRoleId: adminRole.id,
          },
        });

        return project;
      });

      /* El dueño acaba de ganar un proyecto: su lista cambió. */
      await this.invalidarListasDe([dto.ownerId]);
      return project;
    } catch (error) {
      /**
       * `Project.name` es `@unique` **global**, así que un nombre repetido por
       * otro equipo salía como error no controlado → 500. Ahora es un 409 con
       * mensaje útil.
       *
       * La unicidad es **por dueño** desde la migración
       * `project_name_unique_per_owner`: antes era global y el nombre chocaba con
       * el proyecto de un equipo que no conoces, con un mensaje que no había
       * forma de entender.
       */
      if (isUniqueViolation(error)) {
        throw new RpcException({
          statusCode: 409,
          message: `Ya tienes un proyecto llamado "${dto.name}".`,
        });
      }
      throw error;
    }
  }

  async findAllProjects(dto: FindProjectsDto) {
    const page = dto.query?.page ?? 1;
    const limit = dto.query?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    /**
     * Dueño **o** miembro. Antes el gateway enviaba `userId` y aquí solo se
     * miraba `ownerId`, así que el `where` quedaba vacío y se devolvían todos
     * los proyectos del sistema a cualquiera.
     */
    if (dto.userId) {
      /**
       * Con `permission`, ser miembro no basta: hay que serlo **con un rol que
       * conceda ese permiso**. El dueño sigue pasando siempre, igual que en el
       * guard, que le da bypass.
       *
       * El filtro se aplica al `where`, no al resultado: así `total` y la
       * paginación siguen contando lo que de verdad se puede ver. Filtrar
       * después de paginar devolvería páginas de tamaño irregular y un total
       * que miente.
       */
      const memberScope = dto.permission
        ? { id: { in: await this.projectIdsWithPermission(dto.userId, dto.permission) } }
        : { members: { some: { userId: dto.userId } } };

      where.OR = [{ ownerId: dto.userId }, memberScope];
    }

    /* ⚠️ **Se suma al filtro de arriba, no lo reemplaza.** Es el selector de
       organización del sidebar acotando lo que ya puedes ver; si sustituyera al
       `OR`, escribir un identificador ajeno en la URL enseñaría los proyectos de
       una empresa entera. */
    if (dto.organizationId) where.organizationId = dto.organizationId;

    /**
     * Los archivados no salen en ningún listado normal, ni para el dueño.
     *
     * Es lo que significa `DELETED`: retirado de la vista de todos menos del
     * panel de administración, que usa `findAllForAdmin`. Los **suspendidos sí
     * salen** —el dueño y los miembros siguen viéndolos, solo que no pueden
     * tocarlos— porque esconder un proyecto suspendido lo haría indistinguible de
     * uno borrado y nadie sabría a quién preguntar.
     */
    where.status = { not: 'DELETED' };

    // Filtro estricto por propietario, para herramientas de administración.
    if (dto.ownerId) where.ownerId = dto.ownerId;

    if (dto.search) {
      where.AND = [
        {
          OR: [
            { name: { contains: dto.search, mode: 'insensitive' } },
            { description: { contains: dto.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        /* `suspendedBy` es el id de quien administra la plataforma, y el rol global
           es privado (`docs/backend/permissions.md`): devolverlo aquí le diría a
           cualquier dueño qué cuenta es administradora. El motivo y la fecha sí
           salen —son lo que explica el aviso—, el autor no. El panel lo lee por su
           propia ruta, `findAllForAdmin`, que no omite nada. */
        omit: { suspendedBy: true },
        include: {
          _count: { select: { members: true, workspaces: true } },
          /**
           * Los primeros miembros, **solo sus ids**.
           *
           * La rejilla de proyectos enseña las caras del equipo en cada
           * tarjeta. Con solo `_count` había que pedir
           * `GET /projects/:id/members` una vez por proyecto —doce por página—
           * antes siquiera de empezar a resolver los perfiles.
           *
           * `take` es 4 porque es lo que caben en la tarjeta antes del «+N», y
           * ese resto sale de `_count.members`, que sigue siendo **el total de
           * verdad**. Traer todos los miembros de todos los proyectos para
           * enseñar cuatro sería cambiar doce peticiones por una consulta
           * gorda.
           *
           * `joinedAt asc` para que el orden sea estable entre cargas y empiece
           * por quien lleva más tiempo —el dueño entra como miembro al crear el
           * proyecto, así que sale el primero—.
           *
           * ⚠️ Es una lista de `userId`: projects-service no conoce a las
           * personas. Los nombres y las fotos los resuelve quien pinta, contra
           * `GET /users?ids=`.
           */
          members: {
            take: 4,
            orderBy: { joinedAt: 'asc' },
            select: { userId: true },
          },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Proyectos donde el usuario es dueño o miembro.
   *
   * ⚠️ **Hoy solo lo consume la capa de voz** (`project_find_by_member`, desde
   * `PraxisDataService`). El selector de Análisis dejó de usarlo: pide
   * `GET /projects` con `permission`, que resuelve `findAllProjects` y no
   * cachea. Conviene saberlo antes de razonar sobre la frescura de esta clave —
   * alexa-service cachea encima con su propio TTL, así que invalidar aquí acorta
   * la ventana pero no la cierra.
   */
  async findProjectsByMember(dto: FindProjectsByMemberDto) {
    const cacheKey = this.claveDeListaDe(dto.userId);
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const projects = await this.prisma.project.findMany({
      where: {
        /* Igual que en `findAllProjects`: los archivados no salen, los
           suspendidos sí. */
        status: { not: 'DELETED' },
        OR: [{ ownerId: dto.userId }, { members: { some: { userId: dto.userId } } }],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        /* Sin esto, el selector de proyectos de Análisis recibe filas sin slug
           y sigue construyendo enlaces con el UUID. Es un `select` explícito:
           añadir la columna al modelo no la trae sola. */
        slug: true,
        description: true,
        ownerId: true,
        /* El estado va en el `select` explícito o no llega: sin él, el selector
           de proyectos de Análisis no puede marcar los suspendidos y ofrece
           acciones que van a fallar. */
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.redis.set(cacheKey, projects, MEMBER_PROJECTS_TTL);
    return projects;
  }

  /** La clave de la lista de proyectos de una persona. En un solo sitio. */
  private claveDeListaDe(userId: string): string {
    return `projects:member:${userId}`;
  }

  /**
   * Retira de la caché la lista de proyectos de quien corresponda.
   *
   * ⚠️ **Se invalidaba en un solo sitio de los cinco que cambian su contenido.**
   * `setStatus` lo hacía con cuidado —y con la nota explicando por qué— pero
   * crear, renombrar, borrar y el alta y baja de miembros no, aunque los cinco
   * cambian exactamente lo mismo que esa clave guarda. El resultado era una lista
   * que se quedaba hasta un minuto por detrás de la realidad según por qué camino
   * hubiera cambiado, que es la peor forma de estar mal: intermitente.
   *
   * No es un agujero —el guard sigue negando el acceso a un proyecto que ya no se
   * tiene— sino una lista que miente durante un minuto.
   */
  private async invalidarListasDe(userIds: Iterable<string>): Promise<void> {
    const unicos = [...new Set([...userIds])].filter(Boolean);
    if (unicos.length === 0) return;
    await Promise.all(unicos.map((userId) => this.redis.del(this.claveDeListaDe(userId))));
  }

  /** Quién ve un proyecto en su lista: su dueño y sus miembros. */
  private async quienesLoVen(projectId: string): Promise<string[]> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true, members: { select: { userId: true } } },
    });
    if (!project) return [];
    return [project.ownerId, ...project.members.map((m) => m.userId)];
  }

  /**
   * Proyectos donde este usuario es miembro **con un rol que concede
   * `permission`**, ya expandido por jerarquía.
   *
   * Una sola consulta para todos sus proyectos, no una por proyecto: se traen
   * sus filas de `projectMember` con el rol embebido y la expansión se hace en
   * memoria, que es donde ya vivía. La jerarquía sale de `permission-map.ts`,
   * la misma que usa `ProjectRolesService` — una segunda copia sería una copia
   * que se queda atrás en cuanto alguien añada un permiso.
   *
   * No pasa por la caché de Redis de permisos (`project:…:user:…:permissions`),
   * que es por proyecto: leer N claves para evitar una consulta no compensa. El
   * efecto lateral es que aquí un cambio de rol se ve al instante y en
   * `permissions/me` tarda hasta 300 s, lo cual va en la dirección segura.
   */
  private async projectIdsWithPermission(userId: string, permission: string): Promise<string[]> {
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true, projectRole: { select: { permissions: true } } },
    });

    return memberships
      .filter(
        (m) => expandPermissions(normalizePermissions(m.projectRole?.permissions))[permission],
      )
      .map((m) => m.projectId);
  }

  async findOneProject(id: string) {
    const cacheKey = `project:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const project = await this.prisma.project.findUnique({
      where: { id },
      /* Igual que en los listados: el dueño necesita `status` y `suspendedReason`
         para el aviso de su pantalla, pero `suspendedBy` le diría qué cuenta es
         administradora, y el rol global es privado. El guard tampoco lo usa: solo
         mira el estado y el motivo. */
      omit: { suspendedBy: true },
      include: {
        workspaces: {
          include: {
            boards: { include: { columns: { orderBy: { order: 'asc' } } } },
            /* Sin `content`: el árbol viaja entero en cada carga y se cachea
               cinco minutos; el texto se pide al abrir el espacio. */
            documents: {
              orderBy: { createdAt: 'asc' },
              select: { id: true, title: true, workspaceId: true, updatedAt: true },
            },
          },
        },
        roles: true,
        _count: { select: { members: true } },
      },
    });

    if (!project) {
      throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    }

    await this.redis.set(cacheKey, project, PROJECT_CACHE_TTL);
    return project;
  }

  async updateProject(dto: UpdateProjectDto) {
    const project = await this.prisma.project.findUnique({ where: { id: dto.id } });
    if (!project) {
      throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    }

    /**
     * El slug se regenera **solo si el nombre cambia de verdad**.
     *
     * Sin la comparación, guardar el proyecto sin tocar el nombre recalcularía
     * el slug y, al chocar consigo mismo, le colgaría un `-2`: la URL cambiaría
     * sola cada vez que alguien edita la descripción. Con ella, renombrar de
     * «Sprint 1» a «Sprint 1» no mueve nada.
     *
     * ⚠️ **Renombrar cambia la URL, y los enlaces con el slug viejo dejan de
     * resolver.** Es deliberado: guardar el histórico de slugs es otra tabla
     * para un caso poco frecuente, y los enlaces que de verdad circulan —los
     * que se copian de la barra de direcciones antes de un renombrado— siguen
     * funcionando porque la ruta acepta el UUID para siempre.
     */
    const renombrado = dto.name !== undefined && dto.name !== project.name;

    const slug = renombrado
      ? await generarSlugUnico(dto.name!, async (candidato) => {
          const existente = await this.prisma.project.findUnique({
            where: { slug: candidato },
            select: { id: true },
          });
          return existente !== null && existente.id !== dto.id;
        })
      : undefined;

    let updated: Awaited<ReturnType<typeof this.prisma.project.update>>;
    try {
      updated = await this.prisma.project.update({
        where: { id: dto.id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(slug !== undefined && { slug }),
          ...(dto.description !== undefined && { description: dto.description }),
          /* Identidad visual, desde el modal de configuración. `undefined` = no
             se toca; `null` o '' = se borra y vuelve al monograma. */
          ...(dto.iconKey !== undefined && { iconKey: dto.iconKey || null }),
          ...(dto.color !== undefined && { color: dto.color || null }),
        },
      });
    } catch (error) {
      /**
       * El mismo 409 que `createProject`, que **faltaba aquí**.
       *
       * `477616f` capturó el P2002 al crear y se olvidó de renombrar, así que un
       * nombre repetido en un `PATCH` salía como error no controlado → **500
       * «Internal server error»**, sin nada que enseñar a quien renombra. Se ve
       * enseguida ahora que el nombre se edita en línea: se guarda mientras se
       * escribe, y un nombre a medias choca con cualquiera de los tuyos.
       */
      if (isUniqueViolation(error)) {
        throw new RpcException({
          statusCode: 409,
          message: `Ya tienes un proyecto llamado "${dto.name}".`,
        });
      }
      throw error;
    }

    await this.redis.del(`project:${dto.id}`);

    /* El nombre y el slug viajan dentro de la lista cacheada, así que un
       renombrado que no la invalide deja el nombre viejo —y un enlace que ya no
       resuelve, porque el slug se regenera— hasta que caduque. */
    await this.invalidarListasDe(await this.quienesLoVen(dto.id));

    return updated;
  }

  /**
   * Cambia el estado administrativo del proyecto.
   *
   * ## Las cachés, que es donde esto se rompe en silencio
   *
   * `project:<id>` dura 5 minutos y es la que lee el guard en **cada** petición
   * para decidir si deja pasar. Sin invalidarla, suspender no surtiría efecto
   * hasta pasados esos minutos: el administrador pulsa, comprueba, todo sigue
   * funcionando, y vuelve a pulsar.
   *
   * `projects:member:<userId>` dura 60 s y es la lista de proyectos de cada
   * persona. Se invalida la del dueño y la de todos los miembros, porque un
   * proyecto archivado tiene que desaparecer de sus listas y no dentro de un
   * minuto.
   *
   * ## `suspendedReason` se guarda en el proyecto
   *
   * No solo en el registro de actividad, que es admin-only. Es lo que permite que
   * la pantalla del proyecto explique al dueño por qué no funciona nada, en vez de
   * dejar que cada botón falle sin decir nada.
   */
  async setStatus(dto: {
    id: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
    reason?: string;
    actorId?: string;
    correlationId?: string;
    causationId?: string;
  }) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.id },
      select: {
        id: true,
        ownerId: true,
        members: { select: { userId: true } },
      },
    });

    if (!project) {
      throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    }
    if (!dto.actorId) {
      throw new RpcException({ statusCode: 400, message: 'Falta actor confiable' });
    }

    const volviendoAActivo = dto.status === 'ACTIVE';
    const correlationId = dto.correlationId ?? randomUUID();
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.project.findUnique({
        where: { id: dto.id },
        select: { status: true },
      });
      if (!current) throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
      if (current.status === dto.status) {
        const saved = await tx.project.findUniqueOrThrow({
          where: { id: dto.id },
          include: { _count: { select: { members: true, workspaces: true } } },
        });
        return { saved, previousStatus: current.status };
      }
      const saved = await tx.project.update({
        where: { id: dto.id },
        data: {
          status: dto.status,
          suspendedAt: volviendoAActivo ? null : new Date(),
          suspendedBy: volviendoAActivo ? null : dto.actorId,
          suspendedReason: volviendoAActivo ? null : (dto.reason ?? null),
        },
        include: { _count: { select: { members: true, workspaces: true } } },
      });
      await this.domainOutbox.persist(
        tx,
        {
          projectId: saved.id,
          subject: { type: 'PROJECT', id: saved.id },
          actor: { type: 'USER', id: dto.actorId },
          correlationId,
          causationId: dto.causationId,
        },
        {
          type: 'project.status-changed.v1',
          payload: {
            previousStatus: current.status,
            status: saved.status,
            reason: dto.reason ?? null,
          },
        },
      );
      return { saved, previousStatus: current.status };
    });

    await this.redis.del(`project:${dto.id}`);

    await this.invalidarListasDe([project.ownerId, ...project.members.map((m) => m.userId)]);

    return { ...updated.saved, previousStatus: updated.previousStatus };
  }

  /**
   * El inventario completo para el panel de administración.
   *
   * Ruta aparte de `findAllProjects` y no un parámetro suyo: aquel filtra por
   * dueño o miembro, y añadirle una forma de ver todos sería poner un interruptor
   * de bypass en la consulta que usa cualquiera. Aquí el alcance es la plataforma
   * entera desde el principio, y quien decide si se puede llegar es el rol global
   * en el gateway.
   *
   * Incluye los archivados: para el panel son visibles, es el único sitio donde lo
   * son, y sin ellos no habría forma de recuperarlos.
   */
  /**
   * Los proyectos de los que alguien es dueño, con lo mínimo para nombrarlos.
   *
   * ⚠️ Los `DELETED` **cuentan igual**: siguen en la base con su `ownerId`, así
   * que borrar la cuenta los dejaría igual de huérfanos aunque no se vean en
   * ningún listado.
   */
  async findOwned(ownerId: string) {
    return this.prisma.project.findMany({
      where: { ownerId },
      select: { id: true, name: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Los proyectos de una organización.
   *
   * 🔴 **Es lo que cuenta la cuota desde 2026-08-26**, y sustituye a contar por
   * dueño: el plan promete proyectos **para el equipo**, no para cada persona.
   *
   * ⚠️ Devuelve también los `DELETED` y quien llama los descarta. No se filtran
   * aquí porque el mismo comando sirve para contar cuota —donde no cuentan— y
   * para el inventario de administración —donde sí hay que verlos—.
   */
  /**
   * Cambia de responsable un proyecto.
   *
   * 🔴 **Sin esto, un proyecto muere con quien lo creó.** Ser `ownerId` es el
   * único bypass total de permisos que existe: si esa persona se va de la
   * empresa, el proyecto se queda sin nadie que pueda administrarlo del todo, y
   * no había ninguna ruta que lo arreglara.
   *
   * ⚠️ **El nuevo responsable tiene que ser ya miembro del proyecto.** Dárselo a
   * alguien de fuera lo dejaría con un responsable que ni siquiera lo ve, y sin
   * nadie que pueda deshacerlo.
   *
   * ⚠️ **Y quien lo deja se queda dentro**, con el rol que tuviera. Sacarlo sería
   * una segunda consecuencia de una sola acción, y la segunda no se deshace.
   *
   * ⚠️ El `slug` **no** se regenera: cambia con el nombre, no con la persona.
   * Regenerarlo aquí rompería todos los enlaces compartidos del proyecto por un
   * cambio que no se ve desde fuera.
   */
  async transferOwnership(dto: { projectId: string; nuevoOwnerId: string }) {
    const [proyecto, miembro] = await Promise.all([
      this.prisma.project.findUnique({ where: { id: dto.projectId } }),
      this.prisma.projectMember.findUnique({
        where: {
          projectId_userId: { projectId: dto.projectId, userId: dto.nuevoOwnerId },
        },
      }),
    ]);

    if (!proyecto) {
      return { error: 'Ese proyecto no existe.', codigo: 'NO_EXISTE' as const };
    }
    if (proyecto.ownerId === dto.nuevoOwnerId) {
      return { error: 'Ya es su responsable.', codigo: 'YA_ESTA' as const };
    }
    if (!miembro) {
      return {
        error: 'Esa persona tiene que ser miembro del proyecto para poder responder por él.',
        codigo: 'NO_VALE' as const,
      };
    }

    const actualizado = await this.prisma.project.update({
      where: { id: dto.projectId },
      data: { ownerId: dto.nuevoOwnerId },
      select: { id: true, name: true, slug: true, ownerId: true },
    });
    return { ...actualizado, anteriorOwnerId: proyecto.ownerId };
  }

  async findByOrganization(organizationId: string) {
    return this.prisma.project.findMany({
      where: { organizationId },
      select: { id: true, name: true, status: true, ownerId: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAllForAdmin(dto: {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  }) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 25;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (dto.status) where.status = dto.status;
    if (dto.search) {
      where.OR = [
        { name: { contains: dto.search, mode: 'insensitive' } },
        { description: { contains: dto.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { members: true, workspaces: true } } },
      }),
      this.prisma.project.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * El detalle para el panel, en solo lectura.
   *
   * ⚠️ **No reutiliza `findOneProject`** y no es por duplicar: aquella cachea en
   * `project:<id>`, que es la clave que lee el guard en cada petición. Que el
   * panel la rellene con la misma forma es inofensivo hoy, pero cualquier campo
   * extra que se añadiera aquí acabaría en la caché que decide los permisos.
   * Además esta no lanza 404 en los archivados, que son justo los que el
   * administrador necesita poder abrir.
   */
  async findOneForAdmin(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        workspaces: {
          include: { boards: { include: { columns: { orderBy: { order: 'asc' } } } } },
        },
        members: { include: { projectRole: true } },
        roles: true,
        _count: { select: { members: true, workspaces: true } },
      },
    });

    if (!project) {
      throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    }

    return project;
  }

  async deleteProject(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    }

    /* Se leen **antes** de borrar: después la fila y sus miembros ya no existen
       y no habría forma de saber a quién retirarle la lista. Es el mismo motivo
       por el que `purgeTasks` lee las tareas afectadas antes del `deleteMany`. */
    const afectados = await this.quienesLoVen(id);

    await this.prisma.project.delete({ where: { id } });
    await this.redis.del(`project:${id}`);
    await this.invalidarListasDe(afectados);

    return { success: true };
  }

  async resolveResource(dto: { workspaceId?: string; boardId?: string }) {
    if (dto.boardId) {
      const board = await this.prisma.board.findUnique({
        where: { id: dto.boardId },
        include: { workspace: true },
      });
      if (!board) {
        throw new RpcException({ statusCode: 404, message: 'Board no encontrado' });
      }
      return { projectId: board.workspace.projectId };
    }

    if (dto.workspaceId) {
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: dto.workspaceId },
      });
      if (!workspace) {
        throw new RpcException({ statusCode: 404, message: 'Workspace no encontrado' });
      }
      return { projectId: workspace.projectId };
    }

    throw new RpcException({ statusCode: 400, message: 'Falta workspaceId o boardId' });
  }

  /**
   * Traduce un slug al id real del proyecto.
   *
   * Lo llama el `ProjectPermissionGuard` cuando el parámetro de la ruta no
   * tiene forma de UUID. Devuelve solo el id: el guard únicamente necesita
   * saber sobre qué proyecto comprobar permisos, y el detalle ya lo pedirá
   * después quien corresponda.
   *
   * ⚠️ **Un slug que no existe es un 404, no un 403.** Es la respuesta honesta
   * —esa URL no corresponde a nada— y no filtra nada: los slugs son públicos en
   * el sentido de que cualquiera puede escribir uno en la barra de direcciones,
   * y el permiso se comprueba igual justo después sobre el id resuelto.
   */
  async resolveSlug(dto: { slug: string }) {
    const project = await this.prisma.project.findUnique({
      where: { slug: dto.slug },
      select: { id: true },
    });

    if (!project) {
      throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    }

    return { projectId: project.id };
  }
}
