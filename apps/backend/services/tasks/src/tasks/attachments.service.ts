import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import {
  ATTACHMENT_MAX_BYTES,
  CreateAttachmentDto,
  DeleteAttachmentDto,
  FindAttachmentsDto,
  GetAttachmentDto,
} from '@praxis/contracts';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/** Lo que se devuelve de un adjunto: todo menos los bytes. */
const METADATA = {
  id: true,
  taskId: true,
  filename: true,
  mimeType: true,
  size: true,
  uploadedBy: true,
  createdAt: true,
} as const;

/**
 * Adjuntos de una tarea.
 *
 * **Los bytes nunca entran en la caché de Redis ni en el listado.** Solo se
 * leen en `getContent`, que es la ruta de descarga. Todo lo demás trabaja con
 * `METADATA`.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findAttachments(dto: FindAttachmentsDto) {
    await this.assertTaskInProject(dto.taskId, dto.projectId);

    return this.prisma.taskAttachment.findMany({
      where: { taskId: dto.taskId },
      orderBy: { createdAt: 'asc' },
      select: METADATA,
    });
  }

  async createAttachment(dto: CreateAttachmentDto) {
    const task = await this.assertTaskInProject(dto.taskId, dto.projectId);

    const data = Buffer.from(dto.content, 'base64');

    /**
     * Se mide sobre los bytes ya decodificados, no sobre lo que declaró nadie.
     * El gateway ya comprobó el tamaño, pero este servicio no puede fiarse de
     * su llamante — mismo criterio que con el `projectId` de las tareas.
     */
    if (data.length === 0) {
      throw new RpcException({ statusCode: 400, message: 'El archivo está vacío' });
    }
    if (data.length > ATTACHMENT_MAX_BYTES) {
      throw new RpcException({
        statusCode: 413,
        message: `El archivo supera el máximo de ${Math.round(ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB`,
      });
    }

    const attachment = await this.prisma.taskAttachment.create({
      data: {
        taskId: dto.taskId,
        filename: dto.filename,
        mimeType: dto.mimeType,
        size: data.length,
        uploadedBy: dto.requesterId,
        blob: { create: { data } },
      },
      select: METADATA,
    });

    await this.invalidate(dto.taskId, task.boardId);
    return attachment;
  }

  /**
   * Los bytes de un adjunto, para descargarlo.
   *
   * Devuelve el contenido en base64 por el mismo motivo que la subida: el
   * transporte TCP serializa a JSON y un Buffer se hincharía cuatro veces.
   */
  async getContent(dto: GetAttachmentDto) {
    const attachment = await this.prisma.taskAttachment.findUnique({
      where: { id: dto.id },
      include: { task: { select: { projectId: true } }, blob: true },
    });

    if (!attachment) {
      throw new RpcException({ statusCode: 404, message: 'Adjunto no encontrado' });
    }
    if (attachment.task.projectId !== dto.projectId) {
      throw new RpcException({ statusCode: 403, message: 'Forbidden' });
    }
    if (!attachment.blob) {
      // No debería pasar: la fila se crea con el adjunto en la misma operación.
      throw new RpcException({ statusCode: 404, message: 'El contenido no está disponible' });
    }

    return {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      /* `Buffer.from` explícito: Prisma tipa `Bytes` como `Uint8Array`, y su
         `toString()` no entiende de codificaciones. */
      content: Buffer.from(attachment.blob.data).toString('base64'),
    };
  }

  /** Lo borra quien lo subió, o quien pueda eliminar tareas. */
  async deleteAttachment(dto: DeleteAttachmentDto) {
    const attachment = await this.prisma.taskAttachment.findUnique({
      where: { id: dto.id },
      include: { task: { select: { projectId: true, boardId: true } } },
    });

    if (!attachment) {
      throw new RpcException({ statusCode: 404, message: 'Adjunto no encontrado' });
    }
    if (attachment.task.projectId !== dto.projectId) {
      throw new RpcException({ statusCode: 403, message: 'Forbidden' });
    }
    if (attachment.uploadedBy !== dto.requesterId && !dto.canModerate) {
      throw new RpcException({
        statusCode: 403,
        message: 'Solo puedes eliminar los archivos que subiste',
      });
    }

    // El blob se va en cascada por la clave foránea.
    await this.prisma.taskAttachment.delete({ where: { id: dto.id } });
    await this.invalidate(attachment.taskId, attachment.task.boardId);

    return { success: true };
  }

  private async invalidate(taskId: string, boardId: string) {
    await Promise.all([this.redis.del(`task:${taskId}`), this.redis.del(`tasks:board:${boardId}`)]);
  }

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
}
