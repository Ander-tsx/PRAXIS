import { Inject, Injectable } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_PER_MESSAGE,
  CreateChatAttachmentDto,
  DeleteChatAttachmentDto,
  GetChatAttachmentContentDto,
} from '@praxis/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { BLOB_STORAGE, type BlobStorage } from '../storage/blob-storage';
import { ChannelsService } from './channels.service';

/** Lo que se devuelve de un adjunto: todo menos los bytes. */
const METADATA = {
  id: true,
  channelId: true,
  messageId: true,
  filename: true,
  mimeType: true,
  size: true,
  uploadedBy: true,
  createdAt: true,
} as const;

/**
 * Adjuntos de chat.
 *
 * ## El flujo: se suben antes de enviar, como borradores
 *
 * El archivo viaja por su propia ruta y queda con `messageId` nulo; al enviar
 * el mensaje, los `attachmentIds` del cuerpo lo reclaman. Así el redactor
 * puede adjuntar varios, verlos como chips y mandarlos todos de una vez — si
 * tuviera que ir con el mensaje, cada intento de enviar subiría el archivo de
 * nuevo.
 *
 * ## Los bytes van al proveedor activo
 *
 * `BlobStorage` (Postgres hoy, GCS mañana) es quien guarda el contenido; aquí
 * solo se toca la tabla de metadatos. La descarga vuelve a pasar por el
 * proveedor, así que quien consume la API no sabe dónde está el archivo.
 *
 * ⚠️ El `channelId` ya llega **resuelto y autorizado**: el gateway aplica el
 * permiso del proyecto, y el privado pasa por `ChannelsService.directo`. Este
 * servicio no vuelve a preguntarse quién puede estar en el canal.
 */
@Injectable()
export class ChatAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    @Inject(BLOB_STORAGE) private readonly storage: BlobStorage,
  ) {}

  /**
   * Sube un adjunto y lo deja en borrador.
   *
   * La comprobación de tamaño se repite aquí sobre los bytes ya decodificados,
   * no sobre lo que declarara nadie: el gateway ya midió, pero este servicio no
   * puede fiarse de su llamante — mismo criterio que en los adjuntos de tareas.
   */
  async create(dto: CreateChatAttachmentDto) {
    const canal = await this.resolveCanal(dto);
    const data = Buffer.from(dto.content, 'base64');

    if (data.length === 0) {
      throw new RpcException({ statusCode: 400, message: 'El archivo está vacío' });
    }
    if (data.length > CHAT_ATTACHMENT_MAX_BYTES) {
      throw new RpcException({
        statusCode: 413,
        message: `El archivo supera el máximo de ${Math.round(CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB`,
      });
    }

    const adjunto = await this.prisma.chatAttachment.create({
      data: {
        channelId: canal.id,
        /* messageId nulo: es un borrador hasta que un mensaje lo reclame. */
        filename: dto.filename,
        mimeType: dto.mimeType,
        size: data.length,
        uploadedBy: dto.requesterId,
      },
      select: METADATA,
    });

    /* El bytes van al proveedor. Si falla, el metadato queda huérfano y se
       limpia: el borrador no debe sobrevivir a un guardado roto. */
    try {
      await this.storage.put(adjunto.id, data, dto.mimeType);
    } catch {
      await this.prisma.chatAttachment.delete({ where: { id: adjunto.id } }).catch(() => undefined);
      throw new RpcException({
        statusCode: 503,
        message: 'No se pudo guardar el archivo. Inténtalo de nuevo.',
      });
    }

    return adjunto;
  }

  /**
   * Los bytes de un adjunto, para descargarlo.
   *
   * Devuelve el contenido en base64 por el mismo motivo que la subida: el
   * transporte TCP serializa a JSON y un Buffer se hincharía cuatro veces.
   */
  async getContent(dto: GetChatAttachmentContentDto) {
    const adjunto = await this.findOwned(dto);
    const data = await this.storage.get(adjunto.id);
    if (!data) {
      throw new RpcException({ statusCode: 404, message: 'El contenido no está disponible' });
    }

    return {
      filename: adjunto.filename,
      mimeType: adjunto.mimeType,
      size: adjunto.size,
      content: data.toString('base64'),
    };
  }

  /** Borra un adjunto: el borrador de quien lo subió, o cualquier uno si modera. */
  async delete(dto: DeleteChatAttachmentDto) {
    const adjunto = await this.findOwned(dto);
    if (adjunto.uploadedBy !== dto.requesterId && !dto.canModerate) {
      throw new RpcException({
        statusCode: 403,
        message: 'Solo puedes eliminar los archivos que subiste',
      });
    }

    /* El blob se va por el proveedor y el metadato por la base. Un borrador
       (messageId nulo) se borra igual: es justo lo que limpia el chip de
       «quitar» antes de enviar. */
    await this.prisma.chatAttachment.delete({ where: { id: adjunto.id } });
    await this.storage.delete(adjunto.id).catch(() => undefined);

    return { id: adjunto.id, deleted: true };
  }

  /**
   * Reclama los borradores y los ata al mensaje recién creado.
   *
   * La llama `ChatService.send` después de crear el mensaje. Comprueba **aquí**
   * —y no en el `create` del mensaje— que cada id sea de este canal, de quien
   * escribe y que siga sin dueño: el hueco entre subir y enviar es donde se
   * colaría un id de otra conversación o un adjunto ya usado.
   */
  async claim(messageId: string, channelId: string, requesterId: string, ids: string[]) {
    if (ids.length > CHAT_ATTACHMENT_MAX_PER_MESSAGE) {
      throw new RpcException({
        statusCode: 400,
        message: `Un mensaje no puede llevar más de ${CHAT_ATTACHMENT_MAX_PER_MESSAGE} archivos`,
      });
    }

    const hallados = await this.prisma.chatAttachment.findMany({
      where: { id: { in: ids }, channelId, messageId: null, uploadedBy: requesterId },
      select: { id: true },
    });

    /* Todos o ninguno: si alguno no es de quien envía, o ya tiene mensaje, el
       mensaje entero se rechaza y el archivo se queda en borrador — que es lo
       que permite al cliente recuperar el estado sin enviar a medias. */
    if (hallados.length !== ids.length) {
      throw new RpcException({
        statusCode: 400,
        message: 'Alguno de los archivos ya no está disponible para enviar.',
      });
    }

    await this.prisma.chatAttachment.updateMany({
      where: { id: { in: ids } },
      data: { messageId },
    });
  }

  /** Busca un adjunto comprobando que está en el canal que corresponde. */
  private async findOwned(dto: GetChatAttachmentContentDto | DeleteChatAttachmentDto) {
    const canal = await this.resolveCanal(dto);
    const adjunto = await this.prisma.chatAttachment.findFirst({
      where: { id: dto.id, channelId: canal.id },
      select: METADATA,
    });

    if (!adjunto) {
      /* 404 y no 403: confirmar que un adjunto de otra conversación existe ya
         sería filtrar que esa conversación existe. */
      throw new RpcException({ statusCode: 404, message: 'Adjunto no encontrado' });
    }
    return adjunto;
  }

  /** Resuelve el canal según el contexto que traiga el payload. */
  private async resolveCanal(dto: {
    projectId?: string;
    peerId?: string;
    requesterId: string;
  }) {
    if (dto.projectId) return this.channels.deProyecto(dto.projectId);
    if (dto.peerId) return this.channels.directo(dto.requesterId, dto.peerId);
    throw new RpcException({ statusCode: 400, message: 'Falta el contexto del canal' });
  }
}
