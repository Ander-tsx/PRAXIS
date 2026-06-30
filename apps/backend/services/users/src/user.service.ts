import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
    CreateUserDto,
    DeleteUserDto,
    FindOneUserDto,
    FindUsersDto,
    UpdateUserDto,
} from '@praxis/contracts';
import { ObjectLiteral, Repository } from 'typeorm';
import { User } from './entities/user.entity';

import { RpcException } from '@nestjs/microservices';
import { QueryOptionsDto, SortOrder } from '@praxis/contracts/dist/pagination.dto';
import { SelectQueryBuilder } from 'typeorm';

interface ApplyQueryOptions<T extends ObjectLiteral> {
    qb: SelectQueryBuilder<T>;
    query?: QueryOptionsDto;
    allowedSortFields: string[];
    defaultSortBy?: string;
}

//TODO: Hacerla reutilizable
export function applyQueryOptions<T extends ObjectLiteral>({
    qb,
    query,
    allowedSortFields,
    defaultSortBy = 'createdAt',
}: ApplyQueryOptions<T>) {
    const page = query?.page ?? 1;
    const limit = query?.limit ?? 10;

    const sortBy = allowedSortFields.includes(query?.sortBy ?? '') ? query?.sortBy : defaultSortBy;

    const sortOrder: SortOrder = query?.sortOrder ?? SortOrder.DESC;

    qb.orderBy(`${qb.alias}.${sortBy}`, sortOrder);

    qb.skip((page - 1) * limit);
    qb.take(limit);

    return qb;
}

@Injectable()
export class UserService {
    constructor(
        @InjectRepository(User)
        private readonly userRepo: Repository<User>,
    ) {}

    async findAll(dto: FindUsersDto) {
        const qb = this.userRepo.createQueryBuilder('user');

        // TODO
        // Aplicación de filtros personalizados
        const filters = dto.filters;
        if (filters) {
            if (filters.search) {
                qb.andWhere(
                    '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search)',
                    { search: `%${filters.search}%` },
                );
            }

            if (filters.createdFrom) {
                qb.andWhere('user.createdAt >= :createdFrom', {
                    createdFrom: filters.createdFrom,
                });
            }

            if (filters.createdTo) {
                qb.andWhere('user.createdAt <= :createdTo', {
                    createdTo: filters.createdTo,
                });
            }
        }

        applyQueryOptions({
            qb,
            query: dto.query,
            allowedSortFields: ['firstName', 'lastName', 'email'],
        });

        const [items, total] = await qb.getManyAndCount();

        return {
            items,
            total,
        };
    }

    async findOne(dto: FindOneUserDto) {
        const user = await this.userRepo.findOne({
            where: {
                id: dto.id,
            },
        });

        if (!user) {
            throw new RpcException('User does not exists');
        }

        return user;
    }

    async createUser(dto: CreateUserDto) {
        const user = this.userRepo.create({
            ...dto,
        });

        try {
            return await this.userRepo.save(user);
        } catch (error) {
            throw new RpcException('Error creating user');
        }
    }

    async updateUser(dto: UpdateUserDto) {
        const user = await this.userRepo.findOne({
            where: { id: dto.id },
        });

        if (!user) {
            throw new RpcException('User does not exists');
        }
        
        // TODO: No actualizar ni id, ni email
        const updated = this.userRepo.merge(user, dto);

        try {
            return await this.userRepo.save(updated);
        } catch (error) {
            throw new RpcException('Error updating user');
        }
    }

    async deleteUser(dto: DeleteUserDto) {
        const user = await this.userRepo.findOne({
            where: { id: dto.id },
        });

        if (!user) {
            throw new RpcException('User does not exists');
        }

        try {
            await this.userRepo.remove(user);

            return {
                success: true,
                id: dto.id,
            };
        } catch (error) {
            throw new RpcException('Error deleting user');
        }
}
}
