import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  CreateProjectRoleDto,
  UpdateProjectRoleDto,
  CheckProjectPermissionDto,
  PROJECT_PERMISSIONS,
} from '@praxis/contracts';

const PERMISSION_CACHE_TTL = 300;

/**
 * Mapa de jerarquía de permisos:
 * Si el usuario tiene el permiso-hijo, se le otorgan automáticamente
 * los permisos-padre listados en el arreglo.
 *
 * Regla general:
 *   canDelete* → implica canEdit* + canCreate*
 *   canEdit*   → implica canCreate*
 */
const PERMISSION_HIERARCHY: Record<string, string[]> = {
  // Boards
  canDeleteBoard: ['canEditBoard', 'canCreateBoard'],
  canEditBoard:   ['canCreateBoard'],
  // Columns
  canDeleteColumn: ['canEditColumn', 'canCreateColumn'],
  canEditColumn:   ['canCreateColumn'],
  // Tasks
  canDeleteTask: ['canEditTask', 'canCreateTask'],
  canEditTask:   ['canCreateTask'],
  // Roles y miembros no tienen jerarquía adicional
};

/**
 * `canViewProject` es el suelo de la jerarquía: cualquier permiso lo implica.
 *
 * Se resuelve aparte y no en la tabla porque no depende de un permiso concreto
 * sino de tener **alguno**. Enumerarlo en cada entrada se olvidaría en cuanto
 * alguien añadiera un permiso nuevo.
 */
const VIEW_PERMISSION = 'canViewProject';

/** Mapa con todos los permisos conocidos al mismo valor. */
function fullPermissionMap(value: boolean): Record<string, boolean> {
  return Object.fromEntries(PROJECT_PERMISSIONS.map((p) => [p, value]));
}

/** Fuerza booleanos: en BD los permisos son Json y podrían llegar sucios. */
function normalizeBooleans(map: Record<string, unknown>): Record<string, boolean> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, !!v]));
}

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

    const created = await this.prisma.projectRole.create({
      data: {
        name:        dto.name,
        projectId:   dto.projectId,
        permissions: dto.permissions,
      },
    });

    await this.invalidateProjectCache(dto.projectId);
    return created;
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
    await this.invalidateProjectCache(role.projectId);

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
    await this.invalidateProjectCache(role.projectId);
    return { success: true };
  }

  async checkPermission(dto: CheckProjectPermissionDto): Promise<{ allowed: boolean }> {
    // ── 1. Owner bypass: el dueño del proyecto tiene todos los permisos ──
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: { ownerId: true },
    });

    if (!project) {
      throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    }

    if (project.ownerId === dto.userId) {
      return { allowed: true };
    }

    // ── 2. Cargar (o leer de caché) los permisos del miembro ──
    const cacheKey = `project:${dto.projectId}:user:${dto.userId}:permissions`;
    const cached = await this.redis.get<Record<string, boolean>>(cacheKey);
    const rawPerms: Record<string, boolean> =
      cached ?? (await this.loadPermissions(dto.userId, dto.projectId, cacheKey));

    // ── 3. Expandir permisos implícitos por jerarquía ──
    const effective = this.expandPermissions(rawPerms);

    return { allowed: !!effective[dto.permission] };
  }

  /**
   * Todos los permisos efectivos de un usuario en un proyecto, ya expandidos.
   *
   * Es lo que necesita la interfaz para saber qué enseñar. Sin esto solo podía
   * descubrir que no tenía permiso **después** de que la acción fallara con un
   * 403, que es la peor forma de enterarse.
   *
   * Devuelve el mapa completo con todos los permisos conocidos, explícitamente
   * a `false` los que no tiene: así el cliente no tiene que distinguir entre
   * "ausente" y "denegado".
   */
  async getEffectivePermissions(dto: {
    userId: string;
    projectId: string;
  }): Promise<{ isOwner: boolean; permissions: Record<string, boolean> }> {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: { ownerId: true },
    });

    if (!project) {
      throw new RpcException({ statusCode: 404, message: 'Proyecto no encontrado' });
    }

    const isOwner = project.ownerId === dto.userId;

    // El dueño tiene bypass en el guard, así que aquí se refleja igual.
    if (isOwner) {
      return { isOwner, permissions: fullPermissionMap(true) };
    }

    const cacheKey = `project:${dto.projectId}:user:${dto.userId}:permissions`;
    const cached = await this.redis.get<Record<string, boolean>>(cacheKey);
    const rawPerms =
      cached ?? (await this.loadPermissions(dto.userId, dto.projectId, cacheKey));

    const effective = this.expandPermissions(rawPerms);

    return {
      isOwner,
      permissions: { ...fullPermissionMap(false), ...normalizeBooleans(effective) },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /**
   * Dado el mapa de permisos almacenado en BD, devuelve uno expandido
   * donde cada permiso de nivel superior "hereda" los de nivel inferior.
   *
   * Ejemplo:
   *   { canDeleteBoard: true } → { canDeleteBoard: true, canEditBoard: true, canCreateBoard: true }
   */
  private expandPermissions(
    raw: Record<string, boolean>,
  ): Record<string, boolean> {
    const expanded = { ...raw };

    for (const [key, implied] of Object.entries(PERMISSION_HIERARCHY)) {
      if (expanded[key]) {
        for (const impliedPerm of implied) {
          expanded[impliedPerm] = true;
        }
      }
    }

    // Quien puede hacer algo en el proyecto, puede verlo.
    if (Object.values(expanded).some(Boolean)) {
      expanded[VIEW_PERMISSION] = true;
    }

    return expanded;
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

  /**
   * Invalida el detalle cacheado del proyecto.
   *
   * `findOneProject` guarda el proyecto entero en `project:<id>` durante 5
   * minutos, **con sus roles embebidos**. Sin esto, crear o editar un rol no se
   * veía en pantalla hasta que expiraba la caché: la escritura funcionaba y la
   * interfaz parecía no haber hecho nada.
   */
  private async invalidateProjectCache(projectId: string) {
    await this.redis.del(`project:${projectId}`);
  }
}
