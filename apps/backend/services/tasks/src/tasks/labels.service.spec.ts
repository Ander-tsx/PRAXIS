import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';

import { LabelsService } from './labels.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = {
  label: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  taskLabel: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LabelsService', () => {
  let service: LabelsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabelsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<LabelsService>(LabelsService);
    jest.clearAllMocks();
  });

  // ─── findLabels ───────────────────────────────────────────────────────

  describe('findLabels', () => {
    it('debe devolver etiquetas cacheadas si existen', async () => {
      const labels = [{ id: 'l1', name: 'Bug', color: '#ff0000' }];
      mockRedis.get.mockResolvedValue(labels);

      const result = await service.findLabels({ projectId: 'p1' });

      expect(result).toEqual(labels);
      expect(mockPrisma.label.findMany).not.toHaveBeenCalled();
    });

    it('debe buscar en BD y cachear si no hay cache', async () => {
      const labels = [{ id: 'l1', name: 'Bug', color: '#ff0000' }];
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.label.findMany.mockResolvedValue(labels);

      const result = await service.findLabels({ projectId: 'p1' });

      expect(result).toEqual(labels);
      expect(mockRedis.set).toHaveBeenCalledWith('labels:project:p1', labels, 300);
    });
  });

  // ─── createLabel ──────────────────────────────────────────────────────

  describe('createLabel', () => {
    const dto = { projectId: 'p1', name: 'Feature', color: '#00ff00' };

    it('debe crear etiqueta e invalidar cache', async () => {
      const label = { id: 'l1', ...dto };
      mockPrisma.label.create.mockResolvedValue(label);

      const result = await service.createLabel(dto);

      expect(result).toEqual(label);
      expect(mockRedis.del).toHaveBeenCalledWith('labels:project:p1');
    });

    it('debe lanzar RpcException 409 si el nombre ya existe en el proyecto (P2002)', async () => {
      mockPrisma.label.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.createLabel(dto)).rejects.toThrow(RpcException);
      await expect(service.createLabel(dto)).rejects.toMatchObject({
        error: { statusCode: 409 },
      });
    });
  });

  // ─── updateLabel ──────────────────────────────────────────────────────

  describe('updateLabel', () => {
    const dto = { id: 'l1', projectId: 'p1', name: 'Bugfix', color: '#ff0000' };

    it('debe actualizar etiqueta e invalidar cache', async () => {
      mockPrisma.label.findUnique.mockResolvedValue({
        id: 'l1',
        projectId: 'p1',
        name: 'Bug',
      });
      const updated = { id: 'l1', name: 'Bugfix', color: '#ff0000' };
      mockPrisma.label.update.mockResolvedValue(updated);
      mockPrisma.taskLabel.findMany.mockResolvedValue([]);

      const result = await service.updateLabel(dto);

      expect(result).toEqual(updated);
      expect(mockRedis.del).toHaveBeenCalledWith('labels:project:p1');
    });

    it('debe lanzar RpcException 404 si la etiqueta no existe', async () => {
      mockPrisma.label.findUnique.mockResolvedValue(null);

      await expect(service.updateLabel(dto)).rejects.toThrow(RpcException);
    });

    it('debe lanzar RpcException 403 si la etiqueta no pertenece al proyecto', async () => {
      mockPrisma.label.findUnique.mockResolvedValue({
        id: 'l1',
        projectId: 'otro-proyecto',
      });

      await expect(service.updateLabel(dto)).rejects.toThrow(RpcException);
      await expect(service.updateLabel(dto)).rejects.toMatchObject({
        error: { statusCode: 403 },
      });
    });

    it('debe lanzar RpcException 409 si el nombre duplicado (P2002)', async () => {
      mockPrisma.label.findUnique.mockResolvedValue({
        id: 'l1',
        projectId: 'p1',
      });
      mockPrisma.label.update.mockRejectedValue({ code: 'P2002' });

      await expect(service.updateLabel(dto)).rejects.toThrow(RpcException);
    });
  });

  // ─── deleteLabel ──────────────────────────────────────────────────────

  describe('deleteLabel', () => {
    it('debe eliminar etiqueta e informar cuántas tareas la tenían', async () => {
      mockPrisma.label.findUnique.mockResolvedValue({ id: 'l1', projectId: 'p1' });
      mockPrisma.taskLabel.count.mockResolvedValue(3);
      mockPrisma.taskLabel.findMany.mockResolvedValue([]);
      mockPrisma.label.delete.mockResolvedValue(undefined);

      const result = await service.deleteLabel({ id: 'l1', projectId: 'p1' });

      expect(result).toEqual({ success: true, removedFrom: 3 });
      expect(mockRedis.del).toHaveBeenCalledWith('labels:project:p1');
    });

    it('debe lanzar RpcException 404 si la etiqueta no existe', async () => {
      mockPrisma.label.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteLabel({ id: 'no-exist', projectId: 'p1' }),
      ).rejects.toThrow(RpcException);
    });
  });
});
