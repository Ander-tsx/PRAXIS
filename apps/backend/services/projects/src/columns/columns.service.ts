import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  CreateColumnDto,
  ReorderColumnsDto,
} from '@praxis/contracts';

@Injectable()
export class ColumnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createColumn(dto: CreateColumnDto) {
    const board = await this.prisma.board.findUnique({ where: { id: dto.boardId } });
    if (!board) {
      throw new RpcException({ statusCode: 404, message: 'Board no encontrado' });
    }

    const column = await this.prisma.boardColumn.create({
      data: { name: dto.name, order: dto.order, boardId: dto.boardId },
    });

    await this.redis.del(`boards:workspace:${board.workspaceId}`);
    return column;
  }

  async reorderColumns(dto: ReorderColumnsDto) {
    const board = await this.prisma.board.findUnique({ where: { id: dto.boardId } });
    if (!board) {
      throw new RpcException({ statusCode: 404, message: 'Board no encontrado' });
    }

    const updates = dto.columnIds.map((colId, index) =>
      this.prisma.boardColumn.update({
        where: { id: colId },
        data:  { order: index },
      }),
    );

    const columns = await this.prisma.$transaction(updates);
    await this.redis.del(`boards:workspace:${board.workspaceId}`);
    return columns;
  }

  async deleteColumn(id: string) {
    const column = await this.prisma.boardColumn.findUnique({
      where: { id },
      include: { board: true },
    });
    if (!column) {
      throw new RpcException({ statusCode: 404, message: 'Columna no encontrada' });
    }

    await this.prisma.boardColumn.delete({ where: { id } });
    await this.redis.del(`boards:workspace:${column.board.workspaceId}`);
    return { success: true };
  }
}
