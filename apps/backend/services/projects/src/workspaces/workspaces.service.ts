import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
} from '@praxis/contracts';

const LIST_CACHE_TTL = 60;

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createWorkspace(dto: CreateWorkspaceDto) {
    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project) {
      throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    }

    let workspace: Awaited<ReturnType<typeof this.prisma.workspace.create>>;
    try {
      workspace = await this.prisma.workspace.create({
        data: { name: dto.name, projectId: dto.projectId },
      });
    } catch (error) {
      /**
       * `Workspace` es `@@unique([projectId, name])`. Sin capturar el P2002, un
       * nombre repetido salía como error no controlado → 500, y la interfaz no
       * podía distinguirlo de una caída. A diferencia del nombre de proyecto,
       * aquí la unicidad **por proyecto** sí es lo que se quiere.
       */
      if (isUniqueViolation(error)) {
        throw new RpcException({
          statusCode: 409,
          message: `Ya existe un espacio llamado "${dto.name}" en este proyecto.`,
        });
      }
      throw error;
    }

    await this.redis.del(`project:${dto.projectId}`);
    return workspace;
  }

  async findWorkspaces(projectId: string) {
    const cacheKey = `workspaces:project:${projectId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const workspaces = await this.prisma.workspace.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: { boards: { include: { columns: { orderBy: { order: 'asc' } } } } },
    });

    await this.redis.set(cacheKey, workspaces, LIST_CACHE_TTL);
    return workspaces;
  }

  async findOneWorkspace(id: string) {
    const cacheKey = `workspace:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
      include: { boards: { include: { columns: { orderBy: { order: 'asc' } } } } },
    });

    if (!workspace) {
      throw new RpcException({ statusCode: 404, message: 'Workspace no encontrado' });
    }

    await this.redis.set(cacheKey, workspace, LIST_CACHE_TTL);
    return workspace;
  }


  async updateWorkspace(dto: UpdateWorkspaceDto) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: dto.id } });
    if (!workspace) {
      throw new RpcException({ statusCode: 404, message: 'Workspace no encontrado' });
    }

    const updated = await this.prisma.workspace.update({
      where: { id: dto.id },
      data: { ...(dto.name !== undefined && { name: dto.name }) },
    });

    await this.redis.del(`workspaces:project:${workspace.projectId}`);
    await this.redis.del(`project:${workspace.projectId}`);
    return updated;
  }

  async deleteWorkspace(id: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id } });
    if (!workspace) {
      throw new RpcException({ statusCode: 404, message: 'Workspace no encontrado' });
    }

    await this.prisma.workspace.delete({ where: { id } });
    await this.redis.del(`workspaces:project:${workspace.projectId}`);
    await this.redis.del(`project:${workspace.projectId}`);
    return { success: true };
  }
}

/** P2002 de Prisma: violación de restricción única. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}
