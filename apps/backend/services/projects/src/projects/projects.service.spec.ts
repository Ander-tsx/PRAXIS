import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';

import { ProjectsService } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = {
  project: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  projectRole: {
    create: jest.fn(),
  },
  projectMember: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  board: {
    findUnique: jest.fn(),
  },
  workspace: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
    jest.clearAllMocks();
  });

  // ─── createProject ────────────────────────────────────────────────────

  describe('createProject', () => {
    const dto = { name: 'Mi Proyecto', description: 'Descripción', ownerId: 'u1' };

    it('debe crear proyecto con rol de administrador y miembro', async () => {
      const project = { id: 'p1', name: dto.name, slug: 'mi-proyecto', ownerId: 'u1' };

      // $transaction recibe una función — la ejecutamos con el mock de tx
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          project: {
            findUnique: jest.fn().mockResolvedValue(null), // slug no existe
            create: jest.fn().mockResolvedValue(project),
          },
          projectRole: {
            create: jest.fn().mockResolvedValue({ id: 'role-1' }),
          },
          projectMember: {
            create: jest.fn().mockResolvedValue({ id: 'pm-1' }),
          },
        };
        return fn(tx);
      });

      const result = await service.createProject(dto);

      expect(result).toEqual(project);
    });

    it('debe lanzar RpcException 409 si el nombre ya existe (P2002)', async () => {
      const prismaError = { code: 'P2002', message: 'Unique constraint' };
      mockPrisma.$transaction.mockRejectedValue(prismaError);

      await expect(service.createProject(dto)).rejects.toThrow(RpcException);
      await expect(service.createProject(dto)).rejects.toMatchObject({
        error: { statusCode: 409 },
      });
    });
  });

  // ─── findOneProject ───────────────────────────────────────────────────

  describe('findOneProject', () => {
    it('debe devolver proyecto cacheado si existe en Redis', async () => {
      const project = { id: 'p1', name: 'Proyecto' };
      mockRedis.get.mockResolvedValue(project);

      const result = await service.findOneProject('p1');

      expect(result).toEqual(project);
      expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
    });

    it('debe buscar en BD si no hay cache y guardar resultado', async () => {
      const project = {
        id: 'p1',
        name: 'Proyecto',
        workspaces: [],
        roles: [],
        _count: { members: 0 },
      };
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.project.findUnique.mockResolvedValue(project);

      const result = await service.findOneProject('p1');

      expect(result).toEqual(project);
      expect(mockRedis.set).toHaveBeenCalledWith('project:p1', project, 300);
    });

    it('debe lanzar RpcException 404 si el proyecto no existe', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(service.findOneProject('no-exist')).rejects.toThrow(RpcException);
      await expect(service.findOneProject('no-exist')).rejects.toMatchObject({
        error: { statusCode: 404 },
      });
    });
  });

  // ─── updateProject ────────────────────────────────────────────────────

  describe('updateProject', () => {
    it('debe actualizar proyecto e invalidar cache', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', name: 'Viejo' });
      const updated = { id: 'p1', name: 'Nuevo' };
      mockPrisma.project.update.mockResolvedValue(updated);

      const result = await service.updateProject({ id: 'p1', description: 'Otra desc' });

      expect(result).toEqual(updated);
      expect(mockRedis.del).toHaveBeenCalledWith('project:p1');
    });

    it('debe lanzar RpcException 404 si el proyecto no existe', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(
        service.updateProject({ id: 'no-exist', name: 'Nuevo' }),
      ).rejects.toThrow(RpcException);
    });

    it('debe lanzar RpcException 409 si el nombre duplicado (P2002)', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', name: 'Original' });
      mockPrisma.project.update.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.updateProject({ id: 'p1', name: 'Duplicado' }),
      ).rejects.toThrow(RpcException);
    });
  });

  // ─── deleteProject ────────────────────────────────────────────────────

  describe('deleteProject', () => {
    it('debe eliminar proyecto e invalidar cache', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1' });
      mockPrisma.project.delete.mockResolvedValue(undefined);

      const result = await service.deleteProject('p1');

      expect(result).toEqual({ success: true });
      expect(mockRedis.del).toHaveBeenCalledWith('project:p1');
    });

    it('debe lanzar RpcException 404 si el proyecto no existe', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(service.deleteProject('no-exist')).rejects.toThrow(RpcException);
    });
  });

  // ─── findAllProjects ──────────────────────────────────────────────────

  describe('findAllProjects', () => {
    it('debe devolver items y total paginados', async () => {
      const items = [{ id: 'p1', name: 'Proyecto 1' }];
      mockPrisma.project.findMany.mockResolvedValue(items);
      mockPrisma.project.count.mockResolvedValue(1);

      const result = await service.findAllProjects({});

      expect(result).toEqual({ items, total: 1 });
    });

    it('debe filtrar por búsqueda de texto', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.project.count.mockResolvedValue(0);

      await service.findAllProjects({ search: 'sprint' });

      const callArgs = mockPrisma.project.findMany.mock.calls[0][0];
      expect(callArgs.where.AND).toBeDefined();
    });

    it('debe excluir proyectos con status DELETED', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);
      mockPrisma.project.count.mockResolvedValue(0);

      await service.findAllProjects({});

      const callArgs = mockPrisma.project.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toEqual({ not: 'DELETED' });
    });
  });

  // ─── findProjectsByMember ─────────────────────────────────────────────

  describe('findProjectsByMember', () => {
    it('debe devolver proyectos cacheados si existen', async () => {
      const projects = [{ id: 'p1', name: 'Proyecto' }];
      mockRedis.get.mockResolvedValue(projects);

      const result = await service.findProjectsByMember({ userId: 'u1' });

      expect(result).toEqual(projects);
    });

    it('debe buscar en BD y cachear si no hay cache', async () => {
      const projects = [{ id: 'p1', name: 'Proyecto' }];
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.project.findMany.mockResolvedValue(projects);

      const result = await service.findProjectsByMember({ userId: 'u1' });

      expect(result).toEqual(projects);
      expect(mockRedis.set).toHaveBeenCalled();
    });
  });

  // ─── resolveResource ──────────────────────────────────────────────────

  describe('resolveResource', () => {
    it('debe resolver projectId desde boardId', async () => {
      mockPrisma.board.findUnique.mockResolvedValue({
        id: 'b1',
        workspace: { projectId: 'p1' },
      });

      const result = await service.resolveResource({ boardId: 'b1' });

      expect(result).toEqual({ projectId: 'p1' });
    });

    it('debe resolver projectId desde workspaceId', async () => {
      mockPrisma.workspace.findUnique.mockResolvedValue({
        id: 'w1',
        projectId: 'p1',
      });

      const result = await service.resolveResource({ workspaceId: 'w1' });

      expect(result).toEqual({ projectId: 'p1' });
    });

    it('debe lanzar RpcException 404 si el board no existe', async () => {
      mockPrisma.board.findUnique.mockResolvedValue(null);

      await expect(service.resolveResource({ boardId: 'no-exist' })).rejects.toThrow(
        RpcException,
      );
    });

    it('debe lanzar RpcException 400 si no se pasa ni boardId ni workspaceId', async () => {
      await expect(service.resolveResource({})).rejects.toThrow(RpcException);
      await expect(service.resolveResource({})).rejects.toMatchObject({
        error: { statusCode: 400 },
      });
    });
  });

  // ─── resolveSlug ──────────────────────────────────────────────────────

  describe('resolveSlug', () => {
    it('debe devolver projectId desde un slug válido', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1' });

      const result = await service.resolveSlug({ slug: 'mi-proyecto' });

      expect(result).toEqual({ projectId: 'p1' });
    });

    it('debe lanzar RpcException 404 si el slug no existe', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(null);

      await expect(service.resolveSlug({ slug: 'no-existe' })).rejects.toThrow(RpcException);
    });
  });
});
