import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';

import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = {
  task: {
    findUnique: jest.fn(),
  },
  taskComment: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CommentsService', () => {
  let service: CommentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    jest.clearAllMocks();
  });

  // ─── findComments ─────────────────────────────────────────────────────

  describe('findComments', () => {
    it('debe devolver los comentarios de una tarea', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        projectId: 'p1',
        boardId: 'b1',
      });
      const comments = [
        { id: 'c1', body: 'Hola', authorId: 'u1' },
        { id: 'c2', body: 'Mundo', authorId: 'u2' },
      ];
      mockPrisma.taskComment.findMany.mockResolvedValue(comments);

      const result = await service.findComments({ taskId: 't1', projectId: 'p1' });

      expect(result).toEqual(comments);
    });

    it('debe lanzar RpcException 404 si la tarea no existe', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(
        service.findComments({ taskId: 'no-exist', projectId: 'p1' }),
      ).rejects.toThrow(RpcException);
    });

    it('debe lanzar RpcException 403 si la tarea no es del proyecto', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        projectId: 'otro-proyecto',
        boardId: 'b1',
      });

      await expect(
        service.findComments({ taskId: 't1', projectId: 'p1' }),
      ).rejects.toThrow(RpcException);
    });
  });

  // ─── createComment ────────────────────────────────────────────────────

  describe('createComment', () => {
    const dto = {
      taskId: 't1',
      projectId: 'p1',
      requesterId: 'u1',
      body: 'Un comentario',
    };

    it('debe crear comentario e invalidar cache de tarea y tablero', async () => {
      mockPrisma.task.findUnique.mockResolvedValue({
        projectId: 'p1',
        boardId: 'b1',
      });
      const comment = { id: 'c1', ...dto };
      mockPrisma.taskComment.create.mockResolvedValue(comment);

      const result = await service.createComment(dto);

      expect(result).toEqual(comment);
      expect(mockRedis.del).toHaveBeenCalledWith('task:t1');
      expect(mockRedis.del).toHaveBeenCalledWith('tasks:board:b1');
    });

    it('debe lanzar RpcException 404 si la tarea no existe', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(service.createComment(dto)).rejects.toThrow(RpcException);
    });
  });

  // ─── updateComment ────────────────────────────────────────────────────

  describe('updateComment', () => {
    const dto = {
      id: 'c1',
      projectId: 'p1',
      requesterId: 'u1',
      body: 'Comentario editado',
    };

    it('debe actualizar comentario del propio autor', async () => {
      mockPrisma.taskComment.findUnique.mockResolvedValue({
        id: 'c1',
        authorId: 'u1',
        taskId: 't1',
        task: { projectId: 'p1', boardId: 'b1' },
      });
      const updated = { id: 'c1', body: 'Comentario editado' };
      mockPrisma.taskComment.update.mockResolvedValue(updated);

      const result = await service.updateComment(dto);

      expect(result).toEqual(updated);
      expect(mockRedis.del).toHaveBeenCalledWith('task:t1');
    });

    it('debe lanzar RpcException 403 si intenta editar comentario de otro', async () => {
      mockPrisma.taskComment.findUnique.mockResolvedValue({
        id: 'c1',
        authorId: 'u2', // otro usuario
        taskId: 't1',
        task: { projectId: 'p1', boardId: 'b1' },
      });

      await expect(service.updateComment(dto)).rejects.toThrow(RpcException);
      await expect(service.updateComment(dto)).rejects.toMatchObject({
        error: { statusCode: 403 },
      });
    });

    it('debe lanzar RpcException 404 si el comentario no existe', async () => {
      mockPrisma.taskComment.findUnique.mockResolvedValue(null);

      await expect(service.updateComment(dto)).rejects.toThrow(RpcException);
    });
  });

  // ─── deleteComment ────────────────────────────────────────────────────

  describe('deleteComment', () => {
    it('debe permitir al autor eliminar su propio comentario', async () => {
      mockPrisma.taskComment.findUnique.mockResolvedValue({
        id: 'c1',
        authorId: 'u1',
        taskId: 't1',
        task: { projectId: 'p1', boardId: 'b1' },
      });
      mockPrisma.taskComment.delete.mockResolvedValue(undefined);

      const result = await service.deleteComment({
        id: 'c1',
        projectId: 'p1',
        requesterId: 'u1',
        canModerate: false,
      });

      expect(result).toEqual({ success: true });
    });

    it('debe permitir a un moderador eliminar comentario de otro', async () => {
      mockPrisma.taskComment.findUnique.mockResolvedValue({
        id: 'c1',
        authorId: 'u2',
        taskId: 't1',
        task: { projectId: 'p1', boardId: 'b1' },
      });
      mockPrisma.taskComment.delete.mockResolvedValue(undefined);

      const result = await service.deleteComment({
        id: 'c1',
        projectId: 'p1',
        requesterId: 'u1',
        canModerate: true,
      });

      expect(result).toEqual({ success: true });
    });

    it('debe lanzar RpcException 403 si no es autor ni moderador', async () => {
      mockPrisma.taskComment.findUnique.mockResolvedValue({
        id: 'c1',
        authorId: 'u2',
        taskId: 't1',
        task: { projectId: 'p1', boardId: 'b1' },
      });

      await expect(
        service.deleteComment({
          id: 'c1',
          projectId: 'p1',
          requesterId: 'u1',
          canModerate: false,
        }),
      ).rejects.toThrow(RpcException);
    });

    it('debe lanzar RpcException 404 si el comentario no existe', async () => {
      mockPrisma.taskComment.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteComment({
          id: 'no-exist',
          projectId: 'p1',
          requesterId: 'u1',
          canModerate: false,
        }),
      ).rejects.toThrow(RpcException);
    });
  });
});
