import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  CreateBoardDto,
  UpdateBoardDto,
} from '@praxis/contracts';

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
    const board = await this.prisma.board.findUnique({
      where: { id: dto.id },
      include: { workspace: true },
    });
    if (!board) {
      throw new RpcException({ statusCode: 404, message: 'Board no encontrado' });
    }

    const updated = await this.prisma.board.update({
      where: { id: dto.id },
      data:  { name: dto.name },
    });

    await Promise.all([
      this.redis.del(`board:${dto.id}`),
      this.redis.del(`boards:workspace:${board.workspaceId}`),
      this.redis.del(`workspaces:project:${board.workspace.projectId}`),
      this.redis.del(`project:${board.workspace.projectId}`),
    ]);
    return updated;
  }

  async deleteBoard(id: string) {
    const board = await this.prisma.board.findUnique({
      where: { id },
      include: { workspace: true },
    });
    if (!board) {
      throw new RpcException({ statusCode: 404, message: 'Board no encontrado' });
    }

    await this.prisma.board.delete({ where: { id } });
    await Promise.all([
      this.redis.del(`board:${id}`),
      this.redis.del(`boards:workspace:${board.workspaceId}`),
      this.redis.del(`workspaces:project:${board.workspace.projectId}`),
      this.redis.del(`project:${board.workspace.projectId}`),
    ]);
    return { success: true };
  }
}
