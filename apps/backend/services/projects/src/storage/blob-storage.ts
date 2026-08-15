/**
 * Dónde viven los bytes de un adjunto de chat.
 *
 * ## Por qué una interfaz y no una tabla
 *
 * La primera versión guarda los bytes en Postgres —en `ChatAttachmentBlob`,
 * como ya hacen los adjuntos de tareas— porque la infra son Postgres y Redis.
 * Pero el chat comparte **vídeo**, que es lo que de verdad pesa, y el sitio
 * natural para eso es un almacenamiento de objetos: Google Cloud Storage, que
 * ya se usa en el despliegue (ver docs/TERRAFORM-GCP.md).
 *
 * La interfaz es lo que permite migrar de uno a otro **sin tocar nada más**:
 * el servicio de adjuntos conoce `BlobStorage`, no sabe ni le importa si el
 * archivo está en un `bytea` o en un bucket. La selección del proveedor vive
 * en `BlobStorageModule`, que mira `STORAGE_DRIVER`.
 *
 * ## La clave
 *
 * Es el id del adjunto (un UUID), sin rutas ni prefijos de zona: el proveedor
 * decide dónde colgar eso. GCS lo guarda como `chat/<id>`; Postgres como fila
 * de `chat_attachment_blobs`. Quien llama no ve ninguna de las dos cosas.
 */
export interface BlobStorage {
  /**
   * Guarda los bytes.
   *
   * ⚠️ Debe ser **idempotente**: el servicio puede reintentar si el guardado
   * falla a medias, y un segundo `put` sobre la misma clave no puede crear un
   * duplicado —en Postgres es un `upsert` sobre la clave primaria, en GCS
   * sobrescribe el objeto.
   */
  put(key: string, data: Buffer, mimeType: string): Promise<void>;

  /** Devuelve los bytes, o `null` si la clave no existe. */
  get(key: string): Promise<Buffer | null>;

  /** Borra los bytes. No es un error borrar algo que no existe. */
  delete(key: string): Promise<void>;
}

/**
 * Token de inyección del proveedor activo.
 *
 * Se usa en vez de la clase concreta porque la implementación se elige en
 * tiempo de arranque según `STORAGE_DRIVER`; el resto de servicios inyectan
 * este token y reciben el que toque.
 */
export const BLOB_STORAGE = Symbol('BLOB_STORAGE');
