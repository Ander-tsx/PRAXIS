import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProjectPermission, SaveReportLayoutBodyDto } from '@praxis/contracts';
import { firstValueFrom } from 'rxjs';
import { JwtGuard } from '../auth/jwt.guard';
import { RequireProjectPermission } from '../common/decorators/require-project-permission.decorator';
import { ProjectPermissionGuard } from '../common/guards/project-permission.guard';

/**
 * El lienzo configurable de Análisis.
 *
 * ## Dos cosas que se salen del patrón de este directorio
 *
 * **1. No habla con `reports-service`.** Es el único par de rutas bajo
 * `/projects/:projectId/reports` que va a `PROJECTS_SERVICE`, y no es un
 * descuido: `reports-service` no tiene base de datos a propósito (§25.6) y el
 * lienzo es lo único de esta pantalla que hay que guardar. El cliente ya estaba
 * registrado en `ReportsModule` —lo necesita `ProjectPermissionGuard`— así que
 * no añade ninguna dependencia nueva.
 *
 * **2. El lienzo es de la persona, no del proyecto.** El `userId` sale del
 * **token**, nunca de la ruta ni del cuerpo. Si se pudiera elegir, cualquiera
 * con `canViewReports` podría leer y reescribir el lienzo de un compañero, que
 * es la misma trampa que el asistente evita comprobando de quién es cada
 * conversación además de mirar el permiso del proyecto.
 *
 * ## El permiso
 *
 * `canViewReports` en las dos, igual que sus siete hermanas desde §29.1. Y no
 * hace falta ninguno más para escribir: nadie puede tocar el lienzo de nadie, así
 * que reorganizar el propio es exactamente tan sensible como mirarlo. Un lienzo
 * **por proyecto** sí habría necesitado una segunda línea —leer con
 * `canViewReports`, reorganizar con `canEditProject`— y esa es buena parte de lo
 * que se ahorró al decidir el modelo.
 */
@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtGuard, ProjectPermissionGuard)
@Controller('projects/:projectId/reports/layout')
export class ReportLayoutController {
  constructor(@Inject('PROJECTS_SERVICE') private readonly projectsClient: ClientProxy) {}

  @Get()
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Mi lienzo de Análisis en este proyecto' })
  @ApiResponse({
    status: 200,
    description:
      'Quien nunca lo ha tocado recibe `{ widgets: [], actualizadoEn: null }`, no un 404: ' +
      'el lienzo vacío es el punto de partida, no la ausencia de algo',
  })
  get(@Param('projectId', ParseUUIDPipe) projectId: string, @Request() req: Express.Request) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'report_layout_get' },
        { userId: req.user!.userId, projectId },
      ),
    );
  }

  /**
   * Guarda el lienzo entero.
   *
   * ⚠️ `@Body()` va tipado con `SaveReportLayoutBodyDto`, la clase real. Con un
   * `Omit<SaveReportLayoutDto, 'userId' | 'projectId'>` —que es la forma
   * aparentemente correcta de decir «el cuerpo sin lo que pone el gateway»— en
   * runtime el tipo es `Object`, el `ValidationPipe` no encuentra metadatos y la
   * ruta acepta cualquier cosa y responde 200 sin guardar lo que dice. Le pasaba
   * a 22 de los 28 endpoints del gateway.
   */
  @Put()
  @RequireProjectPermission(ProjectPermission.CAN_VIEW_REPORTS)
  @ApiOperation({ summary: 'Guardar mi lienzo de Análisis (se manda entero, no un parche)' })
  @ApiResponse({ status: 200, description: 'El lienzo guardado' })
  @ApiResponse({
    status: 400,
    description:
      'Un widget fuera del catálogo, o una combinación de gráfico que no se puede dibujar ' +
      '(una serie temporal pedida como dona, un rango sobre una foto del momento)',
  })
  save(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: SaveReportLayoutBodyDto,
    @Request() req: Express.Request,
  ) {
    return firstValueFrom(
      this.projectsClient.send(
        { cmd: 'report_layout_save' },
        { userId: req.user!.userId, projectId, widgets: body.widgets },
      ),
    );
  }
}
