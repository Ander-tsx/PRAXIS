import { Module } from '@nestjs/common';
import { AdminActivityController } from './admin-activity.controller';
import { AdminActivityService } from './admin-activity.service';

/**
 * Módulo aparte de `PermissionsModule` aunque comparta base de datos.
 *
 * Los roles y el registro de actividad no tienen nada que ver entre sí: uno
 * decide quién puede, el otro cuenta qué se hizo. Comparten servicio porque
 * comparten schema y porque este es la autoridad de plataforma, no porque sean
 * el mismo dominio.
 *
 * No importa `RedisModule`: el registro no se cachea. Ver `AdminActivityService`.
 */
@Module({
  controllers: [AdminActivityController],
  providers: [AdminActivityService],
})
export class AdminActivityModule {}
