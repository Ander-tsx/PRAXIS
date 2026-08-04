import { Injectable, OnModuleInit } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import {
  AssignRoleDto,
  CheckRoleDto,
  GLOBAL_ROLES,
  GLOBAL_ROLE_SEED,
  type GlobalRole,
  RevokeRoleDto,
} from '@praxis/contracts';

const ROLES_CACHE_TTL     = 60;  // 1 min
const ALL_ROLES_CACHE_TTL = 300; // 5 min — roles globales cambian poco

@Injectable()
export class PermissionsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Crea los roles globales si no existen al arrancar.
   *
   * La lista vive en `@praxis/contracts` (`GLOBAL_ROLE_SEED`) y no aquí: la
   * necesitan también el `seed.ts` y el panel, y tres copias de tres nombres que
   * se comparan con distinción de mayúsculas contra esta misma columna es la
   * forma de que una se quede atrás sin que nada avise.
   *
   * Que esto corra en cada arranque es lo que hace que una base recién migrada y
   * **sin sembrar** tenga los tres roles igual. El `SuperAdmin` tenía que entrar
   * por aquí y no solo por el seed justo por eso.
   *
   * ⚠️ Crea el **rol**, no la asignación. Quién es SuperAdmin lo decide el seed:
   * ninguna ruta concede ese nivel.
   */
  async onModuleInit() {
    for (const role of GLOBAL_ROLE_SEED) {
      await this.prisma.role.upsert({
        where:  { name: role.name },
        update: { description: role.description },
        create: { name: role.name, description: role.description },
      });
    }

    /* El upsert puede haber cambiado descripciones: la lista cacheada de hace un
       arranque ya no vale. */
    await this.redis.del('roles:all');
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

    /**
     * **Nunca cero SuperAdmins.**
     *
     * La comprobación vive aquí y no en el gateway porque aquí está la tabla:
     * contar desde fuera obliga a un salto de red que puede leer una foto vieja,
     * y esta es la última barrera antes del `delete`. El gateway la repite para
     * dar el mensaje antes de intentarlo, pero la que impide el daño es esta.
     *
     * Sin ella, degradar al último SuperAdmin deja el sistema sin nadie que
     * pueda volver a crear o degradar administradores: no hay ruta que conceda
     * ese nivel, así que la única salida sería sembrar de nuevo.
     */
    if (dto.roleName === GLOBAL_ROLES.SUPER_ADMIN) {
      const restantes = await this.countRoleHolders({ roleName: GLOBAL_ROLES.SUPER_ADMIN });
      if (restantes.count <= 1) {
        throw new RpcException({
          statusCode: 409,
          message:
            'No se puede revocar el último SuperAdmin: el sistema se quedaría sin quien administre a los administradores.',
        });
      }
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

  /**
   * **Fija** el rol global de una cuenta: reemplaza los que tuviera.
   *
   * Es lo que necesita el panel, y no un `assign` más. El nivel efectivo de una
   * cuenta es el más alto de sus filas, así que asignar `User` a un `Admin` no lo
   * degrada: quedan las dos filas y sigue siendo `Admin`. El panel enseña **un**
   * rol, y con esto lo que se ve y lo que se guarda son la misma cosa.
   *
   * En una transacción, porque el estado intermedio —una cuenta sin ningún rol
   * mientras se cambia— es un nivel distinto del de antes y del de después, y
   * cualquier petición que caiga justo ahí leería un permiso que nadie decidió.
   */
  async setUserRole(dto: { userId: string; roleName: GlobalRole }) {
    const role = await this.prisma.role.findUnique({ where: { name: dto.roleName } });
    if (!role) {
      throw new RpcException({ statusCode: 404, message: `Rol '${dto.roleName}' no encontrado` });
    }

    /**
     * Si esta cuenta es el último SuperAdmin y el rol nuevo no lo es, el sistema
     * se quedaría sin nadie capaz de nombrar administradores. Se comprueba aquí
     * porque aquí está la tabla; el gateway lo repite antes para dar el mensaje
     * sin llegar a intentarlo.
     */
    if (dto.roleName !== GLOBAL_ROLES.SUPER_ADMIN) {
      const superAdmins = await this.countRoleHolders({ roleName: GLOBAL_ROLES.SUPER_ADMIN });
      const esElUltimo =
        superAdmins.count <= 1 && superAdmins.userIds.includes(dto.userId);

      if (esElUltimo) {
        throw new RpcException({
          statusCode: 409,
          message:
            'No se puede degradar al último SuperAdmin: el sistema se quedaría sin quien administre a los administradores.',
        });
      }
    }

    const asignado = await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: dto.userId } });
      return tx.userRole.create({
        data: { userId: dto.userId, roleId: role.id },
        include: { role: true },
      });
    });

    await this.redis.del(`roles:user:${dto.userId}`);
    return asignado;
  }

  /**
   * Los roles de varias cuentas de una vez.
   *
   * El panel lista 25 usuarios y necesita el rol de cada uno. Con
   * `getUserRoles` serían 25 llamadas TCP por página; aquí es una consulta y un
   * agrupado en memoria.
   *
   * No pasa por la caché de Redis —que es por usuario— a propósito: leer 25
   * claves para evitar una consulta no compensa, y de paso el panel enseña
   * siempre el rol de verdad y no uno de hasta un minuto antes, que es justo lo
   * que confundiría después de cambiarlo.
   *
   * Devuelve un objeto `{ [userId]: string[] }`. Las cuentas sin ningún rol
   * **no aparecen**: quien llama las trata como `User`, que es lo que son.
   */
  async getRolesForUsers(dto: { userIds: string[] }) {
    const unicos = [...new Set(dto.userIds)].filter(Boolean);
    if (unicos.length === 0) return {};

    const filas = await this.prisma.userRole.findMany({
      where:  { userId: { in: unicos } },
      select: { userId: true, role: { select: { name: true } } },
    });

    const porUsuario: Record<string, string[]> = {};
    for (const fila of filas) {
      (porUsuario[fila.userId] ??= []).push(fila.role.name);
    }
    return porUsuario;
  }

  /**
   * Cuántas cuentas tienen un rol, y quiénes.
   *
   * Existe para las invariantes de «no dejar el sistema sin SuperAdmin», y por
   * eso **no pasa por Redis**: una cuenta cacheada 60 segundos puede decir que
   * quedan dos cuando ya solo queda uno, y ese es exactamente el momento en que
   * la comprobación tiene que ser correcta.
   *
   * Devuelve también los `userIds` porque quien va a suspender necesita saber si
   * el objetivo es *el* último, no solo cuántos hay: con el conteo a secas,
   * suspender al segundo SuperAdmin de dos se rechazaría igual que al último.
   */
  async countRoleHolders(dto: { roleName: GlobalRole }) {
    const role = await this.prisma.role.findUnique({
      where:  { name: dto.roleName },
      select: { id: true },
    });

    if (!role) return { count: 0, userIds: [] as string[] };

    const holders = await this.prisma.userRole.findMany({
      where:  { roleId: role.id },
      select: { userId: true },
    });

    return { count: holders.length, userIds: holders.map((h) => h.userId) };
  }
}
