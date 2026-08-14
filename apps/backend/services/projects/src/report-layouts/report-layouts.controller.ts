import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { GetReportLayoutDto, SaveReportLayoutDto } from '@praxis/contracts';

import { ReportLayoutsService } from './report-layouts.service';

/**
 * ⚠️ **No comprueba permisos.** Lo hizo el gateway contra el `projectId` de la
 * ruta, como en el resto de comandos internos.
 *
 * Aquí hay una segunda línea que sí importa y que el gateway no puede saltarse:
 * el `userId` sale del **token**, nunca del cuerpo. Si viniera del cuerpo,
 * `canViewReports` bastaría para leer y reescribir el lienzo de cualquier
 * compañero — que es exactamente la trampa que evita el servicio de
 * conversaciones del asistente comprobando además de quién es el hilo.
 */
@Controller()
export class ReportLayoutsController {
  constructor(private readonly layouts: ReportLayoutsService) {}

  @MessagePattern({ cmd: 'report_layout_get' })
  get(@Payload() dto: GetReportLayoutDto) {
    return this.layouts.get(dto);
  }

  @MessagePattern({ cmd: 'report_layout_save' })
  save(@Payload() dto: SaveReportLayoutDto) {
    return this.layouts.save(dto);
  }
}
