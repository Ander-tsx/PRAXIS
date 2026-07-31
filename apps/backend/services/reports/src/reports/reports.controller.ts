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
