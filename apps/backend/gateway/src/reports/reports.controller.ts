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
import { ProjectPermission, ReportBundleQueryDto } from '@praxis/contracts';
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
  constructor(@Inject('REPORTS_SERVICE') private readonly reportsClient: ClientProxy) {}

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

  /** Lo mismo para la serie semanal: menos de 2 no compara nada, más de 52 sobra. */
  private semanas(weeks?: string): number | undefined {
    if (weeks === undefined) return undefined;
    const n = Number(weeks);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(Math.max(Math.trunc(n), 2), 52);
  }

  /**
   * Varios informes en **una** petición.
   *
   * ## Por qué existe, con el coste delante
   *
   * La pantalla de Análisis pinta hasta siete informes, y los pedía en siete
   * peticiones. El ida y vuelta era lo de menos: **cada una pasa por
   * `ProjectPermissionGuard`**, que resuelve los permisos efectivos preguntando
   * a projects-service por TCP. Siete informes eran siete resoluciones de
   * permisos idénticas para pintar una sola pantalla, más siete travesías del
   * proxy de la zona.
   *
   * Ahora: una petición, un guard, una resolución. Los cálculos siguen yendo en
   * paralelo dentro de reports-service y cada uno conserva su caché de 60 s, así
   * que lo que se ahorra es el andamiaje.
   *
   * ⚠️ **Las siete rutas sueltas se quedan.** No son deuda: la skill de voz y
   * cualquier otro cliente piden un informe concreto, y un endpoint que devuelve
   * un objeto con una sola clave es peor API que el que devuelve el informe. Lo
   * que se colapsa es el caso de «pintar el lienzo», que es el que pedía siete.
   *
   * ⚠️ **Un informe que falla vuelve como `null`, no tumba el resto.** Es la
   * misma degradación que tenía la pantalla pidiéndolos uno a uno; agrupar las
   * peticiones no puede significar agrupar los fallos.
   */
  @Get()
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Varios informes del proyecto en una sola respuesta' })
  @ApiQuery({ name: 'include', required: false, description: 'Informes separados por comas' })
  @ApiQuery({ name: 'days', required: false })
  @ApiQuery({ name: 'weeks', required: false })
  @ApiResponse({
    status: 200,
    description: 'Solo las claves pedidas. Una a `null` es «se pidió y no se pudo»',
  })
  bundle(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ReportBundleQueryDto,
  ) {
    return firstValueFrom(
      this.reportsClient.send(
        { cmd: 'report_bundle' },
        {
          projectId,
          incluir: query.include ?? [],
          days: this.ventana(query.days),
          weeks: this.semanas(query.weeks),
        },
      ),
    );
  }

  @Get('snapshot')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({
    summary: 'Estado actual del proyecto. Es el único informe que no necesita historial',
  })
  @ApiResponse({ status: 200, description: 'Instantánea del proyecto' })
  snapshot(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return firstValueFrom(this.reportsClient.send({ cmd: 'report_snapshot' }, { projectId }));
  }

  @Get('flow')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Flujo acumulado: cuántas tareas hay en cada columna cada día' })
  @ApiQuery({ name: 'days', required: false, description: 'Días de historial (1–365)' })
  flow(@Param('projectId', ParseUUIDPipe) projectId: string, @Query('days') days?: string) {
    return firstValueFrom(
      this.reportsClient.send({ cmd: 'report_flow' }, { projectId, days: this.ventana(days) }),
    );
  }

  @Get('cycle-time')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Tiempos de entrega y de ciclo, en percentiles 50 y 85' })
  @ApiQuery({ name: 'days', required: false })
  cycleTime(@Param('projectId', ParseUUIDPipe) projectId: string, @Query('days') days?: string) {
    return firstValueFrom(
      this.reportsClient.send(
        { cmd: 'report_cycle_time' },
        { projectId, days: this.ventana(days) },
      ),
    );
  }

  @Get('forecast')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({
    summary: 'Cuándo estaría vacío el tablero, por simulación sobre el ritmo observado',
  })
  @ApiResponse({
    status: 200,
    description:
      'Con poco historial devuelve `prediccion: null` y cuánto falta, en vez de un número inventado',
  })
  @ApiQuery({ name: 'days', required: false })
  forecast(@Param('projectId', ParseUUIDPipe) projectId: string, @Query('days') days?: string) {
    return firstValueFrom(
      this.reportsClient.send({ cmd: 'report_forecast' }, { projectId, days: this.ventana(days) }),
    );
  }

  /**
   * Cómo fue la semana, con la anterior al lado.
   *
   * Existe porque el flujo acumulado **no contesta a esto**: aquel dice dónde
   * está el trabajo cada día, no cuánto se cerró en un tramo. Y un total suelto
   * —«5 tareas»— no dice si eso es bueno; la comparación es el informe.
   *
   * ⚠️ La semana en curso está a medias, así que la respuesta trae también el
   * ritmo diario de las dos: comparar cuatro días contra siete completos sale
   * catastrófico siempre.
   */
  @Get('weekly')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Cierres y entradas por semana, con la anterior para comparar' })
  @ApiQuery({ name: 'weeks', required: false, description: 'Semanas de serie (2–52)' })
  weekly(@Param('projectId', ParseUUIDPipe) projectId: string, @Query('weeks') weeks?: string) {
    return firstValueFrom(
      this.reportsClient.send({ cmd: 'report_weekly' }, { projectId, weeks: this.semanas(weeks) }),
    );
  }

  /**
   * Lo que está parado.
   *
   * No hay ningún estado «bloqueada» en el modelo y no se inventa: son las
   * abiertas que llevan `days` sin cambiar de columna, deducido del historial.
   * `updatedAt` no valdría —lo pisa cualquier edición— por el mismo motivo por
   * el que el historial guarda `columnId` y no `status`.
   */
  @Get('blocked')
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Tareas abiertas que llevan días sin moverse de columna' })
  @ApiQuery({ name: 'days', required: false, description: 'Umbral en días (1–365). Por defecto 7' })
  @ApiResponse({
    status: 200,
    description: 'Las anteriores a la captura del historial vienen marcadas con `sinHistorial`',
  })
  blocked(@Param('projectId', ParseUUIDPipe) projectId: string, @Query('days') days?: string) {
    return firstValueFrom(
      this.reportsClient.send({ cmd: 'report_blocked' }, { projectId, days: this.ventana(days) }),
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
  people(@Param('projectId', ParseUUIDPipe) projectId: string, @Request() _req: Express.Request) {
    return firstValueFrom(this.reportsClient.send({ cmd: 'report_people' }, { projectId }));
  }
}
