import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  CreateProjectRoleDto,
  UpdateProjectRoleDto,
  CheckPermissionDto,
} from '@praxis/contracts';

const PERMISSION_CACHE_TTL = 300;

@Injectable()
export class ProjectRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createProjectRole(dto: CreateProjectRoleDto) {
    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project) {
      throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    }

    const existing = await this.prisma.projectRole.findUnique({
      where: { projectId_name: { projectId: dto.projectId, name: dto.name } },
    });
    if (existing) {
      throw new RpcException({ statusCode: 409, message: `Ya existe el rol '${dto.name}' en este proyecto` });
    }

    return this.prisma.projectRole.create({
      data: {
        name:        dto.name,
        projectId:   dto.projectId,
        permissions: dto.permissions,
      },
    });
  }

  async updateProjectRole(dto: UpdateProjectRoleDto) {
    const role = await this.prisma.projectRole.findUnique({ where: { id: dto.id } });
    if (!role) {
      throw new RpcException({ statusCode: 404, message: 'Rol de proyecto no encontrado' });
    }

    const updated = await this.prisma.projectRole.update({
      where: { id: dto.id },
      data: {
        ...(dto.name        !== undefined && { name: dto.name }),
        ...(dto.permissions !== undefined && { permissions: dto.permissions }),
      },
    });

    // Invalidar caché de permisos de todos los miembros con este rol
    const affected = await this.prisma.projectMember.findMany({
      where: { projectRoleId: dto.id },
    });
    await Promise.all(
      affected.map((m) => this.invalidatePermissionCache(m.userId, m.projectId)),
    );

    return updated;
  }

  async deleteProjectRole(id: string) {
    const role = await this.prisma.projectRole.findUnique({
      where: { id },
      include: { members: true },
    });
    if (!role) {
      throw new RpcException({ statusCode: 404, message: 'Rol de proyecto no encontrado' });
    }
    if (role.members.length > 0) {
      throw new RpcException({
        statusCode: 409,
        message: 'No se puede eliminar un rol con miembros asignados',
      });
    }

    await this.prisma.projectRole.delete({ where: { id } });
    return { success: true };
  }

  async checkPermission(dto: CheckPermissionDto) {
    const cacheKey = `project:${dto.projectId}:user:${dto.userId}:permissions`;
    const cached = await this.redis.get<Record<string, boolean>>(cacheKey);

    const permissions: Record<string, boolean> = cached ?? await this.loadPermissions(dto.userId, dto.projectId, cacheKey);

    //TODO: temp
    return true;
    //return { allowed: !!permissions[dto.permission] };
  }

  private async loadPermissions(
    userId: string,
    projectId: string,
    cacheKey: string,
  ): Promise<Record<string, boolean>> {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { projectRole: true },
    });

    const permissions: Record<string, boolean> = member
      ? (member.projectRole.permissions as Record<string, boolean>)
      : {};

    await this.redis.set(cacheKey, permissions, PERMISSION_CACHE_TTL);
    return permissions;
  }

  async invalidatePermissionCache(userId: string, projectId: string) {
    await this.redis.del(`project:${projectId}:user:${userId}:permissions`);
  }
}
