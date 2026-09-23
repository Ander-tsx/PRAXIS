import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import {
  type CreateDocumentDto,
  DOCUMENT_CHANGED_CODE,
  type DocumentRefDto,
  type UpdateDocumentDto,
} from '@praxis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Documentos de un espacio (`docs/PLAN-DOCUMENTOS.md`).
 *
 * El árbol del proyecto (`project:<id>`, cinco minutos en Redis) trae la lista
 * de documentos **sin contenido**, para pintar las pestañas; crear, renombrar
 * y borrar tienen que invalidarlo o la pestaña no aparece hasta que caduque —
 * el mismo fallo que ya mordió con tableros y columnas.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findByWorkspace(workspaceId: string) {
    return this.prisma.document.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(dto: DocumentRefDto) {
    return this.cargar(dto.id, dto.workspaceId);
  }

  async create(dto: CreateDocumentDto) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: dto.workspaceId } });
    if (!workspace) {
      throw new RpcException({ statusCode: 404, message: 'Espacio no encontrado' });
    }
    if (workspace.kind !== 'DOCUMENTS') {
      throw new RpcException({
        statusCode: 400,
        message: 'Este espacio es de tableros: los documentos van en un espacio de documentos.',
      });
    }
    const documento = await this.prisma.document.create({
      data: {
        workspaceId: dto.workspaceId,
        title: dto.title.trim(),
        content: dto.content ?? '',
        createdBy: dto.requesterId,
        updatedBy: dto.requesterId,
      },
    });
    await this.redis.del(`project:${workspace.projectId}`);
    return documento;
  }

  /**
   * Guarda solo si nadie lo cambió desde que se abrió (D4).
   *
   * La comprobación va **dentro** del `updateMany` —`where` con el `updatedAt`
   * esperado— y no en una lectura previa: entre leer y escribir cabe otro
   * guardado, y entonces el segundo pisaría al primero sin enterarse.
   */
  async update(dto: UpdateDocumentDto) {
    if (dto.title === undefined && dto.content === undefined) {
      throw new RpcException({ statusCode: 400, message: 'No hay nada que guardar' });
    }
    const actual = await this.cargar(dto.id, dto.workspaceId);

    const { count } = await this.prisma.document.updateMany({
      where: { id: dto.id, updatedAt: new Date(dto.expectedUpdatedAt) },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.content !== undefined && { content: dto.content }),
        updatedBy: dto.requesterId,
      },
    });
    if (count === 0) {
      throw new RpcException({
        statusCode: 409,
        code: DOCUMENT_CHANGED_CODE,
        message:
          'Alguien guardó este documento mientras lo editabas. Copia lo tuyo y recarga para ver su versión.',
      });
    }

    if (dto.title !== undefined && dto.title.trim() !== actual.title) {
      await this.invalidarProyecto(dto.workspaceId);
    }
    return this.cargar(dto.id, dto.workspaceId);
  }

  async remove(dto: DocumentRefDto) {
    await this.cargar(dto.id, dto.workspaceId);
    await this.prisma.document.delete({ where: { id: dto.id } });
    await this.invalidarProyecto(dto.workspaceId);
    return { success: true };
  }

  /**
   * El documento, comprobando que es de ese espacio.
   *
   * El guard del gateway resuelve el proyecto por el `:workspaceId` de la ruta;
   * sin esta comprobación, un `:documentId` de otro proyecto pasaría con
   * permiso sobre el propio. Es el agujero del `projectId` del cuerpo
   * (`PENDIENTES-BACKEND.md §9`) en otra forma.
   */
  private async cargar(id: string, workspaceId: string) {
    const documento = await this.prisma.document.findUnique({ where: { id } });
    if (!documento || documento.workspaceId !== workspaceId) {
      throw new RpcException({ statusCode: 404, message: 'Documento no encontrado' });
    }
    return documento;
  }

  private async invalidarProyecto(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { projectId: true },
    });
    if (workspace) await this.redis.del(`project:${workspace.projectId}`);
  }
}
