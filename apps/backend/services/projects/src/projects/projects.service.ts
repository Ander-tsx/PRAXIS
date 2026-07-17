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

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /* ─── Projects ───────────────────────────────────────────────────── */

  async createProject(dto: CreateProjectDto) {
    const project = await this.prisma.project.create({
      data: {
        name:        dto.name,
        description: dto.description,
        ownerId:     dto.ownerId,
      },
    });
    return project;
  }

  async findAllProjects(dto: FindProjectsDto) {
    const page  = dto.query?.page  ?? 1;
    const limit = dto.query?.limit ?? 20;
    const skip  = (page - 1) * limit;

    const where: any = {};
    if (dto.ownerId) where.ownerId = dto.ownerId;

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
