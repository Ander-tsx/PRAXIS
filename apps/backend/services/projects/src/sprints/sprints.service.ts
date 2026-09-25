import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { CreateSprintDto, StartSprintDto, UpdateSprintDto } from '@praxis/contracts';
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

    /* Un solo sprint planeado: «el siguiente». La interfaz no tiene dónde
       enseñar un segundo, y un planeado que nadie ve es donde se pierden
       tareas (auditoría S4). */
    const planeado = await this.findPlannedSprint(dto.boardId);
    if (planeado) {
      throw new RpcException({
        statusCode: 409,
        message: `Ya hay un sprint planeado en este tablero: "${planeado.name}".`,
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

  /** El sprint `PLANNED` de un tablero —el siguiente—, o `null`. */
  async findPlannedSprint(boardId: string) {
    return this.prisma.sprint.findFirst({
      where: { boardId, status: 'PLANNED' },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Nombre, meta y fechas. Un sprint cerrado no se toca: es historial.
   *
   * De uno en curso solo se mueve el **final** —alargar una semana es
   * corriente—; el inicio ya pasó y cambiarlo reescribiría el burndown.
   */
  async updateSprint(dto: UpdateSprintDto) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id: dto.id } });
    if (!sprint || sprint.boardId !== dto.boardId) {
      throw new RpcException({ statusCode: 404, message: 'Sprint no encontrado' });
    }
    if (sprint.status === 'CLOSED') {
      throw new RpcException({ statusCode: 409, message: 'Un sprint cerrado ya no se edita' });
    }
    if (sprint.status === 'ACTIVE' && dto.startDate !== undefined) {
      throw new RpcException({
        statusCode: 400,
        message: 'El sprint ya empezó: solo se puede cambiar cuándo termina',
      });
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : sprint.startDate;
    const endDate = dto.endDate ? new Date(dto.endDate) : sprint.endDate;
    if (startDate && endDate && endDate <= startDate) {
      throw new RpcException({
        statusCode: 400,
        message: 'La fecha de fin tiene que ser posterior a la de inicio',
      });
    }

    const updated = await this.prisma.sprint.update({
      where: { id: dto.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        /* Cadena vacía borra la meta. */
        ...(dto.goal !== undefined && { goal: dto.goal || null }),
        ...(dto.startDate !== undefined && { startDate }),
        ...(dto.endDate !== undefined && { endDate }),
      },
    });

    await this.redis.del(`sprints:board:${dto.boardId}`);
    return updated;
  }

  /**
   * Descarta un sprint planeado. Sus tareas ya volvieron al backlog: lo hace el
   * gateway antes de llamar aquí, igual que en el cierre.
   */
  async deletePlannedSprint(id: string, boardId: string) {
    const sprint = await this.prisma.sprint.findUnique({ where: { id } });
    if (!sprint || sprint.boardId !== boardId) {
      throw new RpcException({ statusCode: 404, message: 'Sprint no encontrado' });
    }
    if (sprint.status !== 'PLANNED') {
      throw new RpcException({
        statusCode: 409,
        message: 'Solo se puede descartar un sprint que todavía no ha empezado',
      });
    }
    await this.prisma.sprint.delete({ where: { id } });
    await this.redis.del(`sprints:board:${boardId}`);
    return { deleted: true };
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
    /* `createSprint` ya lo comprobaba y esto no (auditoría S8): con Scrum
       apagado se arrancaban sprints que nadie veía. */
    const board = await this.prisma.board.findUnique({ where: { id: dto.boardId } });
    if (!board?.scrumEnabled) {
      throw new RpcException({
        statusCode: 400,
        message: 'Este tablero no tiene Scrum encendido',
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

    const updated = await this.prisma.sprint
      .update({
        where: { id: dto.id },
        data: { status: 'ACTIVE', startDate, endDate, startedAt: new Date() },
      })
      .catch((error: unknown) => {
        /* El índice parcial `sprints_one_active_per_board`: otro inicio ganó la
           carrera entre la comprobación de arriba y esta escritura (S9). */
        if ((error as { code?: string } | null)?.code === 'P2002') {
          throw new RpcException({
            statusCode: 409,
            message: 'Ya hay un sprint activo en este tablero. Ciérralo antes de iniciar otro.',
          });
        }
        throw error;
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
  async markSprintClosed(id: string, boardId: string, summary?: Record<string, number>) {
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
      data: { status: 'CLOSED', closedAt: new Date(), ...(summary && { closeSummary: summary }) },
    });

    await this.redis.del(`sprints:board:${boardId}`);
    return updated;
  }
}
