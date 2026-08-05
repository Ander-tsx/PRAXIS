import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';

import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { GLOBAL_ROLES } from '@praxis/contracts';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = {
  role: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  userRole: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PermissionsService', () => {
  let service: PermissionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
    jest.clearAllMocks();
  });

  // ─── findAll ──────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('debe devolver roles cacheados si existen', async () => {
      const roles = [{ id: 'r1', name: 'Admin' }];
      mockRedis.get.mockResolvedValue(roles);

      const result = await service.findAll();

      expect(result).toEqual(roles);
      expect(mockPrisma.role.findMany).not.toHaveBeenCalled();
    });

    it('debe buscar roles en BD si no hay cache', async () => {
      const roles = [{ id: 'r1', name: 'Admin' }, { id: 'r2', name: 'User' }];
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.role.findMany.mockResolvedValue(roles);

      const result = await service.findAll();

      expect(result).toEqual(roles);
      expect(mockRedis.set).toHaveBeenCalledWith('roles:all', roles, 300);
    });
  });

  // ─── assign ───────────────────────────────────────────────────────────

  describe('assign', () => {
    const dto = { userId: 'u1', roleName: 'Admin' };

    it('debe asignar un rol al usuario', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: 'Admin' });
      mockPrisma.userRole.findUnique.mockResolvedValue(null); // no tiene el rol
      const created = { id: 'ur1', userId: 'u1', roleId: 'r1', role: { name: 'Admin' } };
      mockPrisma.userRole.create.mockResolvedValue(created);

      const result = await service.assign(dto);

      expect(result).toEqual(created);
      expect(mockRedis.del).toHaveBeenCalledWith('roles:user:u1');
    });

    it('debe lanzar RpcException 404 si el rol no existe', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(service.assign(dto)).rejects.toThrow(RpcException);
      await expect(service.assign(dto)).rejects.toMatchObject({
        error: { statusCode: 404 },
      });
    });

    it('debe lanzar RpcException 409 si el usuario ya tiene el rol', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      mockPrisma.userRole.findUnique.mockResolvedValue({ id: 'ur1' });

      await expect(service.assign(dto)).rejects.toThrow(RpcException);
      await expect(service.assign(dto)).rejects.toMatchObject({
        error: { statusCode: 409 },
      });
    });
  });

  // ─── revoke ───────────────────────────────────────────────────────────

  describe('revoke', () => {
    const dto = { userId: 'u1', roleName: 'Admin' };

    it('debe revocar un rol del usuario', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1', name: 'Admin' });
      mockPrisma.userRole.findUnique.mockResolvedValue({ id: 'ur1' });
      mockPrisma.userRole.delete.mockResolvedValue(undefined);

      const result = await service.revoke(dto);

      expect(result).toEqual({ success: true });
      expect(mockRedis.del).toHaveBeenCalledWith('roles:user:u1');
    });

    it('debe lanzar RpcException 404 si el rol no existe', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      await expect(service.revoke(dto)).rejects.toThrow(RpcException);
    });

    it('debe lanzar RpcException 404 si el usuario no tiene el rol', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      mockPrisma.userRole.findUnique.mockResolvedValue(null);

      await expect(service.revoke(dto)).rejects.toThrow(RpcException);
      await expect(service.revoke(dto)).rejects.toMatchObject({
        error: { statusCode: 404 },
      });
    });

    it('debe impedir revocar el último SuperAdmin', async () => {
      const superAdminDto = { userId: 'u1', roleName: GLOBAL_ROLES.SUPER_ADMIN };
      mockPrisma.role.findUnique
        .mockResolvedValueOnce({ id: 'r-sa', name: GLOBAL_ROLES.SUPER_ADMIN }) // revoke lookup
        .mockResolvedValueOnce({ id: 'r-sa' }); // countRoleHolders lookup
      mockPrisma.userRole.findUnique.mockResolvedValue({ id: 'ur1' });
      // Solo queda 1 SuperAdmin
      mockPrisma.userRole.findMany.mockResolvedValue([{ userId: 'u1' }]);

      await expect(service.revoke(superAdminDto)).rejects.toThrow(RpcException);
      await expect(service.revoke(superAdminDto)).rejects.toMatchObject({
        error: { statusCode: 409 },
      });
    });
  });

  // ─── getUserRoles ─────────────────────────────────────────────────────

  describe('getUserRoles', () => {
    it('debe devolver roles cacheados si existen', async () => {
      const roles = [{ name: 'Admin' }];
      mockRedis.get.mockResolvedValue(roles);

      const result = await service.getUserRoles('u1');

      expect(result).toEqual(roles);
      expect(mockPrisma.userRole.findMany).not.toHaveBeenCalled();
    });

    it('debe buscar en BD, mapear y cachear si no hay cache', async () => {
      mockRedis.get.mockResolvedValue(null);
      const userRoles = [
        { userId: 'u1', role: { name: 'Admin' } },
        { userId: 'u1', role: { name: 'User' } },
      ];
      mockPrisma.userRole.findMany.mockResolvedValue(userRoles);

      const result = await service.getUserRoles('u1');

      expect(result).toEqual([{ name: 'Admin' }, { name: 'User' }]);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'roles:user:u1',
        [{ name: 'Admin' }, { name: 'User' }],
        60,
      );
    });
  });

  // ─── checkRole ────────────────────────────────────────────────────────

  describe('checkRole', () => {
    it('debe devolver hasRole: true si el usuario tiene el rol', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      mockPrisma.userRole.findUnique.mockResolvedValue({ id: 'ur1' });

      const result = await service.checkRole({ userId: 'u1', roleName: 'Admin' });

      expect(result).toEqual({ hasRole: true });
    });

    it('debe devolver hasRole: false si el usuario no tiene el rol', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      mockPrisma.userRole.findUnique.mockResolvedValue(null);

      const result = await service.checkRole({ userId: 'u1', roleName: 'Admin' });

      expect(result).toEqual({ hasRole: false });
    });

    it('debe devolver hasRole: false si el rol no existe', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      const result = await service.checkRole({ userId: 'u1', roleName: 'NoExiste' });

      expect(result).toEqual({ hasRole: false });
    });
  });

  // ─── getRolesForUsers ─────────────────────────────────────────────────

  describe('getRolesForUsers', () => {
    it('debe devolver objeto vacío si no hay ids', async () => {
      const result = await service.getRolesForUsers({ userIds: [] });
      expect(result).toEqual({});
    });

    it('debe agrupar roles por userId', async () => {
      mockPrisma.userRole.findMany.mockResolvedValue([
        { userId: 'u1', role: { name: 'Admin' } },
        { userId: 'u1', role: { name: 'User' } },
        { userId: 'u2', role: { name: 'User' } },
      ]);

      const result = await service.getRolesForUsers({ userIds: ['u1', 'u2'] });

      expect(result).toEqual({
        u1: ['Admin', 'User'],
        u2: ['User'],
      });
    });
  });

  // ─── countRoleHolders ─────────────────────────────────────────────────

  describe('countRoleHolders', () => {
    it('debe devolver count: 0 si el rol no existe', async () => {
      mockPrisma.role.findUnique.mockResolvedValue(null);

      const result = await service.countRoleHolders({ roleName: 'NoExiste' as any });

      expect(result).toEqual({ count: 0, userIds: [] });
    });

    it('debe devolver conteo y userIds correctos', async () => {
      mockPrisma.role.findUnique.mockResolvedValue({ id: 'r1' });
      mockPrisma.userRole.findMany.mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
      ]);

      const result = await service.countRoleHolders({ roleName: 'Admin' as any });

      expect(result).toEqual({ count: 2, userIds: ['u1', 'u2'] });
    });
  });
});
