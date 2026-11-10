import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import {
  CreateCommentDto,
  DeleteCommentDto,
  FindCommentsDto,
  UpdateCommentDto,
} from '@praxis/contracts';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Comentarios de una tarea.
 *
 * **No se cachean.** Es lo que más cambia de una tarea y lo que peor envejece:
 * un comentario que tarda un minuto en aparecer se lee como que no se envió, y
 * la gente lo escribe otra vez.
 *
 * Sí se invalida `task:<id>`, porque el detalle de la tarea lleva el recuento.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findComments(dto: FindCommentsDto) {
    await this.assertTaskInProject(dto.taskId, dto.projectId);

    return this.prisma.taskComment.findMany({
      where: { taskId: dto.taskId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createComment(dto: CreateCommentDto) {
    const task = await this.assertTaskInProject(dto.taskId, dto.projectId);

    const comment = await this.prisma.taskComment.create({
      data: {
        taskId: dto.taskId,
        authorId: dto.requesterId,
        body: dto.body,
        viaAgent: dto.via ?? null,
      },
    });

    await this.invalidate(dto.taskId, task.boardId);
    return comment;
  }

  /**
   * Edita un comentario.
   *
   * **Solo su autor**, aunque quien lo intente pueda moderar: moderar es poder
   * retirar lo que otro escribió, no reescribirlo poniendo su nombre.
   */
  async updateComment(dto: UpdateCommentDto) {
    const comment = await this.loadInProject(dto.id, dto.projectId);

    if (comment.authorId !== dto.requesterId) {
      throw new RpcException({
        statusCode: 403,
        message: 'Solo puedes editar tus propios comentarios',
      });
    }

    const updated = await this.prisma.taskComment.update({
      where: { id: dto.id },
      // `editedAt` solo se marca aquí, que es cuando cambia de verdad el texto.
      data: { body: dto.body, editedAt: new Date(), viaAgent: null },
    });

    await this.invalidate(comment.taskId, comment.task.boardId);
    return updated;
  }

  /** Lo borra su autor, o quien pueda eliminar tareas del proyecto. */
  async deleteComment(dto: DeleteCommentDto) {
    const comment = await this.loadInProject(dto.id, dto.projectId);

    if (comment.authorId !== dto.requesterId && !dto.canModerate) {
      throw new RpcException({
        statusCode: 403,
        message: 'Solo puedes eliminar tus propios comentarios',
      });
    }

    await this.prisma.taskComment.delete({ where: { id: dto.id } });
    await this.invalidate(comment.taskId, comment.task.boardId);

    return { success: true };
  }

  /**
   * Invalida la tarea **y el listado de su tablero**.
   *
   * Las dos, no solo la primera: los comentarios viajan dentro de la tarea
   * también en `GET /boards/:id/tasks`, que es de donde los lee la pantalla.
   * Invalidando solo `task:<id>` el comentario se guardaba y la interfaz seguía
   * enseñando el hilo viejo hasta que caducaba el minuto de caché — la trampa
   * de siempre, y esta vez la provocó meter los comentarios en el include.
   */
  private async invalidate(taskId: string, boardId: string) {
    /* Por prefijo: el listado del tablero se cachea con sufijos (filtros,
       página y tope) y un `del` exacto dejaría vivas todas las variantes. */
    await Promise.all([
      this.redis.del(`task:${taskId}`),
      this.redis.delByPrefix(`tasks:board:${boardId}`),
    ]);
  }

  /** La tarea existe y es del proyecto de la ruta. */
  private async assertTaskInProject(taskId: string, projectId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true, boardId: true },
    });
    if (!task) {
      throw new RpcException({ statusCode: 404, message: 'Tarea no encontrada' });
    }
    if (task.projectId !== projectId) {
      throw new RpcException({ statusCode: 403, message: 'Forbidden' });
    }
    return task;
  }

  /** El comentario existe y su tarea es del proyecto de la ruta. */
  private async loadInProject(id: string, projectId: string) {
    const comment = await this.prisma.taskComment.findUnique({
      where: { id },
      include: { task: { select: { projectId: true, boardId: true } } },
    });
    if (!comment) {
      throw new RpcException({ statusCode: 404, message: 'Comentario no encontrado' });
    }
    if (comment.task.projectId !== projectId) {
      throw new RpcException({ statusCode: 403, message: 'Forbidden' });
    }
    return comment;
  }
}
