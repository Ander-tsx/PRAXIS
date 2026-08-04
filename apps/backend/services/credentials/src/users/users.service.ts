import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import {
  FindUsersDto,
  type SetUserStatusDto,
  UpdateUserDto,
  UserStatus,
} from '@praxis/contracts';

const USER_CACHE_TTL = 300;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAll(dto: FindUsersDto) {
    const page  = dto.query?.page  ?? 1;
    const limit = dto.query?.limit ?? 20;
    const skip  = (page - 1) * limit;

    const where: any = {};

    if (dto.filters?.search) {
      const s = dto.filters.search;
      where.OR = [
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName:  { contains: s, mode: 'insensitive' } },
        { credential: { email: { contains: s, mode: 'insensitive' } } },
      ];
    }

    if (dto.filters?.createdFrom || dto.filters?.createdTo) {
      where.createdAt = {};
      if (dto.filters.createdFrom) where.createdAt.gte = dto.filters.createdFrom;
      if (dto.filters.createdTo)   where.createdAt.lte = dto.filters.createdTo;
    }

    /* El filtro por estado estaba comentado como TODO en `FindUsersFilter`. Lo
       usa el panel de administración para responder «quién está suspendido», que
       de otro modo obliga a traerse todas las páginas y filtrar en el cliente. */
    if (dto.filters?.status) where.status = dto.filters.status;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { credential: { select: { email: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  async findOne(id: string) {
    const cacheKey = `user:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { credential: { select: { email: true } } },
    });

    if (!user) {
      throw new RpcException({ statusCode: 404, message: 'Usuario no encontrado' });
    }

    await this.redis.set(cacheKey, user, USER_CACHE_TTL);
    return user;
  }

  async update(dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.id } });
    if (!user) {
      throw new RpcException({ statusCode: 404, message: 'Usuario no encontrado' });
    }

    const updated = await this.prisma.user.update({
      where: { id: dto.id },
      data: {
        /* camelCase primero; `first_name` sigue aceptándose por compatibilidad
           y se ignora si vienen los dos. Ver `UpdateUserBodyDto`. */
        ...(dto.firstName  !== undefined && { firstName: dto.firstName }),
        ...(dto.firstName === undefined &&
          dto.first_name !== undefined && { firstName: dto.first_name }),
        ...(dto.lastName   !== undefined && { lastName: dto.lastName }),
        ...(dto.lastName === undefined &&
          dto.last_name !== undefined && { lastName: dto.last_name }),
      },
      include: { credential: { select: { email: true } } },
    });

    await this.redis.del(`user:${dto.id}`);

    return updated;
  }

  /**
   * Cambia el estado de una cuenta, y **corta su sesión**.
   *
   * ## Lo segundo es lo importante
   *
   * Sin el borrado de `auth:session:<id>`, suspender a alguien con la sesión
   * abierta **no le echaba nunca**. Comprobado leyendo `auth.service.refresh()`:
   * verifica la firma del refresh token, lo compara con esta clave de Redis y
   * firma un access nuevo — sin volver a mirar `status` en ningún momento. Y el
   * `proxy.ts` de cada zona renueva en cada navegación mientras el refresh viva
   * (7 días, y la ventana se renueva sola). Es decir: la suspensión solo impedía
   * un login nuevo, que es justo el que esa persona no necesita.
   *
   * Con la clave borrada, la cadena se cierra: el access token vive lo que le
   * quede (≤15 min, `JWT_EXPIRES_IN`), el refresh falla, el proxy manda al login
   * y el login responde 403. Esos 15 minutos son la ventana que se aceptó a
   * propósito; lo que no se puede aceptar es que no haya final.
   *
   * `refresh()` comprueba además `status` por su cuenta, así que un cambio de
   * estado por cualquier otra vía —una migración, un arreglo a mano en la base—
   * también surte efecto.
   *
   * ## Las cachés
   *
   * `user:<id>` dura 5 minutos y es la que lee `findOne`, así que sin
   * invalidarla el panel enseñaría el estado viejo justo después de cambiarlo:
   * el administrador pulsa, no ve nada y vuelve a pulsar.
   */
  async setStatus(dto: SetUserStatusDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.id } });
    if (!user) {
      throw new RpcException({ statusCode: 404, message: 'Usuario no encontrado' });
    }

    const updated = await this.prisma.user.update({
      where: { id: dto.id },
      data:  { status: dto.status },
      include: { credential: { select: { email: true } } },
    });

    await this.redis.del(`user:${dto.id}`);

    /* Al dejar de estar activa se cierra la sesión; al volver a estarlo no hay
       nada que cerrar, y borrar la clave echaría de la aplicación a alguien a
       quien se le acaba de devolver el acceso. */
    if (dto.status !== UserStatus.ACTIVE) {
      await this.redis.del(`auth:session:${dto.id}`);
    }

    return updated;
  }

  async delete(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { credential: true },
    });

    if (!user) {
      throw new RpcException({ statusCode: 404, message: 'Usuario no encontrado' });
    }

    await this.prisma.$transaction([
      this.prisma.user.delete({ where: { id } }),
      this.prisma.credential.delete({ where: { id: user.credentialId } }),
    ]);

    await this.redis.del(`user:${id}`);
    await this.redis.del(`auth:session:${id}`);

    return { success: true, id };
  }

  /** Resuelve varios perfiles en una sola llamada (evita N consultas desde otros servicios). */
  async findByIds(ids: string[]) {
    const unique = [...new Set(ids)].filter(Boolean);
    if (unique.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      include: { credential: { select: { email: true } } },
    });

    return users;
  }
}
