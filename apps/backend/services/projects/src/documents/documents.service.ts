import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import {
  type CreateDocumentDto,
  DOCUMENT_CHANGED_CODE,
  type DocumentLinkAccess,
  type DocumentRefDto,
  type DocumentRole,
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
      /* Sin `yState`: son bytes de Yjs que solo lee el tiempo real. */
      omit: { yState: true, linkToken: true },
    });
  }

  async findOne(dto: DocumentRefDto) {
    const { yState: _y, linkToken: _t, ...documento } = await this.cargar(dto.id, dto.workspaceId);
    return documento;
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
   * Renombra. **Solo el título**: el contenido se escribe por el tiempo real
   * (E4 de `docs/PLAN-DOCUMENTOS.md`), que fusiona a varios escribiendo a la
   * vez; un `PATCH` de texto se lo perdería el siguiente guardado de Yjs.
   *
   * `expectedUpdatedAt`, si viene, sigue protegiendo de pisar un renombrado
   * ajeno (D4).
   */
  async update(dto: UpdateDocumentDto) {
    await this.cargar(dto.id, dto.workspaceId);

    const { count } = await this.prisma.document.updateMany({
      where: {
        id: dto.id,
        ...(dto.expectedUpdatedAt && { updatedAt: new Date(dto.expectedUpdatedAt) }),
      },
      data: { title: dto.title.trim(), updatedBy: dto.requesterId },
    });
    if (count === 0) {
      throw new RpcException({
        statusCode: 409,
        code: DOCUMENT_CHANGED_CODE,
        message: 'Alguien cambió este documento mientras lo renombrabas. Vuelve a intentarlo.',
      });
    }

    await this.invalidarProyecto(dto.workspaceId);
    return this.findOne({ id: dto.id, workspaceId: dto.workspaceId });
  }

  /* ─── Acceso y metadatos (el gateway decide quién entra) ───────────────── */

  /**
   * Lo que el gateway necesita para decidir el acceso a un documento sin
   * pasar por el guard de proyecto (E8): de qué proyecto es, cómo se
   * comparte y la invitación de ese correo, si la hay.
   */
  async meta(id: string, email?: string | null) {
    const documento = await this.prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        workspaceId: true,
        linkAccess: true,
        linkToken: true,
        createdBy: true,
        updatedBy: true,
        createdAt: true,
        updatedAt: true,
        workspace: { select: { projectId: true, name: true } },
        invites: email
          ? { where: { email: email.toLowerCase() }, select: { role: true } }
          : false,
      },
    });
    if (!documento) {
      throw new RpcException({ statusCode: 404, message: 'Documento no encontrado' });
    }
    const { workspace, invites, ...resto } = documento;
    return {
      ...resto,
      projectId: workspace.projectId,
      workspaceName: workspace.name,
      inviteRole: (invites as { role: DocumentRole }[] | undefined)?.[0]?.role ?? null,
    };
  }

  /** Título y sitio de unos documentos: el gateway compone los de una tarea (E9). */
  async metaDeVarios(ids: string[]) {
    if (ids.length === 0) return [];
    const documentos = await this.prisma.document.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        title: true,
        workspaceId: true,
        updatedAt: true,
        workspace: { select: { projectId: true } },
      },
    });
    return documentos.map(({ workspace, ...d }) => ({ ...d, projectId: workspace.projectId }));
  }

  /* ─── Tiempo real (lo llama collab-service) ────────────────────────────── */

  /** El estado para abrir el documento: Yjs si ya lo tiene, o su Markdown. */
  async collabLoad(id: string) {
    const documento = await this.prisma.document.findUnique({
      where: { id },
      select: { yState: true, content: true, title: true },
    });
    if (!documento) {
      throw new RpcException({ statusCode: 404, message: 'Documento no encontrado' });
    }
    return {
      title: documento.title,
      content: documento.content,
      yState: documento.yState ? Buffer.from(documento.yState).toString('base64') : null,
    };
  }

  /**
   * Guarda lo que manda el tiempo real: el estado de Yjs y su copia en
   * Markdown. Y deja una versión (E5) si pasaron diez minutos desde la última
   * o cambió quién escribe.
   */
  async collabStore(dto: { id: string; yState: string; content: string; userIds: string[] }) {
    const actual = await this.prisma.document.findUnique({
      where: { id: dto.id },
      select: { id: true, title: true, content: true, workspaceId: true, updatedBy: true },
    });
    if (!actual) return { stored: false };

    const autor = dto.userIds.at(-1) ?? actual.updatedBy;
    await this.prisma.document.update({
      where: { id: dto.id },
      data: {
        yState: Buffer.from(dto.yState, 'base64'),
        content: dto.content,
        ...(dto.userIds.length > 0 && { updatedBy: autor }),
      },
    });

    if (dto.content !== actual.content) {
      const ultima = await this.prisma.documentRevision.findFirst({
        where: { documentId: dto.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, authorIds: true },
      });
      const haceDiezMinutos = Date.now() - 10 * 60_000;
      const otroAutor =
        dto.userIds.length > 0 && !dto.userIds.every((u) => ultima?.authorIds.includes(u));
      if (!ultima || ultima.createdAt.getTime() < haceDiezMinutos || otroAutor) {
        await this.prisma.documentRevision.create({
          data: {
            documentId: dto.id,
            title: actual.title,
            content: dto.content,
            authorIds: dto.userIds,
          },
        });
      }
    }
    return { stored: true };
  }

  /* ─── Compartir (E8) ───────────────────────────────────────────────────── */

  async share(id: string) {
    const documento = await this.prisma.document.findUnique({
      where: { id },
      select: {
        linkAccess: true,
        linkToken: true,
        invites: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!documento) {
      throw new RpcException({ statusCode: 404, message: 'Documento no encontrado' });
    }
    return documento;
  }

  async updateShare(dto: { id: string; linkAccess?: DocumentLinkAccess; regenerateLink?: boolean }) {
    const actual = await this.prisma.document.findUnique({
      where: { id: dto.id },
      select: { linkToken: true },
    });
    if (!actual) {
      throw new RpcException({ statusCode: 404, message: 'Documento no encontrado' });
    }
    /* El enlace existe desde que se comparte por primera vez, y un enlace nuevo
       es la única forma de revocar el que ya circula. */
    const necesitaToken = !actual.linkToken || dto.regenerateLink;
    await this.prisma.document.update({
      where: { id: dto.id },
      data: {
        ...(dto.linkAccess && { linkAccess: dto.linkAccess }),
        ...(necesitaToken && { linkToken: randomBytes(24).toString('base64url') }),
      },
    });
    return this.share(dto.id);
  }

  async invite(dto: { documentId: string; email: string; role: DocumentRole; invitedBy: string }) {
    const email = dto.email.trim().toLowerCase();
    return this.prisma.documentInvite.upsert({
      where: { documentId_email: { documentId: dto.documentId, email } },
      create: { documentId: dto.documentId, email, role: dto.role, invitedBy: dto.invitedBy },
      update: { role: dto.role },
    });
  }

  async uninvite(dto: { documentId: string; inviteId: string }) {
    await this.prisma.documentInvite.deleteMany({
      where: { id: dto.inviteId, documentId: dto.documentId },
    });
    return { success: true };
  }

  /** Los documentos compartidos con un correo: la lista «Compartidos conmigo». */
  async sharedWith(email: string) {
    const invitaciones = await this.prisma.documentInvite.findMany({
      where: { email: email.toLowerCase() },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        role: true,
        document: { select: { id: true, title: true, updatedAt: true } },
      },
    });
    return invitaciones.map((i) => ({ ...i.document, role: i.role }));
  }

  /* ─── Imágenes (E6) ────────────────────────────────────────────────────── */

  async createAsset(dto: {
    documentId: string;
    filename: string;
    mimeType: string;
    size: number;
    content: string;
    uploadedBy: string;
  }) {
    const asset = await this.prisma.documentAsset.create({
      data: {
        documentId: dto.documentId,
        filename: dto.filename,
        mimeType: dto.mimeType,
        size: dto.size,
        uploadedBy: dto.uploadedBy,
        blob: { create: { data: Buffer.from(dto.content, 'base64') } },
      },
      select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
    });
    return asset;
  }

  async assetContent(dto: { documentId: string; assetId: string }) {
    const asset = await this.prisma.documentAsset.findUnique({
      where: { id: dto.assetId },
      select: { documentId: true, mimeType: true, blob: { select: { data: true } } },
    });
    if (!asset || asset.documentId !== dto.documentId || !asset.blob) {
      throw new RpcException({ statusCode: 404, message: 'Imagen no encontrada' });
    }
    return { mimeType: asset.mimeType, content: Buffer.from(asset.blob.data).toString('base64') };
  }

  /** Lo que ocupan las imágenes de unos proyectos: entra en el almacén de la organización. */
  async assetBytesOfProjects(projectIds: string[]) {
    if (projectIds.length === 0) return 0;
    const { _sum } = await this.prisma.documentAsset.aggregate({
      where: { document: { workspace: { projectId: { in: projectIds } } } },
      _sum: { size: true },
    });
    return _sum.size ?? 0;
  }

  /* ─── Versiones (E5) ───────────────────────────────────────────────────── */

  async revisions(documentId: string) {
    return this.prisma.documentRevision.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, title: true, authorIds: true, createdAt: true },
    });
  }

  async revision(dto: { documentId: string; revisionId: string }) {
    const revision = await this.prisma.documentRevision.findUnique({
      where: { id: dto.revisionId },
    });
    if (!revision || revision.documentId !== dto.documentId) {
      throw new RpcException({ statusCode: 404, message: 'Versión no encontrada' });
    }
    return revision;
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
