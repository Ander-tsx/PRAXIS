import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProjectPermission } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

/**
 * Reportes de un proyecto.
 *
 * Todas las rutas cuelgan de `/projects/:projectId/...`, y eso no es cosmético:
 * `ProjectPermissionGuard` resuelve el `projectId` directamente de `params`, así
 * que **no hay que tocar el guard ni apuntar este controlador en ninguna lista**
 * —al contrario que los de tarea, que cuelgan de `/tasks/:id` y necesitan estar
 * en `TASK_CONTROLLERS` para que el guard sepa resolverles el proyecto.
 *
 * ### La línea de permisos
 *
 * | Ruta | Permiso | Por qué |
 * |---|---|---|
 * | Todo lo agregado | `canViewProject` | No nombra a nadie: es el estado del trabajo |
 * | `/people` | `canViewReports` | Desglosa por persona |
 *
 * Los números **propios** no están aquí: van en `/me/reports`, sin permiso, por
 * el mismo motivo que `/me/tasks` — no hay proyecto en la ruta contra el que
 * comprobar nada, y el usuario sale del token.
 */
@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/reports')
export class ReportsController {
  constructor(
    @Inject('REPORTS_SERVICE') private readonly reportsClient: ClientProxy,
  ) {}

  /**
   * Cuántos días de historial mira un informe.
   *
   * Se acota en el gateway y no en el servicio para que un `?days=100000` no
   * convierta una consulta barata en un escaneo de la tabla entera.
   */
  private ventana(days?: string): number | undefined {
    if (days === undefined) return undefined;
    const n = Number(days);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(Math.max(Math.trunc(n), 1), 365);
  }

  @Get('snapshot')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({
    summary: 'Estado actual del proyecto. Es el único informe que no necesita historial',
  })
  @ApiResponse({ status: 200, description: 'Instantánea del proyecto' })
  snapshot(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return firstValueFrom(
      this.reportsClient.send({ cmd: 'report_snapshot' }, { projectId }),
    );
  }

  @Get('flow')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Flujo acumulado: cuántas tareas hay en cada columna cada día' })
  @ApiQuery({ name: 'days', required: false, description: 'Días de historial (1–365)' })
  flow(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('days') days?: string,
  ) {
    return firstValueFrom(
      this.reportsClient.send({ cmd: 'report_flow' }, { projectId, days: this.ventana(days) }),
    );
  }

  @Get('cycle-time')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({ summary: 'Tiempos de entrega y de ciclo, en percentiles 50 y 85' })
  @ApiQuery({ name: 'days', required: false })
  cycleTime(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('days') days?: string,
  ) {
    return firstValueFrom(
      this.reportsClient.send(
        { cmd: 'report_cycle_time' },
        { projectId, days: this.ventana(days) },
      ),
    );
  }

  @Get('forecast')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_PROJECT)
  @ApiOperation({
    summary: 'Cuándo estaría vacío el tablero, por simulación sobre el ritmo observado',
  })
  @ApiResponse({
    status: 200,
    description:
      'Con poco historial devuelve `prediccion: null` y cuánto falta, en vez de un número inventado',
  })
  @ApiQuery({ name: 'days', required: false })
  forecast(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('days') days?: string,
  ) {
    return firstValueFrom(
      this.reportsClient.send(
        { cmd: 'report_forecast' },
        { projectId, days: this.ventana(days) },
      ),
    );
  }

  /**
   * Carga y flujo por persona.
   *
   * El único que pide `canViewReports`. Se enseña como reparto, no como
   * clasificación: no devuelve ninguna medida que ordene a la gente por
   * «productividad», porque estos datos no saben de dificultad ni de contexto y
   * un número así se acaba leyendo como una nota.
   */
  @Get('people')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Carga y flujo por persona (requiere canViewReports)' })
  @ApiResponse({ status: 403, description: 'Sin canViewReports' })
  people(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Request() _req: Express.Request,
  ) {
    return firstValueFrom(
      this.reportsClient.send({ cmd: 'report_people' }, { projectId }),
    );
  }
}
