import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { ReportFilters } from '@praxis/contracts';

import { ReportsService } from './reports.service';

/**
 * ⚠️ **Ninguna comprueba permisos.** Lo hizo el gateway contra el `projectId` de
 * la ruta, igual que en el resto de comandos internos. Este servicio no tiene
 * forma de comprobar nada: no conoce a los usuarios ni a los roles.
 */
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * ⚠️ **`filtros` viaja igual en los ocho comandos y llega ya validado.** El
   * gateway comprobó las formas y que el tramo no sea infinito; aquí no se
   * vuelve a mirar, como con todo lo demás que entra por TCP.
   *
   * Lo que sí pasa aquí es que **entra en la clave de caché**: sin eso, quien
   * filtra dejaría su resultado guardado bajo la clave de quien no filtra. Ver
   * `claveDeFiltros`.
   */
  @MessagePattern({ cmd: 'report_snapshot' })
  snapshot(@Payload() dto: { projectId: string; filtros?: ReportFilters }) {
    return this.reports.snapshot(dto.projectId, dto.filtros);
  }

  @MessagePattern({ cmd: 'report_cycle_time' })
  cycleTime(@Payload() dto: { projectId: string; days?: number; filtros?: ReportFilters }) {
    return this.reports.cycleTime(dto.projectId, dto.days, dto.filtros);
  }

  @MessagePattern({ cmd: 'report_flow' })
  flow(@Payload() dto: { projectId: string; days?: number; filtros?: ReportFilters }) {
    return this.reports.flow(dto.projectId, dto.days, dto.filtros);
  }

  @MessagePattern({ cmd: 'report_forecast' })
  forecast(@Payload() dto: { projectId: string; days?: number; filtros?: ReportFilters }) {
    return this.reports.forecast(dto.projectId, dto.days, dto.filtros);
  }

  @MessagePattern({ cmd: 'report_people' })
  people(@Payload() dto: { projectId: string; filtros?: ReportFilters }) {
    return this.reports.people(dto.projectId, dto.filtros);
  }

  /** Cierres y entradas de esta semana, con la anterior al lado. */
  @MessagePattern({ cmd: 'report_weekly' })
  weekly(@Payload() dto: { projectId: string; weeks?: number; filtros?: ReportFilters }) {
    return this.reports.weekly(dto.projectId, dto.weeks, dto.filtros);
  }

  /** Abiertas que llevan `days` sin cambiar de columna. */
  @MessagePattern({ cmd: 'report_blocked' })
  blocked(@Payload() dto: { projectId: string; days?: number; filtros?: ReportFilters }) {
    return this.reports.blocked(dto.projectId, dto.days, dto.filtros);
  }

  /**
   * Varios informes en una respuesta. Ver `ReportsService.bundle`.
   *
   * ⚠️ `incluir` llega **ya validado** contra el conjunto cerrado por el DTO del
   * gateway; aquí se vuelve a filtrar contra el mapa de cálculos porque este
   * comando también es alcanzable por TCP sin pasar por él.
   */
  @MessagePattern({ cmd: 'report_bundle' })
  bundle(
    @Payload()
    dto: {
      projectId: string;
      incluir: string[];
      days?: number;
      weeks?: number;
      filtros?: ReportFilters;
    },
  ) {
    return this.reports.bundle(dto.projectId, dto.incluir ?? [], {
      days: dto.days,
      weeks: dto.weeks,
      filtros: dto.filtros,
    });
  }

  /**
   * La cartera. `projectIds` llega ya filtrado por `canViewReports`.
   */
  @MessagePattern({ cmd: 'report_portfolio' })
  portfolio(@Payload() dto: { projectIds: string[]; dias?: number }) {
    return this.reports.portfolio(dto.projectIds ?? [], dto.dias);
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
