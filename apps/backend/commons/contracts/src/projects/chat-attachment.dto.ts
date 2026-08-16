import {
  IsBase64,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Tope por archivo en el chat.
 *
 * El doble que el de tareas: ahí es 10 MB y aquí **no puede ser el mismo**.
 * Un vídeo en calidad de móvil ronda los 15–40 MB, y el chat es justo el sitio
 * donde se comparten — imágenes de capturas, grabaciones de la reunión, el
 * contrato escaneado. Se queda en 25 para que el vídeo quepa entero sin
 * obligar a recortarlo antes de mandarlo, y porque el proveedor de almacenamiento
 * (GCS cuando se conecte) aguanta sin problema; en Postgres hoy también va
 * sobrado con estos volúmenes de uso.
 */
export const CHAT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

/** Cuántos archivos puede llevar un solo mensaje. */
export const CHAT_ATTACHMENT_MAX_PER_MESSAGE = 5;

/**
 * Tipos que se aceptan en el chat.
 *
 * Es la lista de doce que ya usaba el adjunto de tareas —imágenes, PDF, texto
 * plano, CSV, ZIP, Word y Excel— **más el vídeo** (MP4 y WebM), que es lo que
 * pide el caso de uso del chat: compartir una grabación de reunión o una
 * demostración sin tener que pasar por fuera.
 *
 * El SVG **no entra**, por el mismo motivo que en tareas: es XML con scripts,
 * y servirlo desde el mismo origen que la aplicación es XSS con todas las
 * letras.
 */
export const CHAT_ATTACHMENT_ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'text/plain',
  'text/csv',
  /* ⚠️ **Markdown va con sus dos tipos, y no sobra ninguno.** Chrome declara
     un `.md` como `text/markdown`, pero Safari y algunos Linux lo mandan como
     `text/x-markdown`, y hay sistemas donde llega vacío —ahí no hay nada que
     hacer desde aquí—. Con solo el primero, el mismo archivo entraba en un
     navegador y lo rechazaba otro. */
  'text/markdown',
  'text/x-markdown',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

/**
 * Tipos que se sirven **en línea** en el navegador.
 *
 * Igual que en tareas: solo lo que se puede pintar sin ejecutar nada —la
 * imagen y el vídeo van en un `<img>` / `<video>` que no corre scripts— y el
 * PDF, que entra con `Content-Security-Policy: sandbox` (ver
 * `ATTACHMENT_INLINE_MIME` de tareas). Todo lo demás sale como descarga.
 */
export const CHAT_ATTACHMENT_INLINE_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'application/pdf',
] as const;

/** ¿Se sirve en línea (se puede pintar) o toca descargar? */
export function isChatAttachmentInlineMime(mimeType: string): boolean {
  return (CHAT_ATTACHMENT_INLINE_MIME as readonly string[]).includes(mimeType);
}

/**
 * Firma de los primeros bytes que distingue cada tipo binario.
 *
 * No valida que el archivo esté bien formado —eso lo dirá el visor o el
 * reproductor— sino que **es** lo que dice ser y no otra cosa disfrazada con
 * el `Content-Type` puesto a mano. El texto (CSV y plano) no tiene firma: se
 * comprueba que no arranque con los bytes de un binario conocido, que es lo
 * que cierra el hueco sin inventar una heurística.
 */
export function validarFirmaChatAdjunto(mimeType: string, contenido: Uint8Array): boolean {
  if (mimeType === 'image/png')
    return empiezaPor(contenido, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mimeType === 'image/jpeg') return empiezaPor(contenido, [0xff, 0xd8, 0xff]);
  if (mimeType === 'image/gif') return empiezaPor(contenido, [0x47, 0x49, 0x46, 0x38]);
  // WebP: caja RIFF que empieza con «RIFF» y declara el formato en el byte 8.
  if (mimeType === 'image/webp') {
    return (
      empiezaPor(contenido, [0x52, 0x49, 0x46, 0x46]) &&
      empiezaPor(contenido, [0x57, 0x45, 0x42, 0x50], 8)
    );
  }
  if (mimeType === 'video/mp4') return empiezaPor(contenido, [0x66, 0x74, 0x79, 0x70], 4);
  // WebM: cabecera EBML con la que arranca toda Matroska/WebM.
  if (mimeType === 'video/webm') return empiezaPor(contenido, [0x1a, 0x45, 0xdf, 0xa3]);
  if (mimeType === 'application/pdf') return empiezaPor(contenido, [0x25, 0x50, 0x44, 0x46]);
  // ZIP y los Office modernos (docx/xlsx) son contenedores ZIP.
  if (esZipOffice(mimeType)) return empiezaPor(contenido, [0x50, 0x4b, 0x03, 0x04]);
  // Word/Excel viejos: compuestos OLE, que empiezan con esta firma.
  if (mimeType === 'application/msword' || mimeType === 'application/vnd.ms-excel') {
    return empiezaPor(contenido, [0xd0, 0xcf, 0x11, 0xe0]);
  }
  /* Markdown es texto: mismo trato que el plano y el CSV. Sin esto caía al
     `return false` del final y un `.md` se rechazaba con «no es lo que parece
     por el nombre» aunque su tipo estuviera en la lista blanca. */
  if (esTextoPlano(mimeType)) return esTexto(contenido);

  return false;
}

/** ¿Este tipo es texto sin firma binaria que comprobar? */
function esTextoPlano(mimeType: string): boolean {
  return (
    mimeType === 'text/plain' ||
    mimeType === 'text/csv' ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/x-markdown'
  );
}

/** ¿Este tipo se guarda como ZIP? */
function esZipOffice(mimeType: string): boolean {
  return (
    mimeType === 'application/zip' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

/** ¿Empieza el contenido por estos bytes exactos, a partir de `offset`? */
function empiezaPor(contenido: Uint8Array, firma: number[], offset = 0): boolean {
  if (contenido.length < offset + firma.length) return false;
  for (let i = 0; i < firma.length; i++) {
    if (contenido[offset + i] !== firma[i]) return false;
  }
  return true;
}

/**
 * Heurística de «esto parece texto».
 *
 * Solo se mira el arranque, que es donde se detectaría un binario disfrazado:
 * los primeros 512 bytes sin ceros y con la mayoría de bytes imprimibles. No
 * es infalible —un binario que empiece benigno y se vuelva basura en el medio
 * pasaría— pero el texto se sirve siempre como descarga y con `nosniff`, así
 * que el peor caso es descargar un archivo raro, no ejecutar nada.
 */
function esTexto(contenido: Uint8Array): boolean {
  const n = Math.min(contenido.length, 512);
  if (n === 0) return false;
  let imprimibles = 0;
  for (let i = 0; i < n; i++) {
    const byte = contenido[i] as number;
    if (byte === 0) return false;
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127) || byte >= 160) {
      imprimibles++;
    }
  }
  return imprimibles / n > 0.9;
}

/**
 * Payload de creación de un adjunto de chat, al microservicio.
 *
 * ⚠️ Lleva **ambos** contextos opcionales (`projectId` para el chat de
 * proyecto, `peerId` para el privado) y el servicio resuelve el canal según
 * cuál venga, igual que los comandos `chat_project_*` / `chat_direct_*`. El
 * gateway los rellena desde la ruta, nunca desde el cuerpo.
 */
export class CreateChatAttachmentDto {
  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @IsUUID('4')
  peerId?: string;

  @IsUUID('4')
  requesterId: string;

  @IsString()
  @MaxLength(255)
  filename: string;

  @IsIn(CHAT_ATTACHMENT_ALLOWED_MIME as unknown as string[])
  mimeType: string;

  /** Tamaño real medido por el gateway sobre los bytes recibidos. */
  @IsInt()
  @Min(1)
  @Max(CHAT_ATTACHMENT_MAX_BYTES)
  size: number;

  @IsBase64()
  content: string;
}

/** Lectura de los bytes de un adjunto. */
export class GetChatAttachmentContentDto {
  @IsUUID('4')
  id: string;

  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @IsUUID('4')
  peerId?: string;

  /** Quién lo pide, para resolver el canal privado y comprobar acceso. */
  @IsUUID('4')
  requesterId: string;
}

/** Borrado de un adjunto de chat. */
export class DeleteChatAttachmentDto {
  @IsUUID('4')
  id: string;

  @IsOptional()
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @IsUUID('4')
  peerId?: string;

  @IsUUID('4')
  requesterId: string;

  /** Igual que en mensajes: lo resuelve el gateway. */
  @IsBoolean()
  canModerate: boolean;
}

/** Metadatos de un adjunto de chat, lo que se devuelve en los listados. */
export class ChatAttachmentDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  channelId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename: string;

  @IsString()
  @MaxLength(120)
  mimeType: string;

  @IsInt()
  @Min(1)
  size: number;

  @IsUUID('4')
  uploadedBy: string;

  createdAt: Date;
}
