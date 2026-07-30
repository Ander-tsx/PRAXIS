import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import {
  CreateProjectDto,
  FindProjectsDto,
  UpdateProjectDto,
} from '@praxis/contracts';

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
       * (La unicidad global sigue siendo un problema de diseño: dos equipos
       * distintos no pueden tener un proyecto llamado "Sprint 1".)
       */
      if (isUniqueViolation(error)) {
        throw new RpcException({
          statusCode: 409,
          message: `Ya existe un proyecto llamado "${dto.name}".`,
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
      where.OR = [
        { ownerId: dto.userId },
        { members: { some: { userId: dto.userId } } },
      ];
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

    const updated = await this.prisma.project.update({
      where: { id: dto.id },
      data: {
        ...(dto.name        !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });

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
