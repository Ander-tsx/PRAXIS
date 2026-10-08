import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import {
  type CreateTaskLinkDto,
  type DeleteTaskLinkDto,
  TASK_LINKS_MAX_PER_TASK,
} from '@praxis/contracts';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Enlaces adjuntos a una tarea —un Google Doc, un Figma, un PR—.
 *
 * Aparte de `AttachmentsService` porque no comparten nada más que la sección
 * del panel: un adjunto guarda bytes y cuenta contra el almacén de la
 * organización, un enlace solo guarda la URL. El permiso (`canEditTask`) lo
 * comprueba el gateway; aquí, que la tarea sea del proyecto de la ruta.
 */
@Injectable()
export class TaskLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async create(dto: CreateTaskLinkDto) {
    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      select: { id: true, projectId: true, boardId: true, _count: { select: { links: true } } },
    });
    if (!task) throw new RpcException({ statusCode: 404, message: 'Tarea no encontrada' });
    if (task.projectId !== dto.projectId) {
      throw new RpcException({ statusCode: 403, message: 'Forbidden' });
    }
    if (task._count.links >= TASK_LINKS_MAX_PER_TASK) {
      throw new RpcException({
        statusCode: 400,
        message: `Una tarea admite hasta ${TASK_LINKS_MAX_PER_TASK} enlaces`,
      });
    }

    const link = await this.prisma.taskLink.create({
      data: {
        taskId: task.id,
        url: dto.url.trim(),
        title: dto.title?.trim() || null,
        addedBy: dto.requesterId,
      },
    });
    await this.invalidate(task.id, task.boardId);
    return link;
  }

  /** Lo borra quien lo añadió, o quien pueda eliminar tareas (`canModerate`). */
  async delete(dto: DeleteTaskLinkDto) {
    const link = await this.prisma.taskLink.findUnique({
      where: { id: dto.id },
      include: { task: { select: { id: true, projectId: true, boardId: true } } },
    });
    if (!link || link.taskId !== dto.taskId) {
      throw new RpcException({ statusCode: 404, message: 'Enlace no encontrado' });
    }
    if (link.task.projectId !== dto.projectId) {
      throw new RpcException({ statusCode: 403, message: 'Forbidden' });
    }
    if (link.addedBy !== dto.requesterId && !dto.canModerate) {
      throw new RpcException({
        statusCode: 403,
        message: 'Solo puedes quitar los enlaces que añadiste',
      });
    }

    await this.prisma.taskLink.delete({ where: { id: link.id } });
    await this.invalidate(link.task.id, link.task.boardId);
    return { success: true };
  }

  /**
   * ⚠️ El tablero con `delByPrefix`: su caché lleva sufijos (`:col:`,
   * `:p1:l50`) y un `del` exacto dejaría la tarjeta sin su marca un minuto
   * (trampa 26 de CLAUDE.md).
   */
  private async invalidate(taskId: string, boardId: string) {
    await Promise.all([
      this.redis.del(`task:${taskId}`),
      this.redis.delByPrefix(`tasks:board:${boardId}`),
    ]);
  }
}
