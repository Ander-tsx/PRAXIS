import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';

import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  credential: {
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  // ─── findAll ──────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('debe devolver items y total paginados', async () => {
      const users = [{ id: 'u1', firstName: 'Juan' }];
      mockPrisma.user.findMany.mockResolvedValue(users);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result).toEqual({ items: users, total: 1 });
      expect(mockPrisma.user.findMany).toHaveBeenCalled();
    });

    it('debe aplicar filtro de búsqueda cuando se proporciona', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAll({ filters: { search: 'juan' } });

      const callArgs = mockPrisma.user.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.where.OR).toHaveLength(3);
    });

    it('debe respetar paginación personalizada', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAll({ query: { page: 2, limit: 10 } });

      const callArgs = mockPrisma.user.findMany.mock.calls[0][0];
      expect(callArgs.skip).toBe(10); // (2-1) * 10
      expect(callArgs.take).toBe(10);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('debe devolver usuario cacheado si existe en Redis', async () => {
      const cached = { id: 'u1', firstName: 'Juan' };
      mockRedis.get.mockResolvedValue(cached);

      const result = await service.findOne('u1');

      expect(result).toEqual(cached);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('debe buscar en BD si no hay cache y guardar resultado', async () => {
      const user = { id: 'u1', firstName: 'Juan', credential: { email: 'j@test.com' } };
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.findOne('u1');

      expect(result).toEqual(user);
      expect(mockRedis.set).toHaveBeenCalledWith('user:u1', user, 300);
    });

    it('debe lanzar RpcException 404 si el usuario no existe', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('no-exist')).rejects.toThrow(RpcException);
      await expect(service.findOne('no-exist')).rejects.toMatchObject({
        error: { statusCode: 404 },
      });
    });
  });

  // ─── update ───────────────────────────────────────────────────────────

  describe('update', () => {
    it('debe actualizar nombre del usuario e invalidar cache', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      const updated = { id: 'u1', firstName: 'Pedro', credential: { email: 'p@test.com' } };
      mockPrisma.user.update.mockResolvedValue(updated);

      const result = await service.update({ id: 'u1', firstName: 'Pedro' });

      expect(result).toEqual(updated);
      expect(mockRedis.del).toHaveBeenCalledWith('user:u1');
    });

    it('debe lanzar RpcException 404 si el usuario a actualizar no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.update({ id: 'no-exist' })).rejects.toThrow(RpcException);
    });
  });

  // ─── setStatus ────────────────────────────────────────────────────────

  describe('setStatus', () => {
    it('debe cambiar status y borrar sesión si se suspende', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.user.update.mockResolvedValue({
        id: 'u1',
        status: 'SUSPENDED',
        credential: { email: 'test@test.com' },
      });

      const result = await service.setStatus({ id: 'u1', status: 'SUSPENDED' as any });

      expect(result.status).toBe('SUSPENDED');
      expect(mockRedis.del).toHaveBeenCalledWith('user:u1');
      expect(mockRedis.del).toHaveBeenCalledWith('auth:session:u1');
    });

    it('no debe borrar sesión al reactivar un usuario', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      mockPrisma.user.update.mockResolvedValue({
        id: 'u1',
        status: 'ACTIVE',
        credential: { email: 'test@test.com' },
      });

      await service.setStatus({ id: 'u1', status: 'ACTIVE' as any });

      expect(mockRedis.del).toHaveBeenCalledWith('user:u1');
      expect(mockRedis.del).not.toHaveBeenCalledWith('auth:session:u1');
    });

    it('debe lanzar RpcException 404 si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.setStatus({ id: 'no-exist', status: 'SUSPENDED' as any }),
      ).rejects.toThrow(RpcException);
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────

  describe('delete', () => {
    it('debe eliminar usuario y credencial en transacción', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        credentialId: 'cred-1',
        credential: { id: 'cred-1' },
      });
      mockPrisma.$transaction.mockResolvedValue(undefined);

      const result = await service.delete('u1');

      expect(result).toEqual({ success: true, id: 'u1' });
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith('user:u1');
      expect(mockRedis.del).toHaveBeenCalledWith('auth:session:u1');
    });

    it('debe lanzar RpcException 404 si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.delete('no-exist')).rejects.toThrow(RpcException);
    });
  });

  // ─── findByIds ────────────────────────────────────────────────────────

  describe('findByIds', () => {
    it('debe devolver array vacío si no se pasan ids', async () => {
      const result = await service.findByIds([]);
      expect(result).toEqual([]);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('debe buscar usuarios por lista de ids', async () => {
      const users = [
        { id: 'u1', firstName: 'Juan' },
        { id: 'u2', firstName: 'Pedro' },
      ];
      mockPrisma.user.findMany.mockResolvedValue(users);

      const result = await service.findByIds(['u1', 'u2']);

      expect(result).toEqual(users);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['u1', 'u2'] } },
        include: { credential: { select: { email: true } } },
      });
    });

    it('debe eliminar ids duplicados', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.findByIds(['u1', 'u1', 'u2']);

      const callArgs = mockPrisma.user.findMany.mock.calls[0][0];
      expect(callArgs.where.id.in).toEqual(['u1', 'u2']);
    });
  });
});
