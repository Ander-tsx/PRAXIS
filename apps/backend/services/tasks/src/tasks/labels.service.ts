import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

import { CreateLabelDto, DeleteLabelDto, FindLabelsDto, UpdateLabelDto } from '@praxis/contracts';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const LABELS_TTL = 300; // 5 min

/**
 * Etiquetas de proyecto.
 *
 * Van aparte de `TasksService` porque no cuelgan de una tarea: son del
 * proyecto, se reutilizan entre tableros y se gestionan por su cuenta.
 *
 * Los permisos los comprueba el gateway con `ProjectPermissionGuard`; aquí no
 * se repiten porque, a diferencia de las tareas, el `projectId` de la ruta **es**
 * el recurso, no algo que haya que verificar contra otra fila.
 */
@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private cacheKey(projectId: string) {
    return `labels:project:${projectId}`;
  }

  async findLabels(dto: FindLabelsDto) {
    const key = this.cacheKey(dto.projectId);
    const cached = await this.redis.get(key);
    if (cached) return cached;

    const labels = await this.prisma.label.findMany({
      where: { projectId: dto.projectId },
      orderBy: { createdAt: 'asc' },
    });

    await this.redis.set(key, labels, LABELS_TTL);
    return labels;
  }

  async createLabel(dto: CreateLabelDto) {
    try {
      const label = await this.prisma.label.create({
        data: { projectId: dto.projectId, name: dto.name, color: dto.color },
      });
      await this.invalidate(dto.projectId);
      return label;
    } catch (error) {
      // P2002: ya existe una etiqueta con ese nombre en el proyecto. Sin este
      // caso salía un 500 que no decía nada.
      if (isUniqueViolation(error)) {
        throw new RpcException({
          statusCode: 409,
          message: `Ya existe una etiqueta «${dto.name}» en este proyecto`,
        });
      }
      throw error;
    }
  }

  async updateLabel(dto: UpdateLabelDto) {
    const label = await this.loadInProject(dto.id, dto.projectId);

    try {
      const updated = await this.prisma.label.update({
        where: { id: label.id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.color !== undefined && { color: dto.color }),
        },
      });
      await this.invalidate(dto.projectId);
      // El nombre y el color se pintan en las tarjetas, y esas salen del
      // listado cacheado del tablero: sin esto, renombrar una etiqueta no se
      // vería hasta que caducara el minuto de caché.
      await this.invalidateTasksWithLabel(label.id);
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RpcException({
          statusCode: 409,
          message: `Ya existe una etiqueta «${dto.name}» en este proyecto`,
        });
      }
      throw error;
    }
  }

  /**
   * Elimina una etiqueta.
   *
   * `TaskLabel` cascadea, así que desaparece de las tareas que la llevaban. Es
   * lo que se espera al borrar una etiqueta, pero conviene que quien llama lo
   * advierta antes.
   */
  async deleteLabel(dto: DeleteLabelDto) {
    const label = await this.loadInProject(dto.id, dto.projectId);

    // Se cuentan y se invalidan **antes** de borrar: después la relación ya no
    // existe y no habría forma de saber qué tableros repintar.
    const usos = await this.prisma.taskLabel.count({ where: { labelId: label.id } });
    await this.invalidateTasksWithLabel(label.id);

    await this.prisma.label.delete({ where: { id: label.id } });
    await this.invalidate(dto.projectId);

    // Cuántas tareas la llevaban: la interfaz lo usa para decir qué pasó.
    return { success: true, removedFrom: usos };
  }

  /** Invalida la caché de las tareas que llevan una etiqueta, y de sus tableros. */
  private async invalidateTasksWithLabel(labelId: string) {
    const rows = await this.prisma.taskLabel.findMany({
      where: { labelId },
      select: { task: { select: { id: true, boardId: true } } },
    });
    if (rows.length === 0) return;

    const boardIds = [...new Set(rows.map((row) => row.task.boardId))];
    await Promise.all([
      ...rows.map((row) => this.redis.del(`task:${row.task.id}`)),
      ...boardIds.map((id) => this.redis.delByPrefix(`tasks:board:${id}`)),
    ]);
  }

  /** Comprueba que la etiqueta es del proyecto de la ruta. */
  private async loadInProject(id: string, projectId: string) {
    const label = await this.prisma.label.findUnique({ where: { id } });
    if (!label) {
      throw new RpcException({ statusCode: 404, message: 'Etiqueta no encontrada' });
    }
    if (label.projectId !== projectId) {
      throw new RpcException({ statusCode: 403, message: 'Forbidden' });
    }
    return label;
  }

  private async invalidate(projectId: string) {
    await this.redis.del(this.cacheKey(projectId));
  }
}

/** P2002 de Prisma: violación de restricción única. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}
