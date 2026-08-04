import { Injectable } from '@nestjs/common';
import {
  type FindAdminActivityDto,
  type RecordAdminActionDto,
} from '@praxis/contracts';

import { PrismaService } from '../prisma/prisma.service';

const LIMITE_POR_DEFECTO = 25;

/**
 * El registro de acciones de administración.
 *
 * ## Dos operaciones, y no habrá una tercera
 *
 * `record` y `find`. **No hay `update` ni `delete`, y su ausencia es la
 * característica**: un registro que se puede reescribir no sirve para responder
 * «quién suspendió esta cuenta y por qué». Si algún día hace falta purgar por
 * retención de datos, tendrá que ser un proceso explícito y fuera de este
 * servicio, no un endpoint al alcance de quien queda retratado en él.
 *
 * ## Sin Redis
 *
 * A diferencia del resto de este servicio, aquí no hay caché. Las dos razones:
 * la lista se consulta con filtros que cambian en cada petición —cachear por
 * combinación de filtros es cachear nada— y una entrada recién escrita tiene que
 * aparecer al instante, porque lo normal es suspender a alguien y mirar el
 * registro para comprobar que quedó anotado.
 */
@Injectable()
export class AdminActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Anota una acción ya ejecutada.
   *
   * ⚠️ **Quien llama tiene que hacerlo después de que la acción haya salido
   * bien.** Anotar antes dejaría constancia de suspensiones que no ocurrieron, y
   * un registro con hechos falsos es peor que uno incompleto: el incompleto se
   * nota, el falso no.
   */
  async record(dto: RecordAdminActionDto) {
    return this.prisma.adminAction.create({
      data: {
        actorId: dto.actorId,
        actorLabel: dto.actorLabel ?? null,
        action: dto.action,
        targetType: dto.targetType,
        targetId: dto.targetId,
        targetLabel: dto.targetLabel ?? null,
        reason: dto.reason ?? null,
        metadata: (dto.metadata ?? null) as never,
      },
    });
  }

  /**
   * El registro, filtrado y paginado.
   *
   * Orden cronológico **descendente** y no configurable: lo que se quiere saber
   * de un registro de auditoría es qué acaba de pasar. Dejar elegir el orden
   * añadiría un índice más para un caso que nadie pide.
   */
  async find(dto: FindAdminActivityDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? LIMITE_POR_DEFECTO;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (dto.actorId) where.actorId = dto.actorId;
    if (dto.targetId) where.targetId = dto.targetId;
    if (dto.action) where.action = dto.action;
    if (dto.targetType) where.targetType = dto.targetType;

    /* `from`/`to` se combinan en un solo rango: mandar solo uno de los dos es el
       caso normal («desde ayer»), y construir el objeto condicionalmente evita
       un `gte: undefined` que Prisma interpreta como «sin filtro» solo por
       casualidad. */
    if (dto.from || dto.to) {
      const rango: { gte?: Date; lte?: Date } = {};
      if (dto.from) rango.gte = dto.from;
      if (dto.to) rango.lte = dto.to;
      where.createdAt = rango;
    }

    const [items, total] = await Promise.all([
      this.prisma.adminAction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.adminAction.count({ where }),
    ]);

    return { items, total, page, limit };
  }
}
