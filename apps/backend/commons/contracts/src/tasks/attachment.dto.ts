import { IsBase64, IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** Tope por archivo. Una foto de móvil ronda los 3–8 MB. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Tipos que se aceptan.
 *
 * Lista blanca, no negra: una lista negra siempre se queda corta.
 */
export const ATTACHMENT_ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

/**
 * Tipos que se pueden servir **en línea** en el navegador.
 *
 * Solo imágenes rasterizadas. Todo lo demás va como descarga forzada, y el SVG
 * queda fuera a propósito: es XML con scripts, y servirlo en línea desde el
 * mismo origen que la aplicación es XSS con todas las letras. El PDF también se
 * descarga: los visores integrados han tenido su propia historia de agujeros.
 */
export const ATTACHMENT_INLINE_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export function isInlineMime(mimeType: string): boolean {
  return (ATTACHMENT_INLINE_MIME as readonly string[]).includes(mimeType);
}

/**
 * Payload al microservicio.
 *
 * ⚠️ Los bytes viajan en **base64**, no como `Buffer`. El transporte TCP de
 * Nest serializa a JSON, y ahí un Buffer se convierte en
 * `{"type":"Buffer","data":[137,80,…]}` —hasta cuatro caracteres por byte—, así
 * que 10 MB se irían por encima de 40 MB de cable y de memoria. En base64 son
 * 13,3 MB.
 */
export class CreateAttachmentDto {
  @IsUUID('4')
  taskId: string;

  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;

  @IsString()
  @MaxLength(255)
  filename: string;

  @IsString()
  @MaxLength(120)
  mimeType: string;

  /** Tamaño real medido por el gateway sobre los bytes recibidos. */
  @IsInt()
  @Min(1)
  @Max(ATTACHMENT_MAX_BYTES)
  size: number;

  @IsBase64()
  content: string;
}

export class FindAttachmentsDto {
  @IsUUID('4')
  taskId: string;

  @IsUUID('4')
  projectId: string;
}

export class GetAttachmentDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  projectId: string;
}

export class DeleteAttachmentDto {
  @IsUUID('4')
  id: string;

  @IsUUID('4')
  projectId: string;

  @IsUUID('4')
  requesterId: string;

  /** Igual que en comentarios: lo resuelve el gateway. */
  canModerate: boolean;
}
