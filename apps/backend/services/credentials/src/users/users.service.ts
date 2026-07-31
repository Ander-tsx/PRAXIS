import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import {
  FindUsersDto,
  UpdateUserDto,
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
}
