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

    const workspace = await this.prisma.workspace.create({
      data: { name: dto.name, projectId: dto.projectId },
    });

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
