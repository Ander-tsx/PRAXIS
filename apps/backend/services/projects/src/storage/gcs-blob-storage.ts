import type { Storage } from '@google-cloud/storage';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BlobStorage } from './blob-storage';

/**
 * Los bytes en Google Cloud Storage.
 *
 * Es el proveedor **escrito pero inactivo**: el código está completo y listo
 * para activarse cuando haya bucket y credenciales, pero hoy **no se usa** —
 * `BlobStorageModule` solo lo elige cuando `STORAGE_DRIVER=gcs`, y en
 * desarrollo (y en CI) no está configurado.
 *
 * ⚠️ **No está probado contra un bucket real.** Se construyó sin conexión
 * (PENDIENTES-BACKEND §…), así que conviene revisarlo al conectarlo: el
 * contrato de `@google-cloud/storage` no cambia, pero la firma de los métodos
 * puede haber derivado.
 *
 * ## Por qué existe si no se usa
 *
 * El chat comparte vídeo, y el vídeo es justo lo que no debe vivir en Postgres
 * cuando escale. Esta clase es la otra punta de `BlobStorage`: el día que se
 * active, el resto del código no cambia ni una línea —el servicio de adjuntos
 * sigue llamando a `put`/`get`/`delete` sobre la misma interfaz.
 *
 * ## El arranque
 *
 * `@google-cloud/storage` se instancia con las credenciales de la aplicación
 * (ADC) o con el proyecto y el bucket de configuración. No se llama desde el
 * constructor de Nest porque crearlo con `useFactory` lo deja inyectable igual
 * y permite fallar con un mensaje claro si falta la configuración.
 */
@Injectable()
export class GcsBlobStorage implements BlobStorage {
  private readonly logger = new Logger(GcsBlobStorage.name);
  private readonly bucket: Storage['bucket'] extends (...args: unknown[]) => infer B ? B : never;

  constructor(config: ConfigService) {
    const projectId = config.get<string>('GCS_PROJECT_ID');
    const bucketName = config.get<string>('GCS_BUCKET');
    if (!projectId || !bucketName) {
      // No puede ocurrir en la práctica: el módulo solo elige este proveedor
      // cuando STORAGE_DRIVER=gcs, que exige ambas variables. Pero un error
      // claro aquí es mejor que un TypeError en mitad de una subida.
      throw new Error('GCS requiere GCS_PROJECT_ID y GCS_BUCKET');
    }

    // Import dinámico: el paquete es una dependencia opcional que solo hace
    // falta cuando este proveedor se activa. Cargarlo en frío siempre pagaría
    // el arranque de toda la SDK aunque nunca se usara.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Storage: GcsStorage } = require('@google-cloud/storage') as {
      Storage: typeof import('@google-cloud/storage').Storage;
    };
    const client = new GcsStorage({ projectId });
    this.bucket = client.bucket(bucketName);
    void this.logger.warn('Almacenamiento en GCS activado; verificar contra un bucket real');
  }

  private claveEnBucket(key: string): string {
    return `chat/${key}`;
  }

  async put(key: string, data: Buffer): Promise<void> {
    await this.bucket.file(this.claveEnBucket(key)).save(data, {
      // El tipo del contenido lo usa GCS para servir el objeto y para el CORS;
      // el `Content-Disposition` real lo pone el gateway al descargar.
      contentType: 'application/octet-stream',
      // Sobrescribe si ya existe: un reintento no debe duplicar ni fallar.
      resumable: false,
    });
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const [data] = await this.bucket.file(this.claveEnBucket(key)).download();
      return Buffer.from(data);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.bucket
      .file(this.claveEnBucket(key))
      .delete({ ignoreNotFound: true })
      .catch(() => undefined);
  }
}
