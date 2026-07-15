import { Injectable, OnModuleInit } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import {
  AssignRoleDto,
  RevokeRoleDto,
  CheckRoleDto,
  GrantProjectAccessDto,
  RevokeProjectAccessDto,
  CheckProjectAccessDto,
} from '@praxis/contracts';

const ROLES_CACHE_TTL    = 60;   // 1 min — cambios se reflejan pronto
const ACCESS_CACHE_TTL   = 60;
const ALL_ROLES_CACHE_TTL = 300; // roles globales cambian poco

const SEED_ROLES = [
  { name: 'Admin',  description: 'Acceso de administración sobre toda la plataforma' },
  { name: 'User',   description: 'Miembro normal del sistema' },
];

@Injectable()
export class RolesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Crea los roles globales si no existen al arrancar. */
  async onModuleInit() {
    for (const role of SEED_ROLES) {
      await this.prisma.role.upsert({
        where:  { name: role.name },
        update: {},
        create: role,
      });
    }
  }

  /* ─── Roles globales ─────────────────────────────────────────────── */

  async findAll() {
    const cacheKey = 'roles:all';
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const roles = await this.prisma.role.findMany({ orderBy: { name: 'asc' } });
    await this.redis.set(cacheKey, roles, ALL_ROLES_CACHE_TTL);
    return roles;
  }

  async assign(dto: AssignRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { name: dto.roleName } });
    if (!role) {
      throw new RpcException({ statusCode: 404, message: `Rol '${dto.roleName}' no encontrado` });
    }

    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId: dto.userId, roleId: role.id } },
    });
    if (existing) {
      throw new RpcException({ statusCode: 409, message: 'El usuario ya tiene este rol' });
    }

    const userRole = await this.prisma.userRole.create({
      data: { userId: dto.userId, roleId: role.id },
      include: { role: true },
    });

    await this.redis.del(`roles:user:${dto.userId}`);
    return userRole;
  }

  async revoke(dto: RevokeRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { name: dto.roleName } });
    if (!role) {
      throw new RpcException({ statusCode: 404, message: `Rol '${dto.roleName}' no encontrado` });
    }

    const userRole = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId: dto.userId, roleId: role.id } },
    });
    if (!userRole) {
      throw new RpcException({ statusCode: 404, message: 'El usuario no tiene este rol' });
    }

    await this.prisma.userRole.delete({ where: { id: userRole.id } });
    await this.redis.del(`roles:user:${dto.userId}`);
    return { success: true };
  }

  async getUserRoles(userId: string) {
    const cacheKey = `roles:user:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });

    const roles = userRoles.map((ur) => ur.role);
    await this.redis.set(cacheKey, roles, ROLES_CACHE_TTL);
    return roles;
  }

  async checkRole(dto: CheckRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { name: dto.roleName } });
    if (!role) return { hasRole: false };

    const userRole = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId: dto.userId, roleId: role.id } },
    });

    return { hasRole: !!userRole };
  }

  /* ─── Permisos de vista de proyectos ─────────────────────────────── */

  async grantProjectAccess(dto: GrantProjectAccessDto) {
    const existing = await this.prisma.userProjectAccess.findUnique({
      where: { userId_projectId: { userId: dto.userId, projectId: dto.projectId } },
    });

    if (existing) {
      throw new RpcException({
        statusCode: 409,
        message: 'El usuario ya tiene acceso a este proyecto',
      });
    }

    const access = await this.prisma.userProjectAccess.create({
      data: { userId: dto.userId, projectId: dto.projectId },
    });

    await this.redis.del(`project_access:user:${dto.userId}`);
    await this.redis.del(`project_access:project:${dto.projectId}`);
    return access;
  }

  async revokeProjectAccess(dto: RevokeProjectAccessDto) {
    const access = await this.prisma.userProjectAccess.findUnique({
      where: { userId_projectId: { userId: dto.userId, projectId: dto.projectId } },
    });

    if (!access) {
      throw new RpcException({
        statusCode: 404,
        message: 'El usuario no tiene acceso a este proyecto',
      });
    }

    await this.prisma.userProjectAccess.delete({ where: { id: access.id } });
    await this.redis.del(`project_access:user:${dto.userId}`);
    await this.redis.del(`project_access:project:${dto.projectId}`);
    return { success: true };
  }

  async getUserProjectAccess(userId: string) {
    const cacheKey = `project_access:user:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const accesses = await this.prisma.userProjectAccess.findMany({
      where: { userId },
      orderBy: { grantedAt: 'desc' },
    });

    const projectIds = accesses.map((a) => a.projectId);
    await this.redis.set(cacheKey, projectIds, ACCESS_CACHE_TTL);
    return projectIds;
  }

  async checkProjectAccess(dto: CheckProjectAccessDto) {
    // Los Admins tienen acceso a todos los proyectos
    const adminRole = await this.prisma.role.findUnique({ where: { name: 'Admin' } });
    if (adminRole) {
      const isAdmin = await this.prisma.userRole.findUnique({
        where: { userId_roleId: { userId: dto.userId, roleId: adminRole.id } },
      });
      if (isAdmin) return { hasAccess: true };
    }

    const access = await this.prisma.userProjectAccess.findUnique({
      where: { userId_projectId: { userId: dto.userId, projectId: dto.projectId } },
    });

    return { hasAccess: !!access };
  }

  async getProjectUsers(projectId: string) {
    const cacheKey = `project_access:project:${projectId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const accesses = await this.prisma.userProjectAccess.findMany({
      where: { projectId },
      orderBy: { grantedAt: 'desc' },
    });

    const userIds = accesses.map((a) => a.userId);
    await this.redis.set(cacheKey, userIds, ACCESS_CACHE_TTL);
    return userIds;
  }
}
