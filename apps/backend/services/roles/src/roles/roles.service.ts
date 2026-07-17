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
  ProjectPermission,
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
    const permissionsToGrant: ProjectPermission[] =
      dto.permission === ProjectPermission.EDIT
        ? [ProjectPermission.VIEW, ProjectPermission.EDIT]
        : [ProjectPermission.VIEW];

    let mainAccess: any = null;

    for (const perm of permissionsToGrant) {
      const existing = await this.prisma.userProjectAccess.findUnique({
        where: {
          userId_projectId_permission: {
            userId: dto.userId,
            projectId: dto.projectId,
            permission: perm,
          },
        },
      });

      if (!existing) {
        const access = await this.prisma.userProjectAccess.create({
          data: {
            userId: dto.userId,
            projectId: dto.projectId,
            permission: perm,
          },
        });
        if (perm === dto.permission) {
          mainAccess = access;
        }
      } else {
        if (perm === dto.permission) {
          throw new RpcException({
            statusCode: 409,
            message: `El usuario ya tiene el permiso ${dto.permission} en este proyecto`,
          });
        }
      }
    }

    await this.redis.del(`project_access:user:${dto.userId}`);
    await this.redis.del(`project_access:project:${dto.projectId}`);
    return mainAccess || { userId: dto.userId, projectId: dto.projectId, permission: dto.permission };
  }

  async revokeProjectAccess(dto: RevokeProjectAccessDto) {
    let permissionsToRevoke: ProjectPermission[] = [];

    if (!dto.permission) {
      permissionsToRevoke = [ProjectPermission.VIEW, ProjectPermission.EDIT];
    } else if (dto.permission === ProjectPermission.VIEW) {
      // Si se revoca VIEW, se debe revocar EDIT de manera obligatoria.
      permissionsToRevoke = [ProjectPermission.VIEW, ProjectPermission.EDIT];
    } else {
      permissionsToRevoke = [ProjectPermission.EDIT];
    }

    const { count } = await this.prisma.userProjectAccess.deleteMany({
      where: {
        userId: dto.userId,
        projectId: dto.projectId,
        permission: { in: permissionsToRevoke },
      },
    });

    if (count === 0) {
      throw new RpcException({
        statusCode: 404,
        message: 'El usuario no tiene acceso o ese permiso en este proyecto',
      });
    }

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

    const groupedMap = new Map<string, Set<string>>();
    for (const a of accesses) {
      if (!groupedMap.has(a.projectId)) {
        groupedMap.set(a.projectId, new Set());
      }
      groupedMap.get(a.projectId)!.add(a.permission);
    }

    const result = Array.from(groupedMap.entries()).map(([projectId, perms]) => ({
      projectId,
      permissions: Array.from(perms),
    }));

    await this.redis.set(cacheKey, result, ACCESS_CACHE_TTL);
    return result;
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

    const requiredPermission = dto.permission || ProjectPermission.VIEW;

    const access = await this.prisma.userProjectAccess.findUnique({
      where: {
        userId_projectId_permission: {
          userId: dto.userId,
          projectId: dto.projectId,
          permission: requiredPermission,
        },
      },
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

    const groupedMap = new Map<string, Set<string>>();
    for (const a of accesses) {
      if (!groupedMap.has(a.userId)) {
        groupedMap.set(a.userId, new Set());
      }
      groupedMap.get(a.userId)!.add(a.permission);
    }

    const result = Array.from(groupedMap.entries()).map(([userId, perms]) => ({
      userId,
      permissions: Array.from(perms),
    }));

    await this.redis.set(cacheKey, result, ACCESS_CACHE_TTL);
    return result;
  }
}
