import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import {
  CreateColumnDto,
  ReorderColumnsDto,
  UpdateColumnDto,
  defaultColumnColor,
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
      data: {
        name: dto.name,
        order: dto.order,
        // Sin color explícito se reparte por posición, como hacía la interfaz.
        color: dto.color ?? defaultColumnColor(dto.order),
        boardId: dto.boardId,
      },
    });

    await this.invalidateBoardCaches(board.id, board.workspaceId);
    return column;
  }

  /**
   * Renombra una columna o le cambia el color.
   *
   * ⚠️ **Renombrar deja el `status` de sus tareas apuntando al nombre viejo.**
   * `Task.status` guarda el nombre de la columna, no su id, y la tarea vive en
   * otro microservicio: la cascada la coordina el gateway
   * (`ColumnStatusSyncService`) llamando a `task_restatus` después de esto. Aquí
   * solo se cambia la columna.
   */
  async updateColumn(dto: UpdateColumnDto) {
    if (dto.name === undefined && dto.color === undefined) {
      throw new RpcException({
        statusCode: 400,
        message: 'No hay nada que cambiar: manda al menos un nombre o un color',
      });
    }

    const column = await this.prisma.boardColumn.findUnique({
      where: { id: dto.id },
      include: { board: true },
    });
    if (!column) {
      throw new RpcException({ statusCode: 404, message: 'Columna no encontrada' });
    }

    const updated = await this.prisma.boardColumn.update({
      where: { id: dto.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.color !== undefined && { color: dto.color }),
      },
    });

    await this.invalidateBoardCaches(column.board.id, column.board.workspaceId);
    return updated;
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
    await this.invalidateBoardCaches(board.id, board.workspaceId);
    return columns;
  }

  /**
   * Columnas por id, sin caché.
   *
   * Es una consulta puntual del gateway para componer `/me/tasks`, con los ids
   * que ya trae en la mano; cachearla obligaría a invalidar por columna en cada
   * cambio de color a cambio de ahorrar una consulta por clave primaria.
   */
  async findColumnsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.prisma.boardColumn.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, color: true, boardId: true },
    });
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
    await this.invalidateBoardCaches(column.board.id, column.board.workspaceId);
    return { success: true };
  }

  /**
   * Invalida las tres cachés que contienen columnas.
   *
   * Son tres claves distintas y hay que tocarlas todas:
   *  - `board:<id>`               → `GET /boards/:id`, con sus columnas
   *  - `boards:workspace:<id>`    → la lista de tableros del espacio
   *  - `project:<id>`             → el detalle, que trae el árbol entero
   *
   * Faltaba la primera: reordenar guardaba bien y `GET /boards/:id` seguía
   * devolviendo el orden viejo durante un minuto.
   */
  private async invalidateBoardCaches(boardId: string, workspaceId: string) {
    await this.redis.del(`board:${boardId}`);
    await this.redis.del(`boards:workspace:${workspaceId}`);
    await this.invalidateProjectCache(workspaceId);
  }

  /** Ver la nota en boards.service: el detalle del proyecto trae las columnas. */
  private async invalidateProjectCache(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { projectId: true },
    });
    if (workspace) await this.redis.del(`project:${workspace.projectId}`);
  }
}
