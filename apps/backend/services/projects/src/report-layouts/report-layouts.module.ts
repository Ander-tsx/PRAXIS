import { Module } from '@nestjs/common';
import { ReportLayoutsController } from './report-layouts.controller';
import { ReportLayoutsService } from './report-layouts.service';

/**
 * El lienzo de Análisis. Módulo propio y no un añadido a `ProjectsModule`
 * porque no comparte nada con él salvo la tabla vecina: son preferencias de una
 * persona, no el proyecto.
 *
 * No se exporta el servicio: nadie de dentro del servicio lo necesita, y el
 * borrado del proyecto se lo lleva por la clave foránea, sin código.
 */
@Module({
  controllers: [ReportLayoutsController],
  providers: [ReportLayoutsService],
})
export class ReportLayoutsModule {}
