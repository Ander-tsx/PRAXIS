import { Inject, Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import {
  ASSISTANT_ATTACHMENT_ALLOWED_MIME,
  ASSISTANT_ATTACHMENT_MAX_BYTES,
  ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE,
} from '@praxis/contracts';

import { PrismaService } from '../prisma/prisma.service';
import { BLOB_STORAGE, type BlobStorage } from '../storage/blob-storage';

/** Lo que se devuelve de un adjunto en cualquier respuesta: nunca sus bytes. */
const CAMPOS_PUBLICOS = {
  id: true,
  filename: true,
  mimeType: true,
  size: true,
} as const;

/**
 * Los archivos que se le pasan a PRAX.
 *
 * ## El patrón, y por qué es el mismo que el del chat de equipo
 *
 * El archivo **se sube antes de enviar el mensaje** y queda como borrador
 * (`messageId` nulo); el turno lo reclama con `attachmentIds`. Así se pueden
 * adjuntar varios, verlos como chips y mandarlos de una vez — si viajaran con la
 * pregunta, cada intento de enviar volvería a subir el archivo.
 *
 * 🔴 Y aquí había además un motivo que no admitía discusión: la pregunta va por
 * una **Server Action**, cuyo cuerpo está topado en 1 MB. Con el archivo dentro,
 * cualquier foto de teléfono reventaba con un «Body exceeded 1 MB limit» de
 * Next: un error sin traducir, que no dice qué archivo, y que ni siquiera
 * llegaba a nuestro código para poder explicarlo.
 *
 * ## Un borrador no tiene conversación todavía
 *
 * ⚠️ `conversationId` es nulo hasta que se reclama, no solo `messageId`. En un
 * chat recién abierto no hay conversación: exigirla obligaría a crear una vacía
 * para poder adjuntar, y la que se abandonara sin enviar nada se quedaría en el
 * historial. Lo que sí se sabe siempre es **quién sube**, y eso es lo que
 * protege el borrador — `uploadedBy` es el filtro en todas las consultas.
 *
 * ## Los bytes no están en esta tabla
 *
 * Van a `BlobStorage`, que es Postgres o GCS según `STORAGE_DRIVER`. Aquí queda
 * el hecho —nombre, tipo, tamaño, quién y de qué turno— y la clave del blob es
 * el propio id.
 */
@Injectable()
export class AttachmentsService {
  private readonly log = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BLOB_STORAGE) private readonly blobs: BlobStorage,
  ) {}

  /**
   * Sube un archivo y lo deja como borrador de quien lo sube.
   *
   * ⚠️ **El tamaño se mide sobre los bytes recibidos**, no sobre lo que declare
   * el cliente. El gateway ya lo topa en el `FileInterceptor` —así el archivo
   * enorme se corta antes de cruzar TCP— y aquí se vuelve a comprobar porque el
   * comando es alcanzable sin pasar por él.
   */
  async crear(datos: { userId: string; filename: string; mimeType: string; content: string }) {
    if (!(ASSISTANT_ATTACHMENT_ALLOWED_MIME as readonly string[]).includes(datos.mimeType)) {
      throw new RpcException({
        statusCode: 400,
        message: 'PRAX solo puede leer PDF, imágenes, texto y Markdown.',
      });
    }

    const bytes = Buffer.from(datos.content, 'base64');
    if (bytes.byteLength === 0) {
      throw new RpcException({ statusCode: 400, message: 'El archivo está vacío.' });
    }
    if (bytes.byteLength > ASSISTANT_ATTACHMENT_MAX_BYTES) {
      const mb = Math.round(ASSISTANT_ATTACHMENT_MAX_BYTES / 1024 / 1024);
      throw new RpcException({
        statusCode: 400,
        message: `«${datos.filename}» pasa de ${mb} MB.`,
      });
    }

    /**
     * ⚠️ El tope por mensaje se cuenta sobre los **borradores**, no sobre los ya
     * enviados: lo que limita es cuántos van en un turno. Una conversación de
     * veinte mensajes puede acumular sesenta archivos y eso está bien.
     */
    const borradores = await this.prisma.attachment.count({
      where: { uploadedBy: datos.userId, messageId: null },
    });
    if (borradores >= ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE) {
      throw new RpcException({
        statusCode: 400,
        message: `Solo caben ${ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE} archivos por mensaje.`,
      });
    }

    const adjunto = await this.prisma.attachment.create({
      data: {
        filename: datos.filename.slice(0, 200),
        mimeType: datos.mimeType,
        size: bytes.byteLength,
        uploadedBy: datos.userId,
      },
      select: CAMPOS_PUBLICOS,
    });

    try {
      await this.blobs.put(adjunto.id, bytes, datos.mimeType);
    } catch (error) {
      /* Sin bytes la fila sobra: dejarla daría un adjunto que se puede adjuntar
         y no se puede leer, y el fallo saldría más tarde y más lejos. */
      await this.prisma.attachment.delete({ where: { id: adjunto.id } }).catch(() => undefined);
      this.log.error(`No se pudo guardar el adjunto: ${(error as Error).message}`);
      throw new RpcException({ statusCode: 500, message: 'No se pudo guardar el archivo.' });
    }

    return adjunto;
  }

  /**
   * Descarta un borrador. Es la equis del chip, antes de enviar.
   *
   * Solo borradores propios: un adjunto ya enviado forma parte del hilo, y
   * quitarlo dejaría a PRAX citando un archivo que ya no está. Para eso está
   * borrar la conversación entera.
   */
  async descartar(userId: string, attachmentId: string) {
    const borrados = await this.prisma.attachment.deleteMany({
      where: { id: attachmentId, uploadedBy: userId, messageId: null },
    });
    if (borrados.count === 0) {
      throw new RpcException({ statusCode: 404, message: 'Archivo no encontrado' });
    }

    /* El blob después de la fila: si esto falla queda un huérfano en el bucket,
       que es basura; al revés quedaría una fila sin bytes, que es un error. */
    await this.blobs.delete(attachmentId).catch((error: Error) => {
      this.log.warn(`Adjunto ${attachmentId} borrado, su blob no: ${error.message}`);
    });

    return { id: attachmentId };
  }

  /**
   * Los adjuntos de un turno, con sus bytes en base64, listos para el modelo.
   *
   * Se llama al empezar el turno, **antes** de que exista el mensaje: por eso
   * filtra por `uploadedBy` y `messageId: null` y no por conversación. Un id
   * ajeno, o uno ya reclamado por otro turno, simplemente no sale.
   */
  async paraElTurno(userId: string, ids: string[]) {
    if (ids.length === 0) return [];

    const adjuntos = await this.prisma.attachment.findMany({
      where: { id: { in: ids }, uploadedBy: userId, messageId: null },
      select: { id: true, filename: true, mimeType: true },
      take: ASSISTANT_ATTACHMENT_MAX_PER_MESSAGE,
    });

    const conBytes = await Promise.all(
      adjuntos.map(async (adjunto) => {
        const bytes = await this.blobs.get(adjunto.id).catch(() => null);
        /* Un adjunto sin bytes no tumba el turno: se cae del prompt y PRAX
           responde a lo que sí tiene. Perder un archivo empeora la respuesta,
           perder el turno la borra. */
        if (!bytes) {
          this.log.warn(`Adjunto ${adjunto.id} sin bytes; se omite del turno`);
          return null;
        }
        return {
          id: adjunto.id,
          name: adjunto.filename,
          mime: adjunto.mimeType,
          data: bytes.toString('base64'),
        };
      }),
    );

    return conBytes.filter((adjunto): adjunto is NonNullable<typeof adjunto> => adjunto !== null);
  }

  /**
   * Ata unos borradores a su mensaje y a su conversación.
   *
   * Se llama **después** de guardar el turno: un adjunto que apuntara a un
   * mensaje que no llegó a existir sería una fila colgando. Y `messageId: null`
   * en el `where` es lo que hace la operación idempotente — reintentar no roba
   * el archivo de otro turno.
   */
  async reclamar(userId: string, conversationId: string, messageId: string, ids: string[]) {
    if (ids.length === 0) return;
    await this.prisma.attachment.updateMany({
      where: { id: { in: ids }, uploadedBy: userId, messageId: null },
      data: { conversationId, messageId },
    });
  }

  /**
   * Los bytes de un adjunto, para descargarlo o previsualizarlo.
   *
   * ⚠️ Vale tanto para un borrador propio —el compositor previsualiza la imagen
   * antes de enviarla— como para uno ya en el hilo. En los dos casos el filtro es
   * `uploadedBy`: son archivos de quien pregunta, y no hay ninguna ruta por la
   * que se compartan.
   */
  async contenido(userId: string, attachmentId: string) {
    const adjunto = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, uploadedBy: userId },
      select: CAMPOS_PUBLICOS,
    });
    const bytes = adjunto ? await this.blobs.get(adjunto.id) : null;
    if (!adjunto || !bytes) {
      /* 404 y no 403 también aquí: un 403 confirmaría que ese id existe. */
      throw new RpcException({ statusCode: 404, message: 'Archivo no encontrado' });
    }

    return { ...adjunto, content: bytes.toString('base64') };
  }
}
