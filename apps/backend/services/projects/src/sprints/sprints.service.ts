import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { CreateSprintDto, StartSprintDto } from '@praxis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const LIST_CACHE_TTL = 30;

/**
 * Sprints de un tablero Scrum.
 *
 * ⚠️ **No orquesta el cierre.** Cerrar un sprint implica reasignar tareas
 * pendientes, y `Task` vive en tasks-service — otro esquema, otro dueño. La
 * coordinación va en el gateway (`SprintsController` del gateway), que ya
 * habla con los dos microservicios; aquí solo vive `markSprintClosed`, el
 * último paso, deliberadamente simple. Ver `docs/PLAN-SCRUM-KANBAN.md`, D6.
 */
@Injectable()
export class SprintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createSprint(dto: CreateSprintDto) {
    const board = await this.prisma.board.findUnique({ where: { id: dto.boardId } });
    if (!board) {
      throw new RpcException({ statusCode: 404, message: 'Tablero no encontrado' });
    }
    if (!board.scrumEnabled) {
      throw new RpcException({
        statusCode: 400,
        message: 'Este tablero no tiene Scrum encendido',
      });
    }

    const sprint = await this.prisma.sprint.create({
      data: { boardId: dto.boardId, name: dto.name, goal: dto.goal },
    });

    await this.redis.del(`sprints:board:${dto.boardId}`);
    return sprint;
  }

  async findSprintsByBoard(boardId: string) {
    const cacheKey = `sprints:board:${boardId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const sprints = await this.prisma.sprint.findMany({
      where: { boardId },
      orderBy: { createdAt: 'desc' },
    });

    await this.redis.set(cacheKey, sprints, LIST_CACHE_TTL);
    return sprints;
  }

  async findOneSprint(id: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id } });
    if (!sprint) {
      throw new RpcException({ statusCode: 404, message: 'Sprint no encontrado' });
    }
    return sprint;
  }

  /** Para que tasks-service compruebe que un `sprintId` es del tablero que dice. */
  async findSprintsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.prisma.sprint.findMany({ where: { id: { in: ids } } });
  }

  /** El sprint `ACTIVE` de un tablero, o `null`. Como mucho hay uno (D3). */
  async findActiveSprint(boardId: string) {
    return this.prisma.sprint.findFirst({ where: { boardId, status: 'ACTIVE' } });
  }

  async startSprint(dto: StartSprintDto) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id: dto.id } });
    if (!sprint) {
      throw new RpcException({ statusCode: 404, message: 'Sprint no encontrado' });
    }
    if (sprint.boardId !== dto.boardId) {
      throw new RpcException({ statusCode: 400, message: 'Ese sprint no es de este tablero' });
    }
    if (sprint.status !== 'PLANNED') {
      throw new RpcException({
        statusCode: 400,
        message: 'Solo se puede iniciar un sprint que todavía no ha arrancado',
      });
    }

    // D3: como mucho un sprint ACTIVE por tablero.
    const activo = await this.findActiveSprint(dto.boardId);
    if (activo) {
      throw new RpcException({
        statusCode: 409,
        message: `Ya hay un sprint activo en este tablero: "${activo.name}". Ciérralo antes de iniciar otro.`,
      });
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate <= startDate) {
      throw new RpcException({
        statusCode: 400,
        message: 'La fecha de fin tiene que ser posterior a la de inicio',
      });
    }

    const updated = await this.prisma.sprint.update({
      where: { id: dto.id },
      data: { status: 'ACTIVE', startDate, endDate },
    });

    await this.redis.del(`sprints:board:${dto.boardId}`);
    return updated;
  }

  /**
   * Marca un sprint como cerrado. No mueve ninguna tarea.
   *
   * El gateway ya reasignó todas las pendientes contra tasks-service **antes**
   * de llamar aquí. Este paso va el último a propósito: si algo de la
   * reasignación falla a mitad de camino, el sprint sigue `ACTIVE` y nada
   * queda en un estado a medias — cerrado pero con tareas todavía apuntándolo.
   */
  async markSprintClosed(id: string, boardId: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id } });
    if (!sprint) {
      throw new RpcException({ statusCode: 404, message: 'Sprint no encontrado' });
    }
    if (sprint.boardId !== boardId) {
      throw new RpcException({ statusCode: 400, message: 'Ese sprint no es de este tablero' });
    }
    if (sprint.status !== 'ACTIVE') {
      throw new RpcException({
        statusCode: 400,
        message: 'Solo se puede cerrar un sprint activo',
      });
    }

    const updated = await this.prisma.sprint.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });

    await this.redis.del(`sprints:board:${boardId}`);
    return updated;
  }
}
