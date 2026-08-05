import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = {
  credential: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockJwt = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockReturnValue('7d'),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Limpiar mocks entre tests
    jest.clearAllMocks();
  });

  // ─── register ───────────────────────────────────────────────────────────

  describe('register', () => {
    const dto = { email: 'test@praxis.com', password: 'Secret123!' };

    it('debe registrar un usuario nuevo y devolver tokens', async () => {
      mockPrisma.credential.findUnique.mockResolvedValue(null);
      mockPrisma.credential.create.mockResolvedValue({
        id: 'cred-1',
        email: dto.email,
        user: { id: 'user-1' },
      });
      mockJwt.signAsync.mockResolvedValueOnce('access-token');
      mockJwt.signAsync.mockResolvedValueOnce('refresh-token');
      mockRedis.set.mockResolvedValue(undefined);

      const result = await service.register(dto);

      expect(result).toEqual({
        userId: 'user-1',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
      expect(mockPrisma.credential.findUnique).toHaveBeenCalledWith({
        where: { email: dto.email },
      });
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('debe lanzar RpcException 409 si el email ya existe', async () => {
      mockPrisma.credential.findUnique.mockResolvedValue({ id: 'cred-1' });

      await expect(service.register(dto)).rejects.toThrow(RpcException);
      await expect(service.register(dto)).rejects.toMatchObject({
        error: { statusCode: 409 },
      });
    });
  });

  // ─── login ──────────────────────────────────────────────────────────────

  describe('login', () => {
    const dto = { email: 'test@praxis.com', password: 'Secret123!' };

    it('debe autenticar y devolver tokens con credenciales válidas', async () => {
      // bcrypt.hash('Secret123!', 10) — simulamos un hash válido
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('Secret123!', 10);

      mockPrisma.credential.findUnique.mockResolvedValue({
        id: 'cred-1',
        email: dto.email,
        passwordHash: hash,
        user: { id: 'user-1', status: 'ACTIVE' },
      });
      mockJwt.signAsync.mockResolvedValueOnce('access-token');
      mockJwt.signAsync.mockResolvedValueOnce('refresh-token');
      mockRedis.set.mockResolvedValue(undefined);

      const result = await service.login(dto);

      expect(result).toEqual({
        userId: 'user-1',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('debe lanzar RpcException 401 si el email no existe', async () => {
      mockPrisma.credential.findUnique.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(RpcException);
      await expect(service.login(dto)).rejects.toMatchObject({
        error: { statusCode: 401 },
      });
    });

    it('debe lanzar RpcException 401 si la contraseña es incorrecta', async () => {
      mockPrisma.credential.findUnique.mockResolvedValue({
        id: 'cred-1',
        email: dto.email,
        passwordHash: '$2b$10$invalid_hash_that_will_not_match',
        user: { id: 'user-1', status: 'ACTIVE' },
      });

      await expect(service.login(dto)).rejects.toThrow(RpcException);
    });

    it('debe lanzar RpcException 403 si la cuenta está suspendida', async () => {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('Secret123!', 10);

      mockPrisma.credential.findUnique.mockResolvedValue({
        id: 'cred-1',
        email: dto.email,
        passwordHash: hash,
        user: { id: 'user-1', status: 'SUSPENDED' },
      });

      await expect(service.login(dto)).rejects.toThrow(RpcException);
      await expect(service.login(dto)).rejects.toMatchObject({
        error: { statusCode: 403 },
      });
    });
  });

  // ─── verifyToken ────────────────────────────────────────────────────────

  describe('verifyToken', () => {
    it('debe devolver payload cacheado si existe en Redis', async () => {
      const payload = { sub: 'user-1', iat: 123, exp: 999 };
      mockRedis.get.mockResolvedValue(payload);

      const result = await service.verifyToken({ token: 'valid-token' });

      expect(result).toEqual(payload);
      expect(mockJwt.verifyAsync).not.toHaveBeenCalled();
    });

    it('debe verificar el token con JWT si no está en cache', async () => {
      const payload = { sub: 'user-1', iat: 123, exp: 999 };
      mockRedis.get
        .mockResolvedValueOnce(null)   // cache miss para el token
        .mockResolvedValueOnce({ refreshToken: 'rt' }); // sesión activa
      mockJwt.verifyAsync.mockResolvedValue(payload);

      const result = await service.verifyToken({ token: 'valid-token' });

      expect(result).toEqual(payload);
      expect(mockJwt.verifyAsync).toHaveBeenCalledWith('valid-token');
      expect(mockRedis.set).toHaveBeenCalled();
    });

    it('debe lanzar RpcException 401 si el token es inválido', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockJwt.verifyAsync.mockRejectedValue(new Error('invalid'));

      await expect(service.verifyToken({ token: 'bad-token' })).rejects.toThrow(RpcException);
    });

    it('debe lanzar RpcException 401 si no hay sesión activa', async () => {
      const payload = { sub: 'user-1', iat: 123, exp: 999 };
      mockRedis.get
        .mockResolvedValueOnce(null)  // cache miss
        .mockResolvedValueOnce(null); // sin sesión
      mockJwt.verifyAsync.mockResolvedValue(payload);

      await expect(service.verifyToken({ token: 'valid-token' })).rejects.toThrow(RpcException);
    });
  });

  // ─── logout ─────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('debe eliminar la sesión de Redis y devolver success', async () => {
      mockRedis.del.mockResolvedValue(undefined);

      const result = await service.logout('user-1');

      expect(result).toEqual({ success: true });
      expect(mockRedis.del).toHaveBeenCalledWith('auth:session:user-1');
    });
  });

  // ─── refresh ────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('debe generar un nuevo access token con refresh válido', async () => {
      const payload = { sub: 'user-1' };
      mockJwt.verifyAsync.mockResolvedValue(payload);
      mockRedis.get.mockResolvedValue({ refreshToken: 'valid-refresh' });
      mockPrisma.credential.findFirst.mockResolvedValue({
        user: { status: 'ACTIVE' },
      });
      mockJwt.signAsync.mockResolvedValue('new-access-token');

      const result = await service.refresh('valid-refresh');

      expect(result).toEqual({ accessToken: 'new-access-token' });
    });

    it('debe lanzar RpcException 401 si el refresh token expiró', async () => {
      mockJwt.verifyAsync.mockRejectedValue(new Error('expired'));

      await expect(service.refresh('expired-token')).rejects.toThrow(RpcException);
    });

    it('debe lanzar RpcException 401 si el refresh token no coincide con Redis', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      mockRedis.get.mockResolvedValue({ refreshToken: 'otro-refresh' });

      await expect(service.refresh('bad-refresh')).rejects.toThrow(RpcException);
    });

    it('debe lanzar RpcException 401 y borrar sesión si la cuenta no está activa', async () => {
      mockJwt.verifyAsync.mockResolvedValue({ sub: 'user-1' });
      mockRedis.get.mockResolvedValue({ refreshToken: 'valid-refresh' });
      mockPrisma.credential.findFirst.mockResolvedValue({
        user: { status: 'SUSPENDED' },
      });

      await expect(service.refresh('valid-refresh')).rejects.toThrow(RpcException);
      expect(mockRedis.del).toHaveBeenCalledWith('auth:session:user-1');
    });
  });
});
