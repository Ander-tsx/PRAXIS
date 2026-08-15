import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { BlobStorage } from './blob-storage';

/**
 * Los bytes en Postgres: una fila de `chat_attachment_blobs` por adjunto.
 *
 * Es el proveedor **por defecto** y el único activo mientras no se configure
 * GCS: la infra son Postgres y Redis, y añadir un bucket al compose solo para
 * esto no compensa en la escala actual. Los bytes viven en una fila aparte —
 * `bytea`, que Postgres saca del bloque principal vía TOAST— y solo se leen
 * en la ruta de descarga.
 *
 * ⚠️ **Idempotente a propósito**: `put` es un `upsert` sobre la clave
 * primaria, así que reintentar un guardado a medias no duplica nada.
 */
@Injectable()
export class PostgresBlobStorage implements BlobStorage {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async put(key: string, data: Buffer): Promise<void> {
    // El límite del DTO ya cortó en el gateway; aquí se vuelve a medir sobre
    // los bytes reales, como en los adjuntos de tareas.
    const max = Number(this.config.get('CHAT_ATTACHMENT_MAX_BYTES') ?? 25 * 1024 * 1024);
    if (data.length > max) {
      throw new Error(`El archivo supera el máximo de ${Math.round(max / 1024 / 1024)} MB`);
    }

    /* Prisma tipa `Bytes` como `Uint8Array<ArrayBuffer>`, y un `Buffer` es
       `Uint8Array<ArrayBufferLike>`: se convierte con copia para callar al
       compilador sin mentirle. */
    const bytes = new Uint8Array(data);

    await this.prisma.chatAttachmentBlob.upsert({
      where: { attachmentId: key },
      create: { attachmentId: key, data: bytes },
      update: { data: bytes },
    });
  }

  async get(key: string): Promise<Buffer | null> {
    const blob = await this.prisma.chatAttachmentBlob.findUnique({
      where: { attachmentId: key },
      select: { data: true },
    });
    if (!blob) return null;
    return Buffer.from(blob.data);
  }

  async delete(key: string): Promise<void> {
    await this.prisma.chatAttachmentBlob
      .deleteMany({ where: { attachmentId: key } })
      .catch(() => undefined);
  }
}
