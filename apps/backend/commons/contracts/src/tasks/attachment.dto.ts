import { IsBase64, IsInt, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** Tope por archivo. Una foto de móvil ronda los 3–8 MB. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Tipos que se aceptan: **solo PDF**.
 *
 * Antes eran doce —imágenes, Office, ZIP, texto plano—. Se cerró a uno por
 * decisión de producto: los adjuntos de una tarea son documentos que se leen,
 * y admitir un ZIP o un .docx obliga a descargarlos y abrirlos fuera, que es
 * justo lo contrario de lo que se quiere.
 *
 * El efecto secundario es de seguridad y viene bien: un solo tipo se puede
 * **verificar por contenido** (`empiezaPorPdf`) en vez de confiar en el
 * `Content-Type` que declara el navegador, que lo pone quien sube el archivo.
 *
 * ⚠️ Los adjuntos que ya estén guardados con otro tipo **siguen ahí**: esto
 * solo cierra la entrada. Se descargan como siempre.
 */
export const ATTACHMENT_ALLOWED_MIME = ['application/pdf'] as const;

/**
 * Los cuatro bytes con los que empieza todo PDF: `%PDF`.
 *
 * El `mimetype` de una subida lo declara el cliente en la parte multipart, así
 * que un ejecutable renombrado con `Content-Type: application/pdf` pasaba la
 * lista blanca. Con un solo tipo admitido, comprobar la firma es barato y cierra
 * ese hueco. No valida que el PDF esté bien formado —eso lo dirá el visor— sino
 * que es un PDF y no otra cosa disfrazada.
 *
 * Tipa `Uint8Array` y no `Buffer` porque este paquete no tiene los tipos de
 * Node: un `Buffer` **es** un `Uint8Array`, así que el gateway le pasa el suyo
 * sin convertir nada.
 */
export function empiezaPorPdf(contenido: Uint8Array): boolean {
  return (
    contenido.length >= 4 &&
    contenido[0] === 0x25 && // %
    contenido[1] === 0x50 && // P
    contenido[2] === 0x44 && // D
    contenido[3] === 0x46 //   F
  );
}

/**
 * Tipos que se pueden servir **en línea** en el navegador.
 *
 * ⚠️ **Servir en línea desde el mismo origen que la aplicación es lo que hay
 * que mirar aquí.** El SVG quedó fuera desde el principio por eso: es XML con
 * scripts, y en línea es XSS con todas las letras. El PDF también estaba fuera,
 * con el mismo criterio.
 *
 * Ahora sí entra, y no por relajar la regla sino porque se cierra por otro
 * lado: la respuesta en línea lleva `Content-Security-Policy: sandbox`, que
 * hace que el navegador trate ese recurso como un **origen opaco**. Un PDF con
 * JavaScript dentro se ejecuta sin acceso a las cookies ni al DOM de la
 * aplicación — que era exactamente el riesgo.
 *
 * Sin esa cabecera, esta lista no debe crecer.
 */
export const ATTACHMENT_INLINE_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
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
