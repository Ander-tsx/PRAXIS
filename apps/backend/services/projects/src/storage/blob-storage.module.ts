import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { BLOB_STORAGE } from './blob-storage';
import { GcsBlobStorage } from './gcs-blob-storage';
import { PostgresBlobStorage } from './postgres-blob-storage';

/**
 * Decide qué proveedor de almacenamiento se usa.
 *
 * La regla es una sola variable: `STORAGE_DRIVER` (`postgres` por defecto,
 * `gcs` para activar el bucket). Se resuelve en `useFactory` porque depende de
 * la configuración, y el resto del código solo conoce `BlobStorage`.
 *
 * ⚠️ **El proveedor GCS está escrito pero no conectado.** En desarrollo y en
 * CI `STORAGE_DRIVER` no está definido, así que siempre se elige Postgres. El
 * día que haya bucket y credenciales, basta con definir la variable — no se
 * toca ni una línea del servicio de adjuntos.
 */
@Module({
  providers: [
    {
      provide: BLOB_STORAGE,
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService, prisma: PrismaService) => {
        const driver = config.get<string>('STORAGE_DRIVER') ?? 'postgres';
        if (driver === 'gcs') return new GcsBlobStorage(config);
        return new PostgresBlobStorage(prisma, config);
      },
    },
  ],
  exports: [BLOB_STORAGE],
})
export class BlobStorageModule {}
