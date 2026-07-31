import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import {
  CreateProjectDto,
  FindProjectsDto,
  UpdateProjectDto,
} from '@praxis/contracts';
import { expandPermissions, normalizePermissions } from '../project-roles/permission-map';

const PROJECT_CACHE_TTL = 300; // 5 min

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
  canComment: true,
  canManageLabels: true,
  canDeleteProject: true,
};

/** P2002 de Prisma: violación de restricción única. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

@Injectable()
export class ProjectsService {
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
      return await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            name:        dto.name,
            description: dto.description,
            ownerId:     dto.ownerId,
          },
        });

        const adminRole = await tx.projectRole.create({
          data: {
            name:        DEFAULT_ROLE_NAME,
            projectId:   project.id,
            permissions: DEFAULT_ROLE_PERMISSIONS,
          },
        });

        await tx.projectMember.create({
          data: {
            projectId:     project.id,
            userId:        dto.ownerId,
            projectRoleId: adminRole.id,
          },
        });

        return project;
      });
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
    const page  = dto.query?.page  ?? 1;
    const limit = dto.query?.limit ?? 20;
    const skip  = (page - 1) * limit;

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

    // Filtro estricto por propietario, para herramientas de administración.
    if (dto.ownerId) where.ownerId = dto.ownerId;

    if (dto.search) {
      where.AND = [
        {
          OR: [
            { name:        { contains: dto.search, mode: 'insensitive' } },
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
        include: { _count: { select: { members: true, workspaces: true } } },
      }),
      this.prisma.project.count({ where }),
    ]);

    return { items, total };
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
  private async projectIdsWithPermission(
    userId: string,
    permission: string,
  ): Promise<string[]> {
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
      include: {
        workspaces: { include: { boards: { include: { columns: { orderBy: { order: 'asc' } } } } } },
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

    let updated: Awaited<ReturnType<typeof this.prisma.project.update>>;
    try {
      updated = await this.prisma.project.update({
        where: { id: dto.id },
        data: {
          ...(dto.name        !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
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
    return updated;
  }

  async deleteProject(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    }

    await this.prisma.project.delete({ where: { id } });
    await this.redis.del(`project:${id}`);
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
}
