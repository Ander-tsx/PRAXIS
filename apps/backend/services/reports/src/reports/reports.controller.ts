import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';

import { ReportsService } from './reports.service';

/**
 * ⚠️ **Ninguna comprueba permisos.** Lo hizo el gateway contra el `projectId` de
 * la ruta, igual que en el resto de comandos internos. Este servicio no tiene
 * forma de comprobar nada: no conoce a los usuarios ni a los roles.
 */
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @MessagePattern({ cmd: 'report_snapshot' })
  snapshot(@Payload() dto: { projectId: string }) {
    return this.reports.snapshot(dto.projectId);
  }

  @MessagePattern({ cmd: 'report_cycle_time' })
  cycleTime(@Payload() dto: { projectId: string; days?: number }) {
    return this.reports.cycleTime(dto.projectId, dto.days);
  }

  @MessagePattern({ cmd: 'report_flow' })
  flow(@Payload() dto: { projectId: string; days?: number }) {
    return this.reports.flow(dto.projectId, dto.days);
  }

  @MessagePattern({ cmd: 'report_forecast' })
  forecast(@Payload() dto: { projectId: string; days?: number }) {
    return this.reports.forecast(dto.projectId, dto.days);
  }

  @MessagePattern({ cmd: 'report_people' })
  people(@Payload() dto: { projectId: string }) {
    return this.reports.people(dto.projectId);
  }

  /** Cierres y entradas de esta semana, con la anterior al lado. */
  @MessagePattern({ cmd: 'report_weekly' })
  weekly(@Payload() dto: { projectId: string; weeks?: number }) {
    return this.reports.weekly(dto.projectId, dto.weeks);
  }

  /** Abiertas que llevan `days` sin cambiar de columna. */
  @MessagePattern({ cmd: 'report_blocked' })
  blocked(@Payload() dto: { projectId: string; days?: number }) {
    return this.reports.blocked(dto.projectId, dto.days);
  }

  /**
   * Varios informes en una respuesta. Ver `ReportsService.bundle`.
   *
   * ⚠️ `incluir` llega **ya validado** contra el conjunto cerrado por el DTO del
   * gateway; aquí se vuelve a filtrar contra el mapa de cálculos porque este
   * comando también es alcanzable por TCP sin pasar por él.
   */
  @MessagePattern({ cmd: 'report_bundle' })
  bundle(@Payload() dto: { projectId: string; incluir: string[]; days?: number; weeks?: number }) {
    return this.reports.bundle(dto.projectId, dto.incluir ?? [], {
      days: dto.days,
      weeks: dto.weeks,
    });
  }

  /**
   * El contexto que lee el asistente. Lo consume `assistant-service`.
   *
   * ⚠️ `incluirPersonas` **no es una opción de formato**: es la línea de
   * `canViewReports`. Lo decide el gateway, que es el único que sabe de
   * permisos; aquí llega ya resuelto, como todo lo demás.
   */
  @MessagePattern({ cmd: 'report_briefing' })
  briefing(@Payload() dto: { projectId: string; incluirPersonas?: boolean }) {
    return this.reports.briefing(dto.projectId, dto.incluirPersonas === true);
  }
}
