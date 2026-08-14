import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { CreateBoardDto, UpdateBoardDto } from '@praxis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const LIST_CACHE_TTL = 60;

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createBoard(dto: CreateBoardDto) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: dto.workspaceId } });
    if (!workspace) {
      throw new RpcException({ statusCode: 404, message: 'Workspace no encontrado' });
    }

    const board = await this.prisma.board.create({
      data: { name: dto.name, workspaceId: dto.workspaceId },
    });

    await this.redis.del(`boards:workspace:${dto.workspaceId}`);
    await this.redis.del(`workspaces:project:${workspace.projectId}`);
    await this.invalidateProjectCache(dto.workspaceId);
    return board;
  }

  async findBoards(workspaceId: string) {
    const cacheKey = `boards:workspace:${workspaceId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const boards = await this.prisma.board.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      include: { columns: { orderBy: { order: 'asc' } } },
    });

    await this.redis.set(cacheKey, boards, LIST_CACHE_TTL);
    return boards;
  }

  async findOneBoard(id: string) {
    const cacheKey = `board:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const board = await this.prisma.board.findUnique({
      where: { id },
      include: { columns: { orderBy: { order: 'asc' } } },
    });

    if (!board) {
      throw new RpcException({ statusCode: 404, message: 'Board no encontrado' });
    }

    await this.redis.set(cacheKey, board, LIST_CACHE_TTL);
    return board;
  }

  async updateBoard(dto: UpdateBoardDto) {
    const board = await this.prisma.board.findUnique({ where: { id: dto.id } });
    if (!board) {
      throw new RpcException({ statusCode: 404, message: 'Board no encontrado' });
    }

    const updated = await this.prisma.board.update({
      where: { id: dto.id },
      data: { name: dto.name },
    });

    await this.redis.del(`board:${board.id}`);
    await this.redis.del(`boards:workspace:${board.workspaceId}`);
    await this.invalidateProjectCache(board.workspaceId);
    return updated;
  }

  async deleteBoard(id: string) {
    const board = await this.prisma.board.findUnique({ where: { id } });
    if (!board) {
      throw new RpcException({ statusCode: 404, message: 'Board no encontrado' });
    }

    await this.prisma.board.delete({ where: { id } });
    await this.redis.del(`board:${board.id}`);
    await this.redis.del(`boards:workspace:${board.workspaceId}`);
    await this.invalidateProjectCache(board.workspaceId);
    return { success: true };
  }

  /**
   * Invalida el detalle cacheado del proyecto al que pertenece el espacio.
   *
   * `findOneProject` guarda el proyecto entero en `project:<id>` durante 5
   * minutos, y ese árbol incluye **espacios → tableros → columnas**. Sin esto,
   * crear un tablero no se veía en el detalle del proyecto hasta que expiraba
   * la caché: la escritura funcionaba y la pantalla no se enteraba.
   */
  private async invalidateProjectCache(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { projectId: true },
    });
    if (workspace) await this.redis.del(`project:${workspace.projectId}`);
  }
}
